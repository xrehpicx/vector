import { mutation, query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import {
  agentInteractionPolicyValidator,
  agentWakeModeValidator,
} from '../_shared/collaboration';
import {
  agentPermissionModeValidator,
  agentProviderValidator,
  agentThinkingLevelValidator,
} from '../_shared/agentBridge';
import { PERMISSIONS } from '../_shared/permissions';
import {
  DEVICE_ONLINE_WINDOW_MS,
  MAX_AGENTS_PER_CHANNEL,
  MAX_CHANNELS,
  boundedLimit,
  cleanOptional,
  cleanRequired,
  getAgentChannelMembership,
  hasAgentControlAccess,
  hasAgentInteractionAccess,
  normalizeAgentHandle,
  requireAgentEditor,
  requireChannelAccess,
  requireChannelManager,
  requireOrgContext,
  toUserSummary,
  validateDeviceWorkspace,
} from './helpers';
import {
  agentAccessGrantValidator,
  agentChannelMembershipValidator,
  registeredAgentValidator,
  registeredAgentViewValidator,
  userSummaryValidator,
} from './validators';

function requireCollaborationProvider(
  provider: Doc<'registeredAgents'>['provider'],
) {
  if (provider !== 'codex' && provider !== 'claude_code') {
    throw new ConvexError('COLLABORATION_PROVIDER_NOT_SUPPORTED');
  }
  return provider;
}

function requireSafePermissionMode(
  permissionMode: Doc<'registeredAgents'>['permissionMode'] | undefined,
) {
  const mode = permissionMode ?? 'ask';
  if (mode === 'bypass') {
    throw new ConvexError('COLLABORATION_BYPASS_NOT_ALLOWED');
  }
  return mode;
}

async function hydrateAgent(
  ctx: Parameters<typeof hasAgentInteractionAccess>[0],
  agent: Doc<'registeredAgents'>,
  viewerId: Doc<'users'>['_id'],
  now: number,
  channel?: Doc<'channels'>,
) {
  const [owner, device, workspace, canInteract, canControl] = await Promise.all(
    [
      ctx.db.get('users', agent.ownerUserId),
      ctx.db.get('agentDevices', agent.deviceId),
      ctx.db.get('deviceWorkspaces', agent.workspaceId),
      hasAgentInteractionAccess(ctx, agent, viewerId, channel),
      hasAgentControlAccess(ctx, agent, viewerId),
    ],
  );
  const connected =
    agent.lifecycleStatus === 'ready' &&
    device?.status === 'online' &&
    device.lastSeenAt >= now - DEVICE_ONLINE_WINDOW_MS &&
    workspace?.deviceId === agent.deviceId &&
    workspace.launchPolicy === 'allow_delegated';
  return {
    agent,
    owner: toUserSummary(owner),
    device: device
      ? {
          _id: device._id,
          displayName: device.displayName,
          status: device.status,
          lastSeenAt: device.lastSeenAt,
        }
      : null,
    workspace: workspace
      ? {
          _id: workspace._id,
          label: workspace.label,
          path: workspace.path,
          launchPolicy: workspace.launchPolicy,
        }
      : null,
    connected,
    canInteract,
    canControl,
  };
}

export const list = query({
  args: {
    orgSlug: v.string(),
    channelId: v.optional(v.id('channels')),
    now: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(registeredAgentViewValidator),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.AGENT_VIEW,
    );
    let channel: Doc<'channels'> | undefined;
    if (args.channelId) {
      const access = await requireChannelAccess(ctx, args.channelId, {
        includeArchived: true,
      });
      if (access.channel.organizationId !== organization._id) {
        throw new ConvexError('CHANNEL_ORGANIZATION_MISMATCH');
      }
      channel = access.channel;
    }
    const agents = await ctx.db
      .query('registeredAgents')
      .withIndex('by_organization_id', q =>
        q.eq('organizationId', organization._id),
      )
      .take(boundedLimit(args.limit, 100, MAX_CHANNELS));
    return await Promise.all(
      agents.map(agent => hydrateAgent(ctx, agent, userId, args.now, channel)),
    );
  },
});

export const get = query({
  args: {
    agentId: v.id('registeredAgents'),
    channelId: v.optional(v.id('channels')),
    now: v.number(),
  },
  returns: registeredAgentViewValidator,
  handler: async (ctx, args) => {
    const agent = await ctx.db.get('registeredAgents', args.agentId);
    if (!agent) throw new ConvexError('AGENT_NOT_FOUND');
    const { userId } = await requireOrgContext(
      ctx,
      (await ctx.db.get('organizations', agent.organizationId))?.slug ?? '',
      PERMISSIONS.AGENT_VIEW,
    );
    let channel: Doc<'channels'> | undefined;
    if (args.channelId) {
      const access = await requireChannelAccess(ctx, args.channelId, {
        includeArchived: true,
      });
      if (access.channel.organizationId !== agent.organizationId) {
        throw new ConvexError('CHANNEL_ORGANIZATION_MISMATCH');
      }
      channel = access.channel;
    }
    return await hydrateAgent(ctx, agent, userId, args.now, channel);
  },
});

