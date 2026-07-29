import { mutation, query } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import {
  channelKindValidator,
  channelMemberRoleValidator,
  channelNotificationModeValidator,
} from '../_shared/collaboration';
import { PERMISSIONS } from '../_shared/permissions';
import {
  MAX_CHANNEL_MEMBERS,
  MAX_CHANNELS,
  boundedLimit,
  canUserAccessChannel,
  cleanOptional,
  cleanRequired,
  ensureChannelMembership,
  getChannelMembership,
  normalizeChannelSlug,
  requireChannelAccess,
  requireChannelManager,
  requireChannelPermission,
  requireOrgContext,
  toUserSummary,
} from './helpers';
import {
  channelListItemValidator,
  channelMemberValidator,
  userSummaryValidator,
} from './validators';

async function unreadCount(
  ctx: Parameters<typeof requireChannelAccess>[0],
  channelId: Parameters<typeof getChannelMembership>[1],
  lastReadAt: number | undefined,
) {
  const unread = await ctx.db
    .query('channelMessages')
    .withIndex('by_channel_id_and_created_at', q =>
      q.eq('channelId', channelId).gt('createdAt', lastReadAt ?? 0),
    )
    .take(100);
  return unread.filter(message => !message.deletedAt).length;
}

export const bootstrapDefaultChannel = mutation({
  args: { orgSlug: v.string() },
  returns: v.id('channels'),
  handler: async (ctx, args) => {
    const {
      userId,
      organization,
      membership: orgMembership,
    } = await requireOrgContext(ctx, args.orgSlug, PERMISSIONS.CHANNEL_VIEW);
    let channel = await ctx.db
      .query('channels')
      .withIndex('by_organization_id_and_is_default', q =>
        q.eq('organizationId', organization._id).eq('isDefault', true),
      )
      .first();

    if (!channel) {
      const existingGeneral = await ctx.db
        .query('channels')
        .withIndex('by_organization_id_and_slug', q =>
          q.eq('organizationId', organization._id).eq('slug', 'general'),
        )
        .first();
      const now = Date.now();
      if (existingGeneral) {
        await ctx.db.patch('channels', existingGeneral._id, {
          isDefault: true,
          archivedAt: undefined,
          updatedAt: now,
        });
        channel = {
          ...existingGeneral,
          isDefault: true,
          archivedAt: undefined,
        };
      } else {
        const channelId = await ctx.db.insert('channels', {
          organizationId: organization._id,
          kind: 'public',
          name: 'General',
          slug: 'general',
          description: 'Workspace-wide conversation',
          createdByUserId: userId,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
        channel = await ctx.db.get('channels', channelId);
      }
    }

    if (!channel) throw new ConvexError('DEFAULT_CHANNEL_CREATE_FAILED');
    await ensureChannelMembership(ctx, channel, userId, {
      role: orgMembership.role === 'owner' ? 'owner' : 'member',
      notificationMode: 'all',
    });
    return channel._id;
  },
});

export const getDefaultChannel = query({
  args: { orgSlug: v.string() },
  returns: v.union(channelListItemValidator, v.null()),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.CHANNEL_VIEW,
    );
    const channel = await ctx.db
      .query('channels')
      .withIndex('by_organization_id_and_is_default', q =>
        q.eq('organizationId', organization._id).eq('isDefault', true),
      )
      .first();
    if (
      !channel ||
      channel.archivedAt ||
      !(await canUserAccessChannel(ctx, channel, userId))
    ) {
      return null;
    }
    const membership = await getChannelMembership(ctx, channel._id, userId);
    return {
      channel,
      membership,
      unreadCount: membership
        ? await unreadCount(ctx, channel._id, membership.lastReadAt)
        : 0,
    };
  },
});

