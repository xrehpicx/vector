import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { query, type QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { canViewIssue } from '../access';
import { getOrganizationBySlug, requireOrganizationMember } from '../authz';
import { getAuthUserId } from '../authUtils';
import { canDeleteRequest, canEditRequest, canViewRequest } from './lib';

async function userSummary(ctx: QueryCtx, userId?: Id<'users'>) {
  if (!userId) return null;
  const user = await ctx.db.get('users', userId);
  return user
    ? {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        image: user.image,
      }
    : null;
}

export const list = query({
  args: {
    orgSlug: v.string(),
    scope: v.optional(
      v.union(
        v.literal('inbox'),
        v.literal('mine'),
        v.literal('requested'),
        v.literal('all'),
      ),
    ),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('UNAUTHORIZED');
    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    await requireOrganizationMember(ctx, org._id, userId);
    const search = args.search?.trim();
    if (search && search.length > 200) {
      throw new ConvexError('INVALID_SEARCH');
    }
    const fetchPage = (paginationOpts: typeof args.paginationOpts) => {
      if (search) {
        return ctx.db
          .query('requests')
          .withSearchIndex('search_text', q =>
            q.search('searchText', search).eq('organizationId', org._id),
          )
          .paginate(paginationOpts);
      }
      if (args.scope === 'mine') {
        return ctx.db
          .query('requests')
          .withIndex('by_org_owner_focus_created', q =>
            q.eq('organizationId', org._id).eq('ownerId', userId),
          )
          .order('asc')
          .paginate(paginationOpts);
      }
      if (args.scope === 'requested') {
        return ctx.db
          .query('requests')
          .withIndex('by_org_requester_focus_created', q =>
            q.eq('organizationId', org._id).eq('requesterId', userId),
          )
          .order('asc')
          .paginate(paginationOpts);
      }
      return ctx.db
        .query('requests')
        .withIndex('by_org_focus_created', q => q.eq('organizationId', org._id))
        .order('asc')
        .paginate(paginationOpts);
    };

    const enrich = async (requests: Doc<'requests'>[]) => {
      const visible = (
        await Promise.all(
          requests.map(async request =>
            (await canViewRequest(ctx, request)) ? request : null,
          ),
        )
      ).filter((request): request is Doc<'requests'> => Boolean(request));
      const enriched = (
        await Promise.all(
          visible.map(async request => {
            if (args.scope === 'mine' && request.ownerId !== userId) {
              return null;
            }
            if (args.scope === 'requested' && request.requesterId !== userId) {
              return null;
            }
            const [owner, requester, links, recipients, canDelete] =
              await Promise.all([
                userSummary(ctx, request.ownerId),
                userSummary(ctx, request.requesterId),
                ctx.db
                  .query('requestWorkLinks')
                  .withIndex('by_request', q => q.eq('requestId', request._id))
                  .collect(),
                ctx.db
                  .query('requestRecipients')
                  .withIndex('by_request', q => q.eq('requestId', request._id))
                  .collect(),
                canDeleteRequest(ctx, request),
              ]);
            if (
              args.scope === 'inbox' &&
              request.ownerId !== userId &&
              request.requesterId !== userId &&
              request.createdBy !== userId &&
              !recipients.some(
                recipient =>
                  recipient.role === 'recipient' && recipient.userId === userId,
              )
            ) {
              return null;
            }
            return {
              ...request,
              owner,
              requester,
              linkedWorkCount: links.length,
              recipientCount: recipients.filter(r => r.role === 'recipient')
                .length,
              canDelete,
            };
          }),
        )
      ).filter(request => request !== null);
      return args.scope === 'inbox'
        ? enriched.filter(request =>
            ['new', 'routed', 'ready_for_review', 'changes_requested'].includes(
              request.status,
            ),
          )
        : enriched;
    };

    const page = await fetchPage(args.paginationOpts);
    // Inbox priority is applied by by_org_focus_created before pagination, so
    // urgent review/change requests cannot be hidden on a later page. Convex
    // only permits one paginated database query per function invocation; the
    // client loads subsequent filtered pages with the returned cursor.
    return { ...page, page: await enrich(page.page) };
  },
});

export const getByKey = query({
  args: { orgSlug: v.string(), requestKey: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) throw new ConvexError('ORGANIZATION_NOT_FOUND');
    const request = await ctx.db
      .query('requests')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.requestKey),
      )
      .first();
    if (!request) return null;
    if (!(await canViewRequest(ctx, request))) return null;
    const [requester, owner, recipientRows, workLinks] = await Promise.all([
      userSummary(ctx, request.requesterId),
      userSummary(ctx, request.ownerId),
      ctx.db
        .query('requestRecipients')
        .withIndex('by_request', q => q.eq('requestId', request._id))
        .collect(),
      ctx.db
        .query('requestWorkLinks')
        .withIndex('by_request', q => q.eq('requestId', request._id))
        .collect(),
    ]);
    const recipients = await Promise.all(
      recipientRows.map(async row => ({
        ...row,
        user: await userSummary(ctx, row.userId),
      })),
    );
    const linkedWork = (
      await Promise.all(
        workLinks.map(async link => {
          const work = await ctx.db.get('issues', link.workId);
          return work && (await canViewIssue(ctx, work))
            ? { ...work, relation: link.relation }
            : null;
        }),
      )
    ).filter(Boolean);
    return {
      ...request,
      requester,
      owner,
      recipients,
      linkedWork,
      canEdit: await canEditRequest(ctx, request),
      canDelete: await canDeleteRequest(ctx, request),
    };
  },
});

export const getByClientRequestId = query({
  args: { orgSlug: v.string(), clientRequestId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('UNAUTHORIZED');
    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    await requireOrganizationMember(ctx, org._id, userId);
    const clientRequestId = args.clientRequestId.trim();
    if (!clientRequestId || clientRequestId.length > 100) return null;
    const request = await ctx.db
      .query('requests')
      .withIndex('by_org_creator_client_request', q =>
        q
          .eq('organizationId', org._id)
          .eq('createdBy', userId)
          .eq('clientRequestId', clientRequestId),
      )
      .unique();
    if (!request || !(await canViewRequest(ctx, request))) return null;
    return { requestId: request._id, requestKey: request.key };
  },
});

export const listComments = query({
  args: { requestId: v.id('requests') },
  handler: async (ctx, args) => {
    const request = await ctx.db.get('requests', args.requestId);
    if (!request) throw new ConvexError('REQUEST_NOT_FOUND');
    if (!(await canViewRequest(ctx, request)))
      throw new ConvexError('FORBIDDEN');

    const comments = (
      await ctx.db
        .query('comments')
        .withIndex('by_request_deleted', q =>
          q.eq('requestId', request._id).eq('deleted', false),
        )
        .order('desc')
        .take(200)
    ).reverse();
    return await Promise.all(
      comments.map(async comment => ({
        ...comment,
        author: await userSummary(ctx, comment.authorId),
      })),
    );
  },
});

export const getPublicByKey = query({
  args: { orgSlug: v.string(), requestKey: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;
    const request = await ctx.db
      .query('requests')
      .withIndex('by_org_key', q =>
        q.eq('organizationId', org._id).eq('key', args.requestKey),
      )
      .first();
    if (!request || request.visibility !== 'public') return null;
    return {
      key: request.key,
      title: request.title,
      expectedOutput: request.expectedOutput,
      status: request.status,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
    };
  },
});