export const create = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    handle: v.string(),
    description: v.optional(v.string()),
    avatar: v.optional(v.string()),
    provider: agentProviderValidator,
    deviceId: v.id('agentDevices'),
    workspaceId: v.id('deviceWorkspaces'),
    defaultFolder: v.string(),
    model: v.optional(v.string()),
    permissionMode: v.optional(agentPermissionModeValidator),
    thinkingLevel: v.optional(agentThinkingLevelValidator),
    interactionPolicy: agentInteractionPolicyValidator,
  },
  returns: v.id('registeredAgents'),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.AGENT_CREATE,
    );
    const handle = normalizeAgentHandle(args.handle);
    const existing = await ctx.db
      .query('registeredAgents')
      .withIndex('by_organization_id_and_handle', q =>
        q.eq('organizationId', organization._id).eq('handle', handle),
      )
      .first();
    if (existing) throw new ConvexError('AGENT_HANDLE_TAKEN');
    const validated = await validateDeviceWorkspace(
      ctx,
      userId,
      organization._id,
      args.deviceId,
      args.workspaceId,
      args.defaultFolder,
    );
    const now = Date.now();
    return await ctx.db.insert('registeredAgents', {
      organizationId: organization._id,
      ownerUserId: userId,
      name: cleanRequired(args.name, 'AGENT_NAME', 80),
      handle,
      description: cleanOptional(args.description, 'AGENT_DESCRIPTION', 1_000),
      avatar: cleanOptional(args.avatar, 'AGENT_AVATAR', 2_000),
      provider: requireCollaborationProvider(args.provider),
      deviceId: args.deviceId,
      workspaceId: args.workspaceId,
      defaultFolder: validated.defaultFolder,
      model: cleanOptional(args.model, 'AGENT_MODEL', 160),
      permissionMode: requireSafePermissionMode(args.permissionMode),
      thinkingLevel: args.thinkingLevel,
      interactionPolicy: args.interactionPolicy,
      lifecycleStatus: 'ready',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    agentId: v.id('registeredAgents'),
    name: v.optional(v.string()),
    handle: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    avatar: v.optional(v.union(v.string(), v.null())),
    provider: v.optional(agentProviderValidator),
    deviceId: v.optional(v.id('agentDevices')),
    workspaceId: v.optional(v.id('deviceWorkspaces')),
    defaultFolder: v.optional(v.string()),
    model: v.optional(v.union(v.string(), v.null())),
    permissionMode: v.optional(agentPermissionModeValidator),
    thinkingLevel: v.optional(v.union(agentThinkingLevelValidator, v.null())),
    interactionPolicy: v.optional(agentInteractionPolicyValidator),
    lifecycleStatus: v.optional(
      v.union(v.literal('ready'), v.literal('paused')),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { agent } = await requireAgentEditor(ctx, args.agentId);
    const updates: Partial<Doc<'registeredAgents'>> = {
      updatedAt: Date.now(),
    };
    if (args.name !== undefined) {
      updates.name = cleanRequired(args.name, 'AGENT_NAME', 80);
    }
    if (args.handle !== undefined) {
      const handle = normalizeAgentHandle(args.handle);
      const existing = await ctx.db
        .query('registeredAgents')
        .withIndex('by_organization_id_and_handle', q =>
          q.eq('organizationId', agent.organizationId).eq('handle', handle),
        )
        .first();
      if (existing && existing._id !== agent._id) {
        throw new ConvexError('AGENT_HANDLE_TAKEN');
      }
      updates.handle = handle;
    }
    if (args.description !== undefined) {
      updates.description = cleanOptional(
        args.description,
        'AGENT_DESCRIPTION',
        1_000,
      );
    }
    if (args.avatar !== undefined) {
      updates.avatar = cleanOptional(args.avatar, 'AGENT_AVATAR', 2_000);
    }
    if (args.model !== undefined) {
      updates.model = cleanOptional(args.model, 'AGENT_MODEL', 160);
    }
    if (args.provider !== undefined) {
      updates.provider = requireCollaborationProvider(args.provider);
    }
    if (args.permissionMode !== undefined) {
      updates.permissionMode = requireSafePermissionMode(args.permissionMode);
    }
    if (args.thinkingLevel !== undefined) {
      updates.thinkingLevel = args.thinkingLevel ?? undefined;
    }
    if (args.interactionPolicy !== undefined) {
      updates.interactionPolicy = args.interactionPolicy;
    }
    if (args.lifecycleStatus !== undefined) {
      updates.lifecycleStatus = args.lifecycleStatus;
    }

    if (
      args.deviceId !== undefined ||
      args.workspaceId !== undefined ||
      args.defaultFolder !== undefined
    ) {
      const validated = await validateDeviceWorkspace(
        ctx,
        agent.ownerUserId,
        agent.organizationId,
        args.deviceId ?? agent.deviceId,
        args.workspaceId ?? agent.workspaceId,
        args.defaultFolder ?? agent.defaultFolder,
      );
      updates.deviceId = args.deviceId ?? agent.deviceId;
      updates.workspaceId = args.workspaceId ?? agent.workspaceId;
      updates.defaultFolder = validated.defaultFolder;
    }
    await ctx.db.patch('registeredAgents', agent._id, updates);
    return null;
  },
});