export const list = query({
  args: {
    orgSlug: v.string(),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(channelListItemValidator),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.CHANNEL_VIEW,
    );
    const limit = boundedLimit(args.limit, 100, MAX_CHANNELS);
    const [organizationChannels, memberships] = await Promise.all([
      ctx.db
        .query('channels')
        .withIndex('by_organization_id', q =>
          q.eq('organizationId', organization._id),
        )
        .take(MAX_CHANNELS),
      ctx.db
        .query('channelMembers')
        .withIndex('by_organization_id_and_user_id', q =>
          q.eq('organizationId', organization._id).eq('userId', userId),
        )
        .take(MAX_CHANNELS),
    ]);
    const membershipByChannel = new Map(
      memberships.map(membership => [membership.channelId, membership]),
    );
    const visible = organizationChannels
      .filter(channel => args.includeArchived || !channel.archivedAt)
      .filter(
        channel =>
          channel.kind === 'public' ||
          channel.kind === 'announcement' ||
          membershipByChannel.has(channel._id),
      )
      .filter(channel => !membershipByChannel.get(channel._id)?.hiddenAt)
      .sort((a, b) => {
        const aMember = membershipByChannel.get(a._id);
        const bMember = membershipByChannel.get(b._id);
        if (Boolean(aMember?.favoriteAt) !== Boolean(bMember?.favoriteAt)) {
          return aMember?.favoriteAt ? -1 : 1;
        }
        const orderDelta =
          (aMember?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (bMember?.sortOrder ?? Number.MAX_SAFE_INTEGER);
        if (orderDelta !== 0) return orderDelta;
        return (
          (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt)
        );
      })
      .slice(0, limit);

    return await Promise.all(
      visible.map(async channel => {
        const membership = membershipByChannel.get(channel._id) ?? null;
        return {
          channel,
          membership,
          unreadCount: membership
            ? await unreadCount(ctx, channel._id, membership.lastReadAt)
            : 0,
        };
      }),
    );
  },
});

export const get = query({
  args: { channelId: v.id('channels') },
  returns: channelListItemValidator,
  handler: async (ctx, args) => {
    const { channel, membership } = await requireChannelAccess(
      ctx,
      args.channelId,
      { includeArchived: true },
    );
    return {
      channel,
      membership,
      unreadCount: membership
        ? await unreadCount(ctx, channel._id, membership.lastReadAt)
        : 0,
    };
  },
});

