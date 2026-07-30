import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import {
  collaborationEntityTypeValidator,
  messageAttachmentInputValidator,
  messageFormatValidator,
} from '../_shared/collaboration';
import { PERMISSIONS } from '../_shared/permissions';
import { canViewDocument, canViewIssue, canViewProject } from '../access';
import { canViewRequest } from '../requests/lib';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_AGENTS_PER_CHANNEL,
  MAX_FILE_SIZE,
  MAX_MESSAGES,
  MAX_REACTIONS_PER_MESSAGE,
  boundedLimit,
  canUserAccessChannel,
  cleanRequired,
  createAutomaticRunsForMessage,
  ensureChannelMembership,
  getChannelMembership,
  requireChannelAccess,
  requireChannelManager,
  requireChannelPermission,
  requireMessageAccess,
  requireOrgContext,
  toUserSummary,
  validateMentionIds,
} from './helpers';
import {
  attachmentValidator,
  channelValidator,
  entityLinkViewValidator,
  messageViewValidator,
  priorityInboxItemValidator,
} from './validators';

const attachmentUrlResultValidator = v.union(
  v.object({
    attachment: attachmentValidator,
    url: v.string(),
  }),
  v.null(),
);

function validateBody(body: string, hasAttachments: boolean): string {
  const value = body.trim();
  if (!value && !hasAttachments) throw new ConvexError('MESSAGE_BODY_REQUIRED');
  if (value.length > 20_000) throw new ConvexError('MESSAGE_BODY_TOO_LONG');
  return value;
}

function validateClientMessageId(value: string | undefined) {
  if (value === undefined) return undefined;
  const id = cleanRequired(value, 'CLIENT_MESSAGE_ID', 128);
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new ConvexError('INVALID_CLIENT_MESSAGE_ID');
  }
  return id;
}

function validateEmoji(value: string) {
  const emoji = cleanRequired(value, 'EMOJI', 32);
  if (/\s/.test(emoji)) throw new ConvexError('INVALID_EMOJI');
  return emoji;
}

function validateAttachmentKind(
  kind: Doc<'messageAttachments'>['kind'],
  contentType: string,
) {
  if (kind === 'image' && !contentType.startsWith('image/')) {
    throw new ConvexError('ATTACHMENT_KIND_MISMATCH');
  }
  if (kind === 'video' && !contentType.startsWith('video/')) {
    throw new ConvexError('ATTACHMENT_KIND_MISMATCH');
  }
  if (kind === 'audio' && !contentType.startsWith('audio/')) {
    throw new ConvexError('ATTACHMENT_KIND_MISMATCH');
  }
}

async function validateAttachments(
  ctx: MutationCtx,
  attachments: Array<{
    storageId: Id<'_storage'>;
    kind: Doc<'messageAttachments'>['kind'];
    name: string;
    contentType: string;
    size: number;
    width?: number;
    height?: number;
    duration?: number;
  }>,
) {
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new ConvexError('TOO_MANY_ATTACHMENTS');
  }
  const seen = new Set<string>();
  return await Promise.all(
    attachments.map(async attachment => {
      if (seen.has(attachment.storageId)) {
        throw new ConvexError('DUPLICATE_ATTACHMENT');
      }
      seen.add(attachment.storageId);
      const name = cleanRequired(attachment.name, 'ATTACHMENT_NAME', 255);
      const contentType = cleanRequired(
        attachment.contentType,
        'ATTACHMENT_CONTENT_TYPE',
        160,
      ).toLowerCase();
      validateAttachmentKind(attachment.kind, contentType);
      const metadata = await ctx.db.system.get(
        '_storage',
        attachment.storageId,
      );
      if (!metadata) throw new ConvexError('ATTACHMENT_NOT_FOUND');
      if (metadata.size > MAX_FILE_SIZE || metadata.size < 0) {
        throw new ConvexError('ATTACHMENT_TOO_LARGE');
      }
      if (attachment.size !== metadata.size) {
        throw new ConvexError('ATTACHMENT_SIZE_MISMATCH');
      }
      if (
        metadata.contentType &&
        metadata.contentType.toLowerCase() !== contentType
      ) {
        throw new ConvexError('ATTACHMENT_CONTENT_TYPE_MISMATCH');
      }
      const alreadyAttached = await ctx.db
        .query('messageAttachments')
        .withIndex('by_storage_id', q =>
          q.eq('storageId', attachment.storageId),
        )
        .first();
      if (alreadyAttached) throw new ConvexError('ATTACHMENT_ALREADY_USED');
      for (const dimension of [
        attachment.width,
        attachment.height,
        attachment.duration,
      ]) {
        if (
          dimension !== undefined &&
          (!Number.isFinite(dimension) || dimension <= 0)
        ) {
          throw new ConvexError('INVALID_ATTACHMENT_DIMENSION');
        }
      }
      return {
        ...attachment,
        name,
        contentType,
        size: metadata.size,
      };
    }),
  );
}