export const remove = mutation({
  args: { agentId: v.id('registeredAgents') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { agent } = await requireAgentEditor(ctx, args.agentId);
    const [message, run] = await Promise.all([
      ctx.db
        .query('channelMessages')
        .withIndex('by_author_agent_id_and_created_at', q =>
          q.eq('authorAgentId', agent._id),
        )
        .first(),
      ctx.db
        .query('collaborationAgentRuns')
        .withIndex('by_agent_id', q => q.eq('agentId', agent._id))
        .first(),
    ]);
    if (message || run) throw new ConvexError('AGENT_HAS_HISTORY');
    const [memberships, grants] = await Promise.all([
      ctx.db
        .query('agentChannelMemberships')
        .withIndex('by_agent_id', q => q.eq('agentId', agent._id))
        .take(MAX_CHANNELS),
      ctx.db
        .query('agentAccessGrants')
        .withIndex('by_agent_id', q => q.eq('agentId', agent._id))
        .take(MAX_CHANNELS),
    ]);
    for (const membership of memberships) {
      await ctx.db.delete('agentChannelMemberships', membership._id);
    }
    for (const grant of grants) {
      await ctx.db.delete('agentAccessGrants', grant._id);
    }
    await ctx.db.delete('registeredAgents', agent._id);
    return null;
  },
});

