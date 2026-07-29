import { Presence } from '@convex-dev/presence';
import { mutation, query } from '../_generated/server';
import { components } from '../_generated/api';
import { v, ConvexError } from 'convex/values';
import { requireAuthUser } from '../authz';
import { requireChannelAccess } from './helpers';

const collaborationPresence = new Presence<string, string>(components.presence);

const presenceStateValidator = v.object({
  userId: v.string(),
  online: v.boolean(),
  lastDisconnected: v.number(),
  data: v.optional(v.object({ typing: v.boolean() })),
});

function parseRoomId(roomId: string): {
  channelId: string;
  threadRootId?: string;
} {
  const parts = roomId.split('/');
  if (parts.length === 2 && parts[0] === 'channel') {
    return { channelId: parts[1]! };
  }
  if (parts.length === 3 && parts[0] === 'thread') {
    return { channelId: parts[1]!, threadRootId: parts[2]! };
  }
  throw new ConvexError('INVALID_PRESENCE_ROOM');
}

async function validateRoom(
  ctx: Parameters<typeof requireChannelAccess>[0],
  roomId: string,
) {
  const parsed = parseRoomId(roomId);
  const channelId = ctx.db.normalizeId('channels', parsed.channelId);
  if (!channelId) throw new ConvexError('CHANNEL_NOT_FOUND');
  await requireChannelAccess(ctx, channelId, { includeArchived: true });
  if (parsed.threadRootId) {
    const threadRootId = ctx.db.normalizeId(
      'channelMessages',
      parsed.threadRootId,
    );
    const root = threadRootId
      ? await ctx.db.get('channelMessages', threadRootId)
      : null;
    if (!root || root.channelId !== channelId || root.threadRootId) {
      throw new ConvexError('THREAD_ROOT_NOT_FOUND');
    }
  }
  return { channelId, threadRootId: parsed.threadRootId };
}

function encodeRoomToken(roomId: string, componentRoomToken: string): string {
  return JSON.stringify({ version: 1, roomId, componentRoomToken });
}

function decodeRoomToken(roomToken: string): {
  roomId: string;
  componentRoomToken: string;
} {
  try {
    const parsed = JSON.parse(roomToken) as {
      version?: unknown;
      roomId?: unknown;
      componentRoomToken?: unknown;
    };
    if (
      parsed.version === 1 &&
      typeof parsed.roomId === 'string' &&
      typeof parsed.componentRoomToken === 'string'
    ) {
      return {
        roomId: parsed.roomId,
        componentRoomToken: parsed.componentRoomToken,
      };
    }
  } catch {
    // Fall through to the stable public error below.
  }
  throw new ConvexError('INVALID_PRESENCE_ROOM_TOKEN');
}

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({
    roomToken: v.string(),
    sessionToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const authenticatedUserId = await requireAuthUser(ctx);
    if (args.userId && args.userId !== String(authenticatedUserId)) {
      throw new ConvexError('PRESENCE_USER_MISMATCH');
    }
    if (
      !Number.isFinite(args.interval) ||
      args.interval < 5_000 ||
      args.interval > 60_000
    ) {
      throw new ConvexError('INVALID_PRESENCE_INTERVAL');
    }
    if (!args.sessionId || args.sessionId.length > 500) {
      throw new ConvexError('INVALID_PRESENCE_SESSION');
    }
    await validateRoom(ctx, args.roomId);
    const tokens = await collaborationPresence.heartbeat(
      ctx,
      args.roomId,
      String(authenticatedUserId),
      args.sessionId,
      args.interval,
    );
    return {
      roomToken: encodeRoomToken(args.roomId, tokens.roomToken),
      sessionToken: tokens.sessionToken,
    };
  },
});

export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(presenceStateValidator),
  handler: async (ctx, args) => {
    const { roomId, componentRoomToken } = decodeRoomToken(args.roomToken);
    await validateRoom(ctx, roomId);
    const states = await collaborationPresence.list(
      ctx,
      componentRoomToken,
      100,
    );
    return states.map(state => ({
      userId: state.userId,
      online: state.online,
      lastDisconnected: state.lastDisconnected,
      data:
        typeof state.data === 'object' &&
        state.data !== null &&
        typeof (state.data as { typing?: unknown }).typing === 'boolean'
          ? { typing: (state.data as { typing: boolean }).typing }
          : undefined,
    }));
  },
});

export const updateData = mutation({
  args: {
    roomId: v.string(),
    data: v.object({ typing: v.boolean() }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUser(ctx);
    await validateRoom(ctx, args.roomId);
    return await collaborationPresence.updateRoomUser(
      ctx,
      args.roomId,
      String(userId),
      args.data,
    );
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.sessionToken || args.sessionToken.length > 4_096) {
      throw new ConvexError('INVALID_PRESENCE_SESSION_TOKEN');
    }
    return await collaborationPresence.disconnect(ctx, args.sessionToken);
  },
});

export const channelRoomId = query({
  args: {
    channelId: v.id('channels'),
    threadRootId: v.optional(v.id('channelMessages')),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireChannelAccess(ctx, args.channelId, { includeArchived: true });
    if (args.threadRootId) {
      const root = await ctx.db.get('channelMessages', args.threadRootId);
      if (!root || root.channelId !== args.channelId || root.threadRootId) {
        throw new ConvexError('THREAD_ROOT_NOT_FOUND');
      }
      return `thread/${String(args.channelId)}/${String(args.threadRootId)}`;
    }
    return `channel/${String(args.channelId)}`;
  },
});