export const create = mutation({
  args: {
    orgSlug: v.string(),
    kind: channelKindValidator,
    name: v.string(),
    slug: v.optional(v.string()),
    topic: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    memberUserIds: v.optional(v.array(v.id('users'))),
  },
  returns: v.id('channels'),
  handler: async (ctx, args) => {
    const { userId, organization } = await requireOrgContext(
      ctx,
      args.orgSlug,
      PERMISSIONS.CHANNEL_CREATE,
    );
    const name = cleanRequired(args.name, 'CHANNEL_NAME', 80);
    const slug = normalizeChannelSlug(args.slug ?? name);
    const memberUserIds = [...new Set([userId, ...(args.memberUserIds ?? [])])];
    if (memberUserIds.length > 100) {
      throw new ConvexError('TOO_MANY_CHANNEL_MEMBERS');
    }
    if (args.kind === 'direct' && memberUserIds.length !== 2) {
      throw new ConvexError('DIRECT_CHANNEL_REQUIRES_TWO_MEMBERS');
    }
    if (args.kind === 'group_direct' && memberUserIds.length < 3) {
      throw new ConvexError('GROUP_DIRECT_REQUIRES_THREE_MEMBERS');
    }
    for (const memberId of memberUserIds) {
      const orgMember = await ctx.db
        .query('members')
        .withIndex('by_org_user', q =>
          q.eq('organizationId', organization._id).eq('userId', memberId),
        )
        .first();
      if (!orgMember) throw new ConvexError('CHANNEL_MEMBER_NOT_IN_ORG');
    }

    if (args.kind === 'direct') {
      const myMemberships = await ctx.db
        .query('channelMembers')
        .withIndex('by_organization_id_and_user_id', q =>
          q.eq('organizationId', organization._id).eq('userId', userId),
        )
        .take(MAX_CHANNELS);
      for (const myMembership of myMemberships) {
        const candidate = await ctx.db.get('channels', myMembership.channelId);
        if (!candidate || candidate.kind !== 'direct') continue;
        const candidateMembers = await ctx.db
          .query('channelMembers')
          .withIndex('by_channel_id', q => q.eq('channelId', candidate._id))
          .take(3);
        const candidateIds = new Set(
          candidateMembers.map(member => member.userId),
        );
        if (
          candidateMembers.length === 2 &&
          memberUserIds.every(memberId => candidateIds.has(memberId))
        ) {
          await ctx.db.patch('channelMembers', myMembership._id, {
            hiddenAt: undefined,
          });
          return candidate._id;
        }
      }
    }

    const existing = await ctx.db
      .query('channels')
      .withIndex('by_organization_id_and_slug', q =>
        q.eq('organizationId', organization._id).eq('slug', slug),
      )
      .first();
    if (existing) throw new ConvexError('CHANNEL_SLUG_TAKEN');

    const now = Date.now();
    const channelId = await ctx.db.insert('channels', {
      organizationId: organization._id,
      kind: args.kind,
      name,
      slug,
      topic: cleanOptional(args.topic, 'CHANNEL_TOPIC', 250),
      description: cleanOptional(
        args.description,
        'CHANNEL_DESCRIPTION',
        1_000,
      ),
      icon: cleanOptional(args.icon, 'CHANNEL_ICON', 80),
      color: cleanOptional(args.color, 'CHANNEL_COLOR', 64),
      createdByUserId: userId,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });
    for (const memberId of memberUserIds) {
      await ctx.db.insert('channelMembers', {
        organizationId: organization._id,
        channelId,
        userId: memberId,
        role: memberId === userId ? 'owner' : 'member',
        notificationMode:
          args.kind === 'direct' || args.kind === 'group_direct'
            ? 'all'
            : 'mentions',
        joinedAt: now,
      });
    }
    return channelId;
  },
});

export const update = mutation({
  args: {
    channelId: v.id('channels'),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    topic: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    icon: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { channel } = await requireChannelManager(
      ctx,
      args.channelId,
      PERMISSIONS.CHANNEL_EDIT,
    );
    const updates: Partial<typeof channel> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      updates.name = cleanRequired(args.name, 'CHANNEL_NAME', 80);
    }
    if (args.slug !== undefined) {
      const slug = normalizeChannelSlug(args.slug);
      const existing = await ctx.db
        .query('channels')
        .withIndex('by_organization_id_and_slug', q =>
          q.eq('organizationId', channel.organizationId).eq('slug', slug),
        )
        .first();
      if (existing && existing._id !== channel._id) {
        throw new ConvexError('CHANNEL_SLUG_TAKEN');
      }
      updates.slug = slug;
    }
    if (args.topic !== undefined) {
      updates.topic = cleanOptional(args.topic, 'CHANNEL_TOPIC', 250);
    }
    if (args.description !== undefined) {
      updates.description = cleanOptional(
        args.description,
        'CHANNEL_DESCRIPTION',
        1_000,
      );
    }
    if (args.icon !== undefined) {
      updates.icon = cleanOptional(args.icon, 'CHANNEL_ICON', 80);
    }
    if (args.color !== undefined) {
      updates.color = cleanOptional(args.color, 'CHANNEL_COLOR', 64);
    }
    await ctx.db.patch('channels', channel._id, updates);
    return null;
  },
});