export const listChannelMemberships = query({
  args: {
    channelId: v.id('channels'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      membership: agentChannelMembershipValidator,
      agent: registeredAgentValidator,
      owner: v.union(userSummaryValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { channel } = await requireChannelAccess(ctx, args.channelId, {
      includeArchived: true,
    });
    await requireOrgContext(
      ctx,
      (await ctx.db.get('organizations', channel.organizationId))?.slug ?? '',
      PERMISSIONS.AGENT_VIEW,
    );
    const memberships = await ctx.db
      .query('agentChannelMemberships')
      .withIndex('by_channel_id', q => q.eq('channelId', args.channelId))
      .take(boundedLimit(args.limit, 50, MAX_AGENTS_PER_CHANNEL));
    const result = [];
    for (const membership of memberships) {
      const agent = await ctx.db.get('registeredAgents', membership.agentId);
      if (!agent || agent.organizationId !== channel.organizationId) continue;
      result.push({
        membership,
        agent,
        owner: toUserSummary(await ctx.db.get('users', agent.ownerUserId)),
      });
    }
    return result;
  },
});

export const addToChannel = mutation({
  args: {
    channelId: v.id('channels'),
    agentId: v.id('registeredAgents'),
    wakeMode: agentWakeModeValidator,
  },
  returns: v.id('agentChannelMemberships'),
  handler: async (ctx, args) => {
    const { userId, agent } = await requireAgentEditor(ctx, args.agentId);
    const channelAccess = await requireChannelAccess(ctx, args.channelId);
    const { channel } = channelAccess;
    if (!channelAccess.membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    const organization = await ctx.db.get(
      'organizations',
      channel.organizationId,
    );
    if (!organization) throw new ConvexError('ORGANIZATION_NOT_FOUND');
    await requireOrgContext(
      ctx,
      organization.slug,
      PERMISSIONS.CHANNEL_MESSAGE_SEND,
    );
    if (agent.organizationId !== channel.organizationId) {
      throw new ConvexError('AGENT_CHANNEL_ORGANIZATION_MISMATCH');
    }
    if (
      agent.ownerUserId !== userId ||
      args.wakeMode === 'every_message' ||
      channel.kind === 'announcement'
    ) {
      await requireChannelManager(ctx, channel._id);
    }
    const existing = await getAgentChannelMembership(
      ctx,
      channel._id,
      agent._id,
    );
    const now = Date.now();
    if (existing) {
      await ctx.db.patch('agentChannelMemberships', existing._id, {
        wakeMode: args.wakeMode,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert('agentChannelMemberships', {
      organizationId: channel.organizationId,
      channelId: channel._id,
      agentId: agent._id,
      addedByUserId: userId,
      wakeMode: args.wakeMode,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateChannelMembership = mutation({
  args: {
    channelId: v.id('channels'),
    agentId: v.id('registeredAgents'),
    wakeMode: agentWakeModeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, agent } = await requireAgentEditor(ctx, args.agentId);
    const channelAccess = await requireChannelAccess(ctx, args.channelId);
    const { channel } = channelAccess;
    if (!channelAccess.membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    if (agent.organizationId !== channel.organizationId) {
      throw new ConvexError('AGENT_CHANNEL_ORGANIZATION_MISMATCH');
    }
    const membership = await getAgentChannelMembership(
      ctx,
      args.channelId,
      args.agentId,
    );
    if (!membership) throw new ConvexError('AGENT_NOT_IN_CHANNEL');
    if (
      agent.ownerUserId !== userId ||
      args.wakeMode === 'every_message' ||
      channel.kind === 'announcement'
    ) {
      await requireChannelManager(ctx, channel._id);
    }
    await ctx.db.patch('agentChannelMemberships', membership._id, {
      wakeMode: args.wakeMode,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const removeFromChannel = mutation({
  args: {
    channelId: v.id('channels'),
    agentId: v.id('registeredAgents'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, agent } = await requireAgentEditor(ctx, args.agentId);
    const channelAccess = await requireChannelAccess(ctx, args.channelId, {
      includeArchived: true,
    });
    const { channel } = channelAccess;
    if (!channelAccess.membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    if (agent.organizationId !== channel.organizationId) {
      throw new ConvexError('AGENT_CHANNEL_ORGANIZATION_MISMATCH');
    }
    if (agent.ownerUserId !== userId) {
      await requireChannelManager(ctx, channel._id);
    }
    const membership = await getAgentChannelMembership(
      ctx,
      args.channelId,
      args.agentId,
    );
    if (membership) {
      await ctx.db.delete('agentChannelMemberships', membership._id);
    }
    return null;
  },
});

export const listAccessGrants = query({
  args: {
    agentId: v.id('registeredAgents'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      grant: agentAccessGrantValidator,
      user: v.union(userSummaryValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { agent } = await requireAgentEditor(ctx, args.agentId);
    const grants = await ctx.db
      .query('agentAccessGrants')
      .withIndex('by_agent_id', q => q.eq('agentId', agent._id))
      .take(boundedLimit(args.limit, 100, MAX_CHANNELS));
    return await Promise.all(
      grants.map(async grant => ({
        grant,
        user: toUserSummary(await ctx.db.get('users', grant.userId)),
      })),
    );
  },
});

export const setAccessGrant = mutation({
  args: {
    agentId: v.id('registeredAgents'),
    userId: v.id('users'),
    canInteract: v.boolean(),
    canControl: v.boolean(),
  },
  returns: v.id('agentAccessGrants'),
  handler: async (ctx, args) => {
    const { userId: grantedByUserId, agent } = await requireAgentEditor(
      ctx,
      args.agentId,
    );
    if (args.userId === agent.ownerUserId) {
      throw new ConvexError('AGENT_OWNER_ACCESS_IS_IMPLICIT');
    }
    const orgMember = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', agent.organizationId).eq('userId', args.userId),
      )
      .first();
    if (!orgMember) throw new ConvexError('AGENT_GRANTEE_NOT_IN_ORG');
    const existing = await ctx.db
      .query('agentAccessGrants')
      .withIndex('by_agent_id_and_user_id', q =>
        q.eq('agentId', agent._id).eq('userId', args.userId),
      )
      .first();
    if (existing) {
      await ctx.db.patch('agentAccessGrants', existing._id, {
        canInteract: args.canInteract,
        canControl: args.canControl,
        grantedByUserId,
      });
      return existing._id;
    }
    return await ctx.db.insert('agentAccessGrants', {
      organizationId: agent.organizationId,
      agentId: agent._id,
      userId: args.userId,
      canInteract: args.canInteract,
      canControl: args.canControl,
      grantedByUserId,
      createdAt: Date.now(),
    });
  },
});

export const removeAccessGrant = mutation({
  args: {
    agentId: v.id('registeredAgents'),
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { agent } = await requireAgentEditor(ctx, args.agentId);
    const grant = await ctx.db
      .query('agentAccessGrants')
      .withIndex('by_agent_id_and_user_id', q =>
        q.eq('agentId', agent._id).eq('userId', args.userId),
      )
      .first();
    if (grant) await ctx.db.delete('agentAccessGrants', grant._id);
    return null;
  },
});