async function hydrateMessage(
  ctx: QueryCtx,
  message: Doc<'channelMessages'>,
  viewerId: Id<'users'>,
) {
  const threadRootId = message.threadRootId ?? message._id;
  const [
    authorUser,
    authorAgent,
    attachments,
    reactions,
    pin,
    saved,
    following,
  ] = await Promise.all([
    message.authorUserId ? ctx.db.get('users', message.authorUserId) : null,
    message.authorAgentId
      ? ctx.db.get('registeredAgents', message.authorAgentId)
      : null,
    ctx.db
      .query('messageAttachments')
      .withIndex('by_message_id', q => q.eq('messageId', message._id))
      .take(MAX_ATTACHMENTS_PER_MESSAGE),
    ctx.db
      .query('messageReactions')
      .withIndex('by_message_id', q => q.eq('messageId', message._id))
      .take(MAX_REACTIONS_PER_MESSAGE),
    ctx.db
      .query('messagePins')
      .withIndex('by_message_id', q => q.eq('messageId', message._id))
      .first(),
    ctx.db
      .query('savedMessages')
      .withIndex('by_user_id_and_message_id', q =>
        q.eq('userId', viewerId).eq('messageId', message._id),
      )
      .first(),
    ctx.db
      .query('threadFollowers')
      .withIndex('by_user_id_and_thread_root_id', q =>
        q.eq('userId', viewerId).eq('threadRootId', threadRootId),
      )
      .first(),
  ]);
  return {
    message,
    authorUser: toUserSummary(authorUser),
    authorAgent: authorAgent
      ? {
          _id: authorAgent._id,
          name: authorAgent.name,
          handle: authorAgent.handle,
          avatar: authorAgent.avatar,
          ownerUserId: authorAgent.ownerUserId,
          provider: authorAgent.provider,
          lifecycleStatus: authorAgent.lifecycleStatus,
        }
      : null,
    attachments,
    reactions,
    pin,
    saved: Boolean(saved),
    following: Boolean(following),
  };
}

async function requireThreadRoot(
  ctx: QueryCtx | MutationCtx,
  rootId: Id<'channelMessages'>,
  channelId?: Id<'channels'>,
) {
  const root = await ctx.db.get('channelMessages', rootId);
  if (!root || root.threadRootId || root.deletedAt) {
    throw new ConvexError('THREAD_ROOT_NOT_FOUND');
  }
  if (channelId && root.channelId !== channelId) {
    throw new ConvexError('THREAD_CHANNEL_MISMATCH');
  }
  return root;
}

async function ensureThreadFollower(
  ctx: MutationCtx,
  root: Doc<'channelMessages'>,
  userId: Id<'users'>,
  lastReadAt?: number,
) {
  const existing = await ctx.db
    .query('threadFollowers')
    .withIndex('by_user_id_and_thread_root_id', q =>
      q.eq('userId', userId).eq('threadRootId', root._id),
    )
    .first();
  if (existing) {
    if (lastReadAt !== undefined && (existing.lastReadAt ?? 0) < lastReadAt) {
      await ctx.db.patch('threadFollowers', existing._id, { lastReadAt });
    }
    return existing._id;
  }
  return await ctx.db.insert('threadFollowers', {
    organizationId: root.organizationId,
    channelId: root.channelId,
    threadRootId: root._id,
    userId,
    lastReadAt,
    createdAt: Date.now(),
  });
}

export const listChannel = query({
  args: {
    channelId: v.id('channels'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageViewValidator),
  handler: async (ctx, args) => {
    const { userId } = await requireChannelAccess(ctx, args.channelId, {
      includeArchived: true,
    });
    const page = await ctx.db
      .query('channelMessages')
      .withIndex('by_channel_id_and_thread_root_id_and_created_at', q =>
        q.eq('channelId', args.channelId).eq('threadRootId', undefined),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(message => hydrateMessage(ctx, message, userId)),
      ),
    };
  },
});

export const listThread = query({
  args: {
    threadRootId: v.id('channelMessages'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageViewValidator),
  handler: async (ctx, args) => {
    const root = await requireThreadRoot(ctx, args.threadRootId);
    const { userId } = await requireChannelAccess(ctx, root.channelId, {
      includeArchived: true,
    });
    const page = await ctx.db
      .query('channelMessages')
      .withIndex('by_thread_root_id_and_created_at', q =>
        q.eq('threadRootId', root._id),
      )
      .order('asc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(message => hydrateMessage(ctx, message, userId)),
      ),
    };
  },
});

export const get = query({
  args: { messageId: v.id('channelMessages') },
  returns: messageViewValidator,
  handler: async (ctx, args) => {
    const { userId, message } = await requireMessageAccess(ctx, args.messageId);
    return await hydrateMessage(ctx, message, userId);
  },
});

