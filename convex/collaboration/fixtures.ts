import { mutation, type MutationCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { agentProviderValidator } from '../_shared/agentBridge';
import {
  MAX_FILE_SIZE,
  ensureChannelMembership,
  hasAgentControlAccess,
  normalizeAgentHandle,
  requireOrgContext,
  validateDeviceWorkspace,
} from './helpers';

const CONFIRMATION = 'CREATE_COLLABORATION_DEV_FIXTURE' as const;

async function ensureSyntheticUser(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  identity: {
    name: string;
    username: string;
    email: string;
  },
) {
  let user = await ctx.db
    .query('users')
    .withIndex('email', q => q.eq('email', identity.email))
    .first();
  if (!user) {
    const userId = await ctx.db.insert('users', identity);
    user = await ctx.db.get('users', userId);
  }
  if (!user) throw new ConvexError('FIXTURE_USER_CREATE_FAILED');
  const membership = await ctx.db
    .query('members')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', organizationId).eq('userId', user!._id),
    )
    .first();
  if (!membership) {
    await ctx.db.insert('members', {
      organizationId,
      userId: user._id,
      role: 'member',
    });
  }
  return user;
}

async function ensureFixtureMessage(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>;
    channelId: Id<'channels'>;
    authorUserId: Id<'users'>;
    body: string;
    clientMessageId: string;
    threadRootId?: Id<'channelMessages'>;
    replyToMessageId?: Id<'channelMessages'>;
  },
) {
  const existing = await ctx.db
    .query('channelMessages')
    .withIndex('by_channel_id_and_client_message_id', q =>
      q
        .eq('channelId', args.channelId)
        .eq('clientMessageId', args.clientMessageId),
    )
    .first();
  if (existing) return existing;
  const now = Date.now();
  const messageId = await ctx.db.insert('channelMessages', {
    organizationId: args.organizationId,
    channelId: args.channelId,
    actorKind: 'user',
    authorUserId: args.authorUserId,
    body: args.body,
    format: 'markdown',
    threadRootId: args.threadRootId,
    replyToMessageId: args.replyToMessageId,
    clientMessageId: args.clientMessageId,
    mentionedUserIds: [],
    mentionedAgentIds: [],
    replyCount: 0,
    createdAt: now,
  });
  const message = await ctx.db.get('channelMessages', messageId);
  if (!message) throw new ConvexError('FIXTURE_MESSAGE_CREATE_FAILED');
  return message;
}

