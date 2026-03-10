import { listUIMessages, syncStreams, vStreamArgs } from '@convex-dev/agent';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { components } from '../_generated/api';
import { query } from '../_generated/server';
import { getAuthUserId } from '../authUtils';
import { requireOrgForAssistant, getAssistantThreadRow } from './lib';

export const getThreadForCurrentUser = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );
    return await getAssistantThreadRow(ctx, organization._id, userId);
  },
});

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const denied = {
      page: [],
      isDone: true,
      continueCursor: '',
      streams: undefined,
    };

    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return denied;
    }
    const row = await ctx.db
      .query('assistantThreads')
      .withIndex('by_threadId', q => q.eq('threadId', args.threadId))
      .first();

    if (!row || row.userId !== userId) {
      return denied;
    }

    await requireOrgForAssistant(
      ctx,
      (await ctx.db.get('organizations', row.organizationId))?.slug ?? '',
      userId,
    );

    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = args.streamArgs
      ? await syncStreams(ctx, components.agent, {
          threadId: args.threadId,
          streamArgs: args.streamArgs,
        })
      : undefined;

    return {
      ...paginated,
      streams: streams ?? undefined,
    };
  },
});

export const listPendingActions = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const organization = await requireOrgForAssistant(
      ctx,
      args.orgSlug,
      userId,
    );

    return await ctx.db
      .query('assistantActions')
      .withIndex('by_user_status', q =>
        q.eq('userId', userId).eq('status', 'pending'),
      )
      .filter(q => q.eq(q.field('organizationId'), organization._id))
      .collect();
  },
});