export const send = mutation({
  args: {
    channelId: v.id('channels'),
    body: v.string(),
    format: v.optional(messageFormatValidator),
    threadRootId: v.optional(v.id('channelMessages')),
    replyToMessageId: v.optional(v.id('channelMessages')),
    clientMessageId: v.optional(v.string()),
    mentionedUserIds: v.optional(v.array(v.id('users'))),
    mentionedAgentIds: v.optional(v.array(v.id('registeredAgents'))),
    attachments: v.optional(v.array(messageAttachmentInputValidator)),
  },
  returns: v.object({
    messageId: v.id('channelMessages'),
    runIds: v.array(v.id('collaborationAgentRuns')),
  }),
  handler: async (ctx, args) => {
    const access = await requireChannelPermission(
      ctx,
      args.channelId,
      PERMISSIONS.CHANNEL_MESSAGE_SEND,
    );
    if (!access.membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    if (access.channel.kind === 'announcement') {
      await requireChannelManager(
        ctx,
        args.channelId,
        PERMISSIONS.CHANNEL_MESSAGE_SEND,
      );
    }
    const attachmentInputs = await validateAttachments(
      ctx,
      args.attachments ?? [],
    );
    const body = validateBody(args.body, attachmentInputs.length > 0);
    const clientMessageId = validateClientMessageId(args.clientMessageId);
    if (clientMessageId) {
      const existing = await ctx.db
        .query('channelMessages')
        .withIndex('by_channel_id_and_client_message_id', q =>
          q
            .eq('channelId', args.channelId)
            .eq('clientMessageId', clientMessageId),
        )
        .first();
      if (existing) {
        if (
          existing.actorKind !== 'user' ||
          existing.authorUserId !== access.userId
        ) {
          throw new ConvexError('CLIENT_MESSAGE_ID_CONFLICT');
        }
        const runs = await ctx.db
          .query('collaborationAgentRuns')
          .withIndex('by_channel_id_and_created_at', q =>
            q.eq('channelId', args.channelId),
          )
          .order('desc')
          .take(MAX_AGENTS_PER_CHANNEL);
        return {
          messageId: existing._id,
          runIds: runs
            .filter(run => run.triggerMessageId === existing._id)
            .map(run => run._id),
        };
      }
    }

    let threadRoot: Doc<'channelMessages'> | undefined;
    if (args.threadRootId) {
      threadRoot = await requireThreadRoot(
        ctx,
        args.threadRootId,
        args.channelId,
      );
    }
    if (args.replyToMessageId) {
      const replyTo = await ctx.db.get(
        'channelMessages',
        args.replyToMessageId,
      );
      if (
        !replyTo ||
        replyTo.channelId !== args.channelId ||
        replyTo.deletedAt
      ) {
        throw new ConvexError('REPLY_TARGET_NOT_FOUND');
      }
      if (threadRoot) {
        const expectedRoot = replyTo.threadRootId ?? replyTo._id;
        if (expectedRoot !== threadRoot._id) {
          throw new ConvexError('REPLY_THREAD_MISMATCH');
        }
      } else if (replyTo.threadRootId) {
        // Replies to a message inside a thread must stay in that thread.
        // A top-level reply can reference another top-level message without
        // implicitly creating a thread.
        throw new ConvexError('REPLY_THREAD_MISMATCH');
      }
    }
    const mentions = await validateMentionIds(
      ctx,
      access.channel,
      access.userId,
      args.mentionedUserIds ?? [],
      args.mentionedAgentIds ?? [],
    );
    const now = Date.now();
    const messageId = await ctx.db.insert('channelMessages', {
      organizationId: access.channel.organizationId,
      channelId: args.channelId,
      actorKind: 'user',
      authorUserId: access.userId,
      body,
      format: args.format ?? 'markdown',
      threadRootId: threadRoot?._id,
      replyToMessageId: args.replyToMessageId,
      clientMessageId,
      mentionedUserIds: mentions.mentionedUserIds,
      mentionedAgentIds: mentions.mentionedAgentIds,
      replyCount: 0,
      createdAt: now,
    });
    for (const attachment of attachmentInputs) {
      await ctx.db.insert('messageAttachments', {
        organizationId: access.channel.organizationId,
        channelId: args.channelId,
        messageId,
        ...attachment,
        createdAt: now,
      });
    }
    if (threadRoot) {
      await ctx.db.patch('channelMessages', threadRoot._id, {
        replyCount: threadRoot.replyCount + 1,
        lastReplyAt: now,
      });
      await ensureThreadFollower(ctx, threadRoot, access.userId, now);
      if (
        threadRoot.authorUserId &&
        threadRoot.authorUserId !== access.userId
      ) {
        await ensureThreadFollower(ctx, threadRoot, threadRoot.authorUserId);
      }
    } else {
      await ctx.db.patch('channels', args.channelId, {
        lastMessageId: messageId,
        lastMessageAt: now,
        updatedAt: now,
      });
    }
    const message = await ctx.db.get('channelMessages', messageId);
    if (!message) throw new ConvexError('MESSAGE_CREATE_FAILED');
    const runIds = await createAutomaticRunsForMessage(
      ctx,
      message,
      access.userId,
    );
    return { messageId, runIds };
  },
});

export const edit = mutation({
  args: {
    messageId: v.id('channelMessages'),
    body: v.string(),
    mentionedUserIds: v.optional(v.array(v.id('users'))),
    mentionedAgentIds: v.optional(v.array(v.id('registeredAgents'))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, channel, membership, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    if (!membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    await requireChannelPermission(
      ctx,
      channel._id,
      PERMISSIONS.CHANNEL_MESSAGE_SEND,
    );
    if (
      message.actorKind !== 'user' ||
      message.authorUserId !== userId ||
      message.deletedAt
    ) {
      throw new ConvexError('MESSAGE_EDIT_FORBIDDEN');
    }
    const mentions = await validateMentionIds(
      ctx,
      channel,
      userId,
      args.mentionedUserIds ?? [],
      args.mentionedAgentIds ?? [],
    );
    const existingAgentMentions = new Set(message.mentionedAgentIds);
    if (
      mentions.mentionedAgentIds.some(
        agentId => !existingAgentMentions.has(agentId),
      )
    ) {
      throw new ConvexError('CANNOT_ADD_AGENT_MENTION_WHEN_EDITING');
    }
    await ctx.db.patch('channelMessages', message._id, {
      body: validateBody(args.body, false),
      mentionedUserIds: mentions.mentionedUserIds,
      mentionedAgentIds: mentions.mentionedAgentIds,
      editedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { messageId: v.id('channelMessages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, channel, membership, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    if (!membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    await requireChannelPermission(
      ctx,
      channel._id,
      PERMISSIONS.CHANNEL_MESSAGE_SEND,
    );
    const canModerate = await requireChannelManager(
      ctx,
      channel._id,
      PERMISSIONS.CHANNEL_MESSAGE_MODERATE,
    )
      .then(() => true)
      .catch(() => false);
    if (message.authorUserId !== userId && !canModerate) {
      throw new ConvexError('MESSAGE_DELETE_FORBIDDEN');
    }
    if (message.deletedAt) return null;
    const attachments = await ctx.db
      .query('messageAttachments')
      .withIndex('by_message_id', q => q.eq('messageId', message._id))
      .take(MAX_ATTACHMENTS_PER_MESSAGE);
    for (const attachment of attachments) {
      await ctx.storage.delete(attachment.storageId);
      await ctx.db.delete('messageAttachments', attachment._id);
    }
    await ctx.db.patch('channelMessages', message._id, {
      body: '',
      mentionedUserIds: [],
      mentionedAgentIds: [],
      deletedAt: Date.now(),
    });
    return null;
  },
});

export const toggleReaction = mutation({
  args: {
    messageId: v.id('channelMessages'),
    emoji: v.string(),
  },
  returns: v.object({
    active: v.boolean(),
    reactionId: v.optional(v.id('messageReactions')),
  }),
  handler: async (ctx, args) => {
    const { userId, channel, membership, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    if (!membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    await requireChannelPermission(
      ctx,
      channel._id,
      PERMISSIONS.CHANNEL_MESSAGE_SEND,
    );
    if (message.deletedAt) throw new ConvexError('MESSAGE_DELETED');
    const emoji = validateEmoji(args.emoji);
    const existing = await ctx.db
      .query('messageReactions')
      .withIndex('by_message_id_and_user_id_and_emoji', q =>
        q.eq('messageId', message._id).eq('userId', userId).eq('emoji', emoji),
      )
      .first();
    if (existing) {
      await ctx.db.delete('messageReactions', existing._id);
      return { active: false };
    }
    const reactionId = await ctx.db.insert('messageReactions', {
      organizationId: channel.organizationId,
      channelId: channel._id,
      messageId: message._id,
      userId,
      emoji,
      createdAt: Date.now(),
    });
    return { active: true, reactionId };
  },
});

export const listPins = query({
  args: {
    channelId: v.id('channels'),
    limit: v.optional(v.number()),
  },
  returns: v.array(messageViewValidator),
  handler: async (ctx, args) => {
    const { userId } = await requireChannelAccess(ctx, args.channelId, {
      includeArchived: true,
    });
    const pins = await ctx.db
      .query('messagePins')
      .withIndex('by_channel_id', q => q.eq('channelId', args.channelId))
      .order('desc')
      .take(boundedLimit(args.limit, 50, MAX_MESSAGES));
    const messages = await Promise.all(
      pins.map(pin => ctx.db.get('channelMessages', pin.messageId)),
    );
    return await Promise.all(
      messages
        .filter((message): message is Doc<'channelMessages'> =>
          Boolean(message),
        )
        .map(message => hydrateMessage(ctx, message, userId)),
    );
  },
});

export const togglePin = mutation({
  args: { messageId: v.id('channelMessages') },
  returns: v.object({
    active: v.boolean(),
    pinId: v.optional(v.id('messagePins')),
  }),
  handler: async (ctx, args) => {
    const { userId, channel, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    await requireChannelManager(
      ctx,
      channel._id,
      PERMISSIONS.CHANNEL_MESSAGE_MODERATE,
    );
    const existing = await ctx.db
      .query('messagePins')
      .withIndex('by_message_id', q => q.eq('messageId', message._id))
      .first();
    if (existing) {
      await ctx.db.delete('messagePins', existing._id);
      return { active: false };
    }
    const pinId = await ctx.db.insert('messagePins', {
      organizationId: channel.organizationId,
      channelId: channel._id,
      messageId: message._id,
      pinnedByUserId: userId,
      createdAt: Date.now(),
    });
    return { active: true, pinId };
  },
});

export const listSaved = query({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(messageViewValidator),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.CHANNEL_VIEW,
    );
    const saved = await ctx.db
      .query('savedMessages')
      .withIndex('by_user_id', q => q.eq('userId', userId))
      .order('desc')
      .take(boundedLimit(args.limit, 50, MAX_MESSAGES));
    const views = [];
    for (const item of saved) {
      if (item.organizationId !== organization._id) continue;
      const message = await ctx.db.get('channelMessages', item.messageId);
      if (!message) continue;
      const canAccess = await requireChannelAccess(ctx, message.channelId, {
        includeArchived: true,
      })
        .then(() => true)
        .catch(() => false);
      if (canAccess) views.push(await hydrateMessage(ctx, message, userId));
    }
    return views;
  },
});

export const toggleSaved = mutation({
  args: { messageId: v.id('channelMessages') },
  returns: v.object({
    active: v.boolean(),
    savedMessageId: v.optional(v.id('savedMessages')),
  }),
  handler: async (ctx, args) => {
    const { userId, channel, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    const existing = await ctx.db
      .query('savedMessages')
      .withIndex('by_user_id_and_message_id', q =>
        q.eq('userId', userId).eq('messageId', message._id),
      )
      .first();
    if (existing) {
      await ctx.db.delete('savedMessages', existing._id);
      return { active: false };
    }
    const savedMessageId = await ctx.db.insert('savedMessages', {
      organizationId: channel.organizationId,
      messageId: message._id,
      userId,
      createdAt: Date.now(),
    });
    return { active: true, savedMessageId };
  },
});

export const generateUploadUrl = mutation({
  args: { channelId: v.id('channels') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const access = await requireChannelPermission(
      ctx,
      args.channelId,
      PERMISSIONS.CHANNEL_MESSAGE_SEND,
    );
    if (!access.membership) {
      throw new ConvexError('CHANNEL_MEMBERSHIP_REQUIRED');
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const getAttachmentUrl = query({
  args: { attachmentId: v.id('messageAttachments') },
  returns: attachmentUrlResultValidator,
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(
      'messageAttachments',
      args.attachmentId,
    );
    if (!attachment) return null;
    await requireChannelAccess(ctx, attachment.channelId, {
      includeArchived: true,
    });
    const url = await ctx.storage.getUrl(attachment.storageId);
    return url ? { attachment, url } : null;
  },
});

export const markRead = mutation({
  args: {
    channelId: v.id('channels'),
    messageId: v.optional(v.id('channelMessages')),
  },
  returns: v.id('channelMembers'),
  handler: async (ctx, args) => {
    const { userId, channel } = await requireChannelAccess(
      ctx,
      args.channelId,
      { includeArchived: true },
    );
    let readAt = Date.now();
    if (args.messageId) {
      const message = await ctx.db.get('channelMessages', args.messageId);
      if (!message || message.channelId !== channel._id) {
        throw new ConvexError('MESSAGE_NOT_FOUND');
      }
      readAt = message.createdAt;
    }
    const membership = await ensureChannelMembership(ctx, channel, userId);
    if ((membership.lastReadAt ?? 0) <= readAt) {
      await ctx.db.patch('channelMembers', membership._id, {
        lastReadAt: readAt,
        lastReadMessageId: args.messageId,
        hiddenAt: undefined,
      });
    }
    return membership._id;
  },
});

export const getUnreadCount = query({
  args: { channelId: v.id('channels') },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { userId } = await requireChannelAccess(ctx, args.channelId, {
      includeArchived: true,
    });
    const membership = await getChannelMembership(ctx, args.channelId, userId);
    const messages = await ctx.db
      .query('channelMessages')
      .withIndex('by_channel_id_and_created_at', q =>
        q
          .eq('channelId', args.channelId)
          .gt('createdAt', membership?.lastReadAt ?? 0),
      )
      .take(100);
    return messages.filter(message => !message.deletedAt).length;
  },
});

export const followThread = mutation({
  args: { threadRootId: v.id('channelMessages') },
  returns: v.id('threadFollowers'),
  handler: async (ctx, args) => {
    const root = await requireThreadRoot(ctx, args.threadRootId);
    const { userId } = await requireChannelAccess(ctx, root.channelId, {
      includeArchived: true,
    });
    return await ensureThreadFollower(ctx, root, userId);
  },
});

export const unfollowThread = mutation({
  args: { threadRootId: v.id('channelMessages') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const root = await requireThreadRoot(ctx, args.threadRootId);
    const { userId } = await requireChannelAccess(ctx, root.channelId, {
      includeArchived: true,
    });
    const follower = await ctx.db
      .query('threadFollowers')
      .withIndex('by_user_id_and_thread_root_id', q =>
        q.eq('userId', userId).eq('threadRootId', root._id),
      )
      .first();
    if (follower) await ctx.db.delete('threadFollowers', follower._id);
    return null;
  },
});

export const markThreadRead = mutation({
  args: {
    threadRootId: v.id('channelMessages'),
    messageId: v.optional(v.id('channelMessages')),
  },
  returns: v.id('threadFollowers'),
  handler: async (ctx, args) => {
    const root = await requireThreadRoot(ctx, args.threadRootId);
    const { userId } = await requireChannelAccess(ctx, root.channelId, {
      includeArchived: true,
    });
    let readAt = Date.now();
    if (args.messageId) {
      const message = await ctx.db.get('channelMessages', args.messageId);
      if (
        !message ||
        message.threadRootId !== root._id ||
        message.channelId !== root.channelId
      ) {
        throw new ConvexError('THREAD_MESSAGE_NOT_FOUND');
      }
      readAt = message.createdAt;
    }
    return await ensureThreadFollower(ctx, root, userId, readAt);
  },
});

export const setThreadResolved = mutation({
  args: {
    threadRootId: v.id('channelMessages'),
    resolved: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const root = await requireThreadRoot(ctx, args.threadRootId);
    const { userId } = await requireChannelAccess(ctx, root.channelId, {
      includeArchived: true,
    });
    const canModerate = await requireChannelManager(
      ctx,
      root.channelId,
      PERMISSIONS.CHANNEL_MESSAGE_MODERATE,
    )
      .then(() => true)
      .catch(() => false);
    if (root.authorUserId !== userId && !canModerate) {
      throw new ConvexError('THREAD_RESOLVE_FORBIDDEN');
    }
    await ctx.db.patch('channelMessages', root._id, {
      resolvedAt: args.resolved ? Date.now() : undefined,
      resolvedByUserId: args.resolved ? userId : undefined,
    });
    return null;
  },
});

async function validateEntityLink(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  entityType: Doc<'messageEntityLinks'>['entityType'],
  entityId: string,
) {
  switch (entityType) {
    case 'request': {
      const id = ctx.db.normalizeId('requests', entityId);
      const entity = id ? await ctx.db.get('requests', id) : null;
      if (!entity || entity.organizationId !== organizationId) {
        throw new ConvexError('LINKED_ENTITY_NOT_FOUND');
      }
      return id;
    }
    case 'issue': {
      const id = ctx.db.normalizeId('issues', entityId);
      const entity = id ? await ctx.db.get('issues', id) : null;
      if (!entity || entity.organizationId !== organizationId) {
        throw new ConvexError('LINKED_ENTITY_NOT_FOUND');
      }
      return id;
    }
    case 'task': {
      const id = ctx.db.normalizeId('tasks', entityId);
      const entity = id ? await ctx.db.get('tasks', id) : null;
      if (!entity || entity.organizationId !== organizationId) {
        throw new ConvexError('LINKED_ENTITY_NOT_FOUND');
      }
      return id;
    }
    case 'project': {
      const id = ctx.db.normalizeId('projects', entityId);
      const entity = id ? await ctx.db.get('projects', id) : null;
      if (!entity || entity.organizationId !== organizationId) {
        throw new ConvexError('LINKED_ENTITY_NOT_FOUND');
      }
      return id;
    }
    case 'document': {
      const id = ctx.db.normalizeId('documents', entityId);
      const entity = id ? await ctx.db.get('documents', id) : null;
      if (!entity || entity.organizationId !== organizationId) {
        throw new ConvexError('LINKED_ENTITY_NOT_FOUND');
      }
      return id;
    }
  }
}

async function resolveEntityLinkView(
  ctx: QueryCtx,
  link: Doc<'messageEntityLinks'>,
  orgSlug: string,
) {
  switch (link.entityType) {
    case 'request': {
      const id = ctx.db.normalizeId('requests', link.entityId);
      const request = id ? await ctx.db.get('requests', id) : null;
      if (!request || !(await canViewRequest(ctx, request))) return null;
      return {
        link,
        entity: {
          label: `${request.key}: ${request.title}`,
          key: request.key,
          title: request.title,
          href: `/${orgSlug}/requests/${request.key}`,
        },
      };
    }
    case 'issue': {
      const id = ctx.db.normalizeId('issues', link.entityId);
      const issue = id ? await ctx.db.get('issues', id) : null;
      if (!issue || !(await canViewIssue(ctx, issue))) return null;
      return {
        link,
        entity: {
          label: `${issue.key}: ${issue.title}`,
          key: issue.key,
          title: issue.title,
          href: `/${orgSlug}/work/${issue.key}`,
        },
      };
    }
    case 'task': {
      const id = ctx.db.normalizeId('tasks', link.entityId);
      const task = id ? await ctx.db.get('tasks', id) : null;
      const work = task ? await ctx.db.get('issues', task.workId) : null;
      if (!task || !work || !(await canViewIssue(ctx, work))) return null;
      return {
        link,
        entity: {
          label: `${work.key} · Task ${task.number}: ${task.title}`,
          key: `${work.key}#${task.number}`,
          title: task.title,
          href: `/${orgSlug}/work/${work.key}?task=${task.number}`,
        },
      };
    }
    case 'project': {
      const id = ctx.db.normalizeId('projects', link.entityId);
      const project = id ? await ctx.db.get('projects', id) : null;
      if (!project || !(await canViewProject(ctx, project))) return null;
      return {
        link,
        entity: {
          label: `${project.key}: ${project.name}`,
          key: project.key,
          title: project.name,
          href: `/${orgSlug}/projects/${project.key}`,
        },
      };
    }
    case 'document': {
      const id = ctx.db.normalizeId('documents', link.entityId);
      const document = id ? await ctx.db.get('documents', id) : null;
      if (!document || !(await canViewDocument(ctx, document))) return null;
      return {
        link,
        entity: {
          label: document.title,
          title: document.title,
          href: `/${orgSlug}/documents/${document._id}`,
        },
      };
    }
  }
}

export const linkEntity = mutation({
  args: {
    messageId: v.id('channelMessages'),
    entityType: collaborationEntityTypeValidator,
    entityId: v.string(),
  },
  returns: v.id('messageEntityLinks'),
  handler: async (ctx, args) => {
    const { userId, channel, message } = await requireMessageAccess(
      ctx,
      args.messageId,
    );
    const normalizedId = await validateEntityLink(
      ctx,
      channel.organizationId,
      args.entityType,
      args.entityId,
    );
    const existing = await ctx.db
      .query('messageEntityLinks')
      .withIndex('by_message_id', q => q.eq('messageId', message._id))
      .take(50);
    const duplicate = existing.find(
      link =>
        link.entityType === args.entityType &&
        link.entityId === String(normalizedId),
    );
    if (duplicate) return duplicate._id;
    return await ctx.db.insert('messageEntityLinks', {
      organizationId: channel.organizationId,
      messageId: message._id,
      entityType: args.entityType,
      entityId: String(normalizedId),
      linkedByUserId: userId,
      createdAt: Date.now(),
    });
  },
});

export const unlinkEntity = mutation({
  args: { linkId: v.id('messageEntityLinks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get('messageEntityLinks', args.linkId);
    if (!link) return null;
    const { userId, channel } = await requireMessageAccess(ctx, link.messageId);
    const canModerate = await requireChannelManager(
      ctx,
      channel._id,
      PERMISSIONS.CHANNEL_MESSAGE_MODERATE,
    )
      .then(() => true)
      .catch(() => false);
    if (link.linkedByUserId !== userId && !canModerate) {
      throw new ConvexError('ENTITY_UNLINK_FORBIDDEN');
    }
    await ctx.db.delete('messageEntityLinks', link._id);
    return null;
  },
});

export const listEntityLinks = query({
  args: { messageId: v.id('channelMessages') },
  returns: v.array(entityLinkViewValidator),
  handler: async (ctx, args) => {
    const { channel } = await requireMessageAccess(ctx, args.messageId);
    const organization = await ctx.db.get(
      'organizations',
      channel.organizationId,
    );
    if (!organization) throw new ConvexError('ORGANIZATION_NOT_FOUND');
    const links = await ctx.db
      .query('messageEntityLinks')
      .withIndex('by_message_id', q => q.eq('messageId', args.messageId))
      .take(50);
    const resolved = await Promise.all(
      links.map(link => resolveEntityLinkView(ctx, link, organization.slug)),
    );
    return resolved.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );
  },
});

export const listPriorityInbox = query({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(priorityInboxItemValidator),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.CHANNEL_VIEW,
    );
    const limit = boundedLimit(args.limit, 50, MAX_MESSAGES);
    const [memberships, organizationChannels, followedThreads] =
      await Promise.all([
        ctx.db
          .query('channelMembers')
          .withIndex('by_organization_id_and_user_id', q =>
            q.eq('organizationId', organization._id).eq('userId', userId),
          )
          .take(100),
        ctx.db
          .query('channels')
          .withIndex('by_organization_id_and_last_message_at', q =>
            q.eq('organizationId', organization._id),
          )
          .order('desc')
          .take(100),
        ctx.db
          .query('threadFollowers')
          .withIndex('by_user_id', q => q.eq('userId', userId))
          .order('desc')
          .take(100),
      ]);
    const membershipByChannel = new Map(
      memberships.map(membership => [membership.channelId, membership]),
    );
    const followedByRoot = new Map(
      followedThreads
        .filter(follower => follower.organizationId === organization._id)
        .map(follower => [follower.threadRootId, follower]),
    );
    const items = [];
    const seen = new Set<string>();

    for (const channel of organizationChannels) {
      const membership = membershipByChannel.get(channel._id);
      if (
        channel.archivedAt ||
        (channel.kind !== 'public' &&
          channel.kind !== 'announcement' &&
          !membership)
      ) {
        continue;
      }
      const messages = await ctx.db
        .query('channelMessages')
        .withIndex('by_channel_id_and_created_at', q =>
          q
            .eq('channelId', channel._id)
            .gt('createdAt', membership?.lastReadAt ?? 0),
        )
        .order('desc')
        .take(20);
      for (const message of messages) {
        if (message.deletedAt || message.authorUserId === userId) continue;
        let reason:
          | 'direct_message'
          | 'mention'
          | 'thread_reply'
          | 'followed_thread'
          | undefined;
        if (message.mentionedUserIds.includes(userId)) {
          reason = 'mention';
        } else if (
          channel.kind === 'direct' ||
          channel.kind === 'group_direct'
        ) {
          reason = 'direct_message';
        } else if (message.threadRootId) {
          const root = await ctx.db.get(
            'channelMessages',
            message.threadRootId,
          );
          if (root?.authorUserId === userId) {
            reason = 'thread_reply';
          } else {
            const follower = followedByRoot.get(message.threadRootId);
            if ((follower?.lastReadAt ?? 0) < message.createdAt) {
              reason = 'followed_thread';
            }
          }
        }
        if (!reason || seen.has(message._id)) continue;
        seen.add(message._id);
        items.push({
          message: await hydrateMessage(ctx, message, userId),
          channel,
          reason,
          occurredAt: message.createdAt,
        });
      }
    }
    return items.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, limit);
  },
});

export const search = query({
  args: {
    orgSlug: v.string(),
    query: v.string(),
    channelId: v.optional(v.id('channels')),
    actorKind: v.optional(
      v.union(v.literal('user'), v.literal('agent'), v.literal('system')),
    ),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      message: messageViewValidator,
      channel: channelValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.CHANNEL_VIEW,
    );
    const searchText = cleanRequired(args.query, 'SEARCH_QUERY', 200);
    if (args.channelId) {
      const channel = await ctx.db.get('channels', args.channelId);
      if (!channel || channel.organizationId !== organization._id) {
        throw new ConvexError('CHANNEL_NOT_FOUND');
      }
      if (!(await canUserAccessChannel(ctx, channel, userId))) {
        throw new ConvexError('FORBIDDEN');
      }
    }
    const limit = boundedLimit(args.limit, 50, MAX_MESSAGES);
    const messageMatches = await ctx.db
      .query('channelMessages')
      .withSearchIndex('search_body', q => {
        let searchQuery = q
          .search('body', searchText)
          .eq('organizationId', organization._id);
        if (args.channelId) {
          searchQuery = searchQuery.eq('channelId', args.channelId);
        }
        if (args.actorKind) {
          searchQuery = searchQuery.eq('actorKind', args.actorKind);
        }
        return searchQuery;
      })
      .take(limit);
    const attachmentMatches =
      args.actorKind === undefined
        ? await ctx.db
            .query('messageAttachments')
            .withSearchIndex('search_name', q => {
              let searchQuery = q
                .search('name', searchText)
                .eq('organizationId', organization._id);
              if (args.channelId) {
                searchQuery = searchQuery.eq('channelId', args.channelId);
              }
              return searchQuery;
            })
            .take(limit)
        : [];
    const matches = [...messageMatches];
    const seenMessageIds = new Set(
      messageMatches.map(message => String(message._id)),
    );
    for (const attachment of attachmentMatches) {
      if (seenMessageIds.has(String(attachment.messageId))) continue;
      const message = await ctx.db.get('channelMessages', attachment.messageId);
      if (!message) continue;
      seenMessageIds.add(String(message._id));
      matches.push(message);
    }
    const results = [];
    for (const message of matches) {
      if (message.deletedAt) continue;
      const channel = await ctx.db.get('channels', message.channelId);
      if (
        !channel ||
        channel.organizationId !== organization._id ||
        !(await canUserAccessChannel(ctx, channel, userId))
      ) {
        continue;
      }
      results.push({
        message: await hydrateMessage(ctx, message, userId),
        channel,
      });
    }
    return results
      .sort(
        (left, right) =>
          right.message.message.createdAt - left.message.message.createdAt,
      )
      .slice(0, limit);
  },
});
