import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '../authUtils';
import { internalQuery, query } from '../_generated/server';
import {
  evaluateSignupEmailAddress,
  getSiteSettings,
  requirePlatformAdminUser,
  type SignupRestrictionResult,
} from './lib';

export const getSignupPolicy = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    await requirePlatformAdminUser(ctx.db, userId);

    const settings = await getSiteSettings(ctx.db);

    return {
      blockedDomains: settings?.signupBlockedEmailDomains ?? [],
      allowedDomains: settings?.signupAllowedEmailDomains ?? [],
      sync: settings?.signupDisposableDomainSync ?? {
        totalRulesCount: 0,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        deletedCount: 0,
        skippedCount: 0,
      },
    };
  },
});

export const assertPlatformAdmin = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError('UNAUTHORIZED');
    }

    await requirePlatformAdminUser(ctx.db, userId);
    return { ok: true as const };
  },
});

export const listSignupEmailDomainRulesPageBySource = internalQuery({
  args: {
    source: v.union(v.literal('manual'), v.literal('upstream_disposable')),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    domains: v.array(v.string()),
    continueCursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(2_000, Math.max(1, Math.floor(args.limit ?? 1_000)));

    const page = await ctx.db
      .query('signupEmailDomainRules')
      .withIndex('by_source', q => q.eq('source', args.source))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    return {
      domains: page.page.map(rule => rule.domain),
      continueCursor: page.isDone ? undefined : page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const getSignupRestrictionPreview = internalQuery({
  args: {
    email: v.string(),
  },
  returns: v.object({
    blocked: v.boolean(),
    domain: v.union(v.string(), v.null()),
    reason: v.union(v.literal('not_allowed'), v.literal('blocked'), v.null()),
  }),
  handler: async (ctx, args): Promise<SignupRestrictionResult> => {
    return await evaluateSignupEmailAddress(ctx.db, args.email);
  },
});