export const archive = mutation({
  args: {
    channelId: v.id('channels'),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { channel } = await requireChannelManager(
      ctx,
      args.channelId,
      PERMISSIONS.CHANNEL_ARCHIVE,
    );
    if (channel.isDefault && args.archived) {
      throw new ConvexError('CANNOT_ARCHIVE_DEFAULT_CHANNEL');
    }
    await ctx.db.patch('channels', channel._id, {
      archivedAt: args.archived ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listMembers = query({
  args: {
    channelId: v.id('channels'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      membership: channelMemberValidator,
      user: v.union(userSummaryValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireChannelAccess(ctx, args.channelId, { includeArchived: true });
    const memberships = await ctx.db
      .query('channelMembers')
      .withIndex('by_channel_id', q => q.eq('channelId', args.channelId))
      .take(boundedLimit(args.limit, 100, MAX_CHANNEL_MEMBERS));
    return await Promise.all(
      memberships.map(async membership => ({
        membership,
        user: toUserSummary(await ctx.db.get('users', membership.userId)),
      })),
    );
  },
});

export const addMember = mutation({
  args: {
    channelId: v.id('channels'),
    userId: v.id('users'),
    role: v.optional(channelMemberRoleValidator),
  },
  returns: v.id('channelMembers'),
  handler: async (ctx, args) => {
    const { channel } = await requireChannelManager(ctx, args.channelId);
    if (channel.kind === 'direct') {
      throw new ConvexError('DIRECT_CHANNEL_MEMBERSHIP_IMMUTABLE');
    }
    const orgMember = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q
          .eq('organizationId', channel.organizationId)
          .eq('userId', args.userId),
      )
      .first();
    if (!orgMember) throw new ConvexError('CHANNEL_MEMBER_NOT_IN_ORG');
    const existing = await getChannelMembership(ctx, channel._id, args.userId);
    if (existing) {
      if (args.role && existing.role !== args.role) {
        await ctx.db.patch('channelMembers', existing._id, {
          role: args.role,
          hiddenAt: undefined,
        });
      }
      return existing._id;
    }
    const created = await ensureChannelMembership(ctx, channel, args.userId, {
      role: args.role,
    });
    return created._id;
  },
});

export const join = mutation({
  args: { channelId: v.id('channels') },
  returns: v.id('channelMembers'),
  handler: async (ctx, args) => {
    const { userId, channel } = await requireChannelPermission(
      ctx,
      args.channelId,
      PERMISSIONS.CHANNEL_VIEW,
    );
    if (channel.kind !== 'public' && channel.kind !== 'announcement') {
      throw new ConvexError('CHANNEL_INVITATION_REQUIRED');
    }
    const membership = await ensureChannelMembership(ctx, channel, userId);
    return membership._id;
  },
});

export const removeMember = mutation({
  args: {
    channelId: v.id('channels'),
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { channel } = await requireChannelManager(ctx, args.channelId);
    if (channel.kind === 'direct') {
      throw new ConvexError('DIRECT_CHANNEL_MEMBERSHIP_IMMUTABLE');
    }
    if (channel.createdByUserId === args.userId) {
      throw new ConvexError('CANNOT_REMOVE_CHANNEL_CREATOR');
    }
    const membership = await getChannelMembership(
      ctx,
      channel._id,
      args.userId,
    );
    if (membership) await ctx.db.delete('channelMembers', membership._id);
    return null;
  },
});

export const setPreferences = mutation({
  args: {
    channelId: v.id('channels'),
    notificationMode: v.optional(channelNotificationModeValidator),
    favorite: v.optional(v.boolean()),
    sortOrder: v.optional(v.union(v.number(), v.null())),
    hidden: v.optional(v.boolean()),
  },
  returns: v.id('channelMembers'),
  handler: async (ctx, args) => {
    const { userId, channel } = await requireChannelPermission(
      ctx,
      args.channelId,
      PERMISSIONS.CHANNEL_VIEW,
      { includeArchived: true },
    );
    const membership = await ensureChannelMembership(ctx, channel, userId);
    const now = Date.now();
    await ctx.db.patch('channelMembers', membership._id, {
      notificationMode: args.notificationMode ?? membership.notificationMode,
      favoriteAt:
        args.favorite === undefined
          ? membership.favoriteAt
          : args.favorite
            ? now
            : undefined,
      sortOrder:
        args.sortOrder === undefined
          ? membership.sortOrder
          : (args.sortOrder ?? undefined),
      hiddenAt:
        args.hidden === undefined
          ? membership.hiddenAt
          : args.hidden
            ? now
            : undefined,
    });
    return membership._id;
  },
});