export const createDevScenario = mutation({
  args: {
    orgSlug: v.string(),
    confirmation: v.literal(CONFIRMATION),
    storageId: v.optional(v.id('_storage')),
    storageName: v.optional(v.string()),
    deviceId: v.optional(v.id('agentDevices')),
    workspaceId: v.optional(v.id('deviceWorkspaces')),
    provider: v.optional(agentProviderValidator),
  },
  returns: v.object({
    channelId: v.id('channels'),
    syntheticUserIds: v.array(v.id('users')),
    messageIds: v.array(v.id('channelMessages')),
    attachmentId: v.optional(v.id('messageAttachments')),
    agentId: v.optional(v.id('registeredAgents')),
  }),
  handler: async (ctx, args) => {
    if (args.confirmation !== CONFIRMATION) {
      throw new ConvexError('FIXTURE_CONFIRMATION_REQUIRED');
    }
    const { userId, organization, membership } = await requireOrgContext(
      ctx,
      args.orgSlug,
    );
    if (membership.role !== 'owner') {
      throw new ConvexError('FIXTURE_REQUIRES_ORGANIZATION_OWNER');
    }
    if (Boolean(args.deviceId) !== Boolean(args.workspaceId)) {
      throw new ConvexError('FIXTURE_DEVICE_AND_WORKSPACE_REQUIRED_TOGETHER');
    }
    const fixtureKey = organization._id.slice(-8).toLowerCase();
    const [alex, sam] = await Promise.all([
      ensureSyntheticUser(ctx, organization._id, {
        name: 'Alex Fixture',
        username: `alex-fixture-${fixtureKey}`,
        email: `alex-fixture-${fixtureKey}@vector.invalid`,
      }),
      ensureSyntheticUser(ctx, organization._id, {
        name: 'Sam Fixture',
        username: `sam-fixture-${fixtureKey}`,
        email: `sam-fixture-${fixtureKey}@vector.invalid`,
      }),
    ]);

    let channel = await ctx.db
      .query('channels')
      .withIndex('by_organization_id_and_slug', q =>
        q
          .eq('organizationId', organization._id)
          .eq('slug', 'collaboration-lab'),
      )
      .first();
    const now = Date.now();
    if (!channel) {
      const channelId = await ctx.db.insert('channels', {
        organizationId: organization._id,
        kind: 'private',
        name: 'Collaboration Lab',
        slug: 'collaboration-lab',
        topic: 'Idempotent multi-user collaboration test scenarios',
        createdByUserId: userId,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });
      channel = await ctx.db.get('channels', channelId);
    }
    if (!channel) throw new ConvexError('FIXTURE_CHANNEL_CREATE_FAILED');
    await Promise.all([
      ensureChannelMembership(ctx, channel, userId, {
        role: 'owner',
        notificationMode: 'all',
      }),
      ensureChannelMembership(ctx, channel, alex._id, {
        notificationMode: 'all',
      }),
      ensureChannelMembership(ctx, channel, sam._id, {
        notificationMode: 'all',
      }),
    ]);

    const welcome = await ensureFixtureMessage(ctx, {
      organizationId: organization._id,
      channelId: channel._id,
      authorUserId: alex._id,
      body: 'Welcome to the collaboration fixture. Use this thread to review the launch checklist.',
      clientMessageId: 'fixture:v1:welcome',
    });
    const reply = await ensureFixtureMessage(ctx, {
      organizationId: organization._id,
      channelId: channel._id,
      authorUserId: sam._id,
      body: 'I added the channel privacy and agent-permission checks.',
      clientMessageId: 'fixture:v1:thread-reply',
      threadRootId: welcome._id,
      replyToMessageId: welcome._id,
    });
    const media = await ensureFixtureMessage(ctx, {
      organizationId: organization._id,
      channelId: channel._id,
      authorUserId: userId,
      body: 'Fixture media attachment',
      clientMessageId: 'fixture:v1:media',
    });
    if (welcome.replyCount < 1) {
      await ctx.db.patch('channelMessages', welcome._id, {
        replyCount: 1,
        lastReplyAt: reply.createdAt,
      });
    }
    await ctx.db.patch('channels', channel._id, {
      lastMessageId: media._id,
      lastMessageAt: media.createdAt,
      updatedAt: now,
    });

    const reaction = await ctx.db
      .query('messageReactions')
      .withIndex('by_message_id_and_user_id_and_emoji', q =>
        q.eq('messageId', welcome._id).eq('userId', sam._id).eq('emoji', '👍'),
      )
      .first();
    if (!reaction) {
      await ctx.db.insert('messageReactions', {
        organizationId: organization._id,
        channelId: channel._id,
        messageId: welcome._id,
        userId: sam._id,
        emoji: '👍',
        createdAt: now,
      });
    }
    const pin = await ctx.db
      .query('messagePins')
      .withIndex('by_message_id', q => q.eq('messageId', welcome._id))
      .first();
    if (!pin) {
      await ctx.db.insert('messagePins', {
        organizationId: organization._id,
        channelId: channel._id,
        messageId: welcome._id,
        pinnedByUserId: userId,
        createdAt: now,
      });
    }

    let attachmentId: Id<'messageAttachments'> | undefined;
    if (args.storageId) {
      const metadata = await ctx.db.system.get('_storage', args.storageId);
      if (metadata && metadata.size <= MAX_FILE_SIZE) {
        const existingAttachment = await ctx.db
          .query('messageAttachments')
          .withIndex('by_storage_id', q => q.eq('storageId', args.storageId!))
          .first();
        if (existingAttachment) {
          attachmentId = existingAttachment._id;
        } else {
          const contentType =
            metadata.contentType?.toLowerCase() ?? 'application/octet-stream';
          const kind = contentType.startsWith('image/')
            ? ('image' as const)
            : contentType.startsWith('video/')
              ? ('video' as const)
              : contentType.startsWith('audio/')
                ? ('audio' as const)
                : ('file' as const);
          attachmentId = await ctx.db.insert('messageAttachments', {
            organizationId: organization._id,
            channelId: channel._id,
            messageId: media._id,
            storageId: args.storageId,
            kind,
            name:
              args.storageName?.trim().slice(0, 255) || 'fixture-attachment',
            contentType,
            size: metadata.size,
            createdAt: now,
          });
        }
      }
    }

    let agentId: Id<'registeredAgents'> | undefined;
    if (args.deviceId && args.workspaceId) {
      const provider = args.provider ?? 'codex';
      if (provider !== 'codex' && provider !== 'claude_code') {
        throw new ConvexError('COLLABORATION_PROVIDER_NOT_SUPPORTED');
      }
      const workspace = await ctx.db.get('deviceWorkspaces', args.workspaceId);
      if (!workspace) throw new ConvexError('INVALID_AGENT_WORKSPACE');
      const validated = await validateDeviceWorkspace(
        ctx,
        userId,
        organization._id,
        args.deviceId,
        args.workspaceId,
        workspace.path,
      );
      const handle = normalizeAgentHandle('fixture-agent');
      let agent = await ctx.db
        .query('registeredAgents')
        .withIndex('by_organization_id_and_handle', q =>
          q.eq('organizationId', organization._id).eq('handle', handle),
        )
        .first();
      if (!agent) {
        agentId = await ctx.db.insert('registeredAgents', {
          organizationId: organization._id,
          ownerUserId: userId,
          name: 'Fixture Agent',
          handle,
          description: 'Synthetic agent for collaboration scenario testing',
          provider,
          deviceId: args.deviceId,
          workspaceId: args.workspaceId,
          defaultFolder: validated.defaultFolder,
          permissionMode: 'ask',
          interactionPolicy: 'channel_members',
          lifecycleStatus: 'ready',
          createdAt: now,
          updatedAt: now,
        });
        agent = await ctx.db.get('registeredAgents', agentId);
      } else {
        agentId = agent._id;
      }
      if (!agent) throw new ConvexError('FIXTURE_AGENT_CREATE_FAILED');
      if (!(await hasAgentControlAccess(ctx, agent, userId))) {
        throw new ConvexError(
          'FIXTURE_AGENT_OWNER_CONTROL_REGRESSION_ASSERTION_FAILED',
        );
      }
      const agentMembership = await ctx.db
        .query('agentChannelMemberships')
        .withIndex('by_channel_id_and_agent_id', q =>
          q.eq('channelId', channel!._id).eq('agentId', agent!._id),
        )
        .first();
      if (!agentMembership) {
        await ctx.db.insert('agentChannelMemberships', {
          organizationId: organization._id,
          channelId: channel._id,
          agentId: agent._id,
          addedByUserId: userId,
          wakeMode: 'mentions',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return {
      channelId: channel._id,
      syntheticUserIds: [alex._id, sam._id],
      messageIds: [welcome._id, reply._id, media._id],
      attachmentId,
      agentId,
    };
  },
});
