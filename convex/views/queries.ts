import { paginationOptsValidator } from 'convex/server';
import { query, type QueryCtx } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { getAuthUserId } from '../authUtils';
import { getOrganizationBySlug, hasScopedPermission } from '../authz';
import { canViewProject, canViewTeam } from '../access';
import { PERMISSIONS } from '../_shared/permissions';
import {
  buildIssueVisibilityAccess,
  canUserViewIssueFromAccess,
  collectIssueCandidates,
  flattenIssueRows,
  loadAssignmentsByIssue,
} from '../issues/queries';

// ─── Helpers ───────────────────────────────────────────────────────────

/** Check whether a user can see a given view. */
async function canAccessView(
  ctx: QueryCtx,
  view: Doc<'views'>,
  userId: Id<'users'> | null,
): Promise<boolean> {
  if (view.visibility === 'public') return true;
  if (!userId) return false;
  if (view.visibility === 'private') return view.createdBy === userId;
  // 'organization' — must be an org member
  const membership = await ctx.db
    .query('members')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', view.organizationId).eq('userId', userId),
    )
    .first();
  return !!membership;
}

async function canEditView(
  ctx: QueryCtx,
  view: Doc<'views'>,
  userId: Id<'users'> | null,
): Promise<boolean> {
  if (!userId) return false;
  if (view.createdBy === userId) return true;

  return hasScopedPermission(
    ctx,
    { organizationId: view.organizationId },
    userId,
    PERMISSIONS.VIEW_EDIT,
  );
}

type ViewListScope = 'mine' | 'all';

function matchesViewScope(
  view: Doc<'views'>,
  scope: ViewListScope,
  userId: Id<'users'>,
  isOrgMember: boolean,
) {
  if (scope === 'mine') {
    return view.createdBy === userId;
  }

  if (view.visibility === 'private') return view.createdBy === userId;
  if (view.visibility === 'public') return true;
  if (view.visibility === 'organization') return isOrgMember;
  return false;
}

async function hydrateViewRows(
  ctx: QueryCtx,
  views: readonly Doc<'views'>[],
  userId: Id<'users'>,
  hasViewEdit: boolean,
  hasViewDelete: boolean,
) {
  const creatorIds = [...new Set(views.map(v => v.createdBy))];
  const creators = await Promise.all(
    creatorIds.map(id => ctx.db.get('users', id)),
  );
  const creatorMap = new Map(creatorIds.map((id, i) => [id, creators[i]]));

  return views.map(view => ({
    _id: view._id,
    name: view.name,
    description: view.description,
    icon: view.icon,
    color: view.color,
    filters: view.filters,
    layout: view.layout,
    visibility: view.visibility,
    createdBy: view.createdBy,
    canEdit: view.createdBy === userId || hasViewEdit,
    canDelete: view.createdBy === userId || hasViewDelete,
    updatedAt: view.updatedAt ?? view._creationTime,
    creator: (() => {
      const user = creatorMap.get(view.createdBy);
      return user
        ? {
            _id: user._id,
            name: user.name ?? undefined,
            email: user.email ?? undefined,
            image: user.image ?? undefined,
          }
        : null;
    })(),
  }));
}

/** Resolve filter entities to display labels for filter chips. */
async function resolveFilterMeta(
  ctx: QueryCtx,
  filters: Doc<'views'>['filters'],
) {
  const meta: {
    team?: { _id: string; name: string; icon?: string; color?: string } | null;
    project?: {
      _id: string;
      name: string;
      icon?: string;
      color?: string;
    } | null;
    priorities?: Array<{
      _id: string;
      name: string;
      icon?: string;
      color?: string;
    }>;
    workflowStates?: Array<{
      _id: string;
      name: string;
      icon?: string;
      color?: string;
      type: string;
    }>;
    assignees?: Array<{
      _id: string;
      name?: string;
      email?: string;
      image?: string;
    }>;
    labels?: Array<{ _id: string; name: string; color?: string }>;
  } = {};

  if (filters.teamId) {
    const team = await ctx.db.get('teams', filters.teamId);
    meta.team = team
      ? {
          _id: team._id,
          name: team.name,
          icon: team.icon ?? undefined,
          color: team.color ?? undefined,
        }
      : null;
  }
  if (filters.projectId) {
    const project = await ctx.db.get('projects', filters.projectId);
    meta.project = project
      ? {
          _id: project._id,
          name: project.name,
          icon: project.icon ?? undefined,
          color: project.color ?? undefined,
        }
      : null;
  }
  if (filters.priorityIds?.length) {
    const priorities = await Promise.all(
      filters.priorityIds.map(id => ctx.db.get('issuePriorities', id)),
    );
    meta.priorities = priorities
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(p => ({
        _id: p._id,
        name: p.name,
        icon: p.icon ?? undefined,
        color: p.color ?? undefined,
      }));
  }
  if (filters.workflowStateIds?.length) {
    const states = await Promise.all(
      filters.workflowStateIds.map(id => ctx.db.get('issueStates', id)),
    );
    meta.workflowStates = states
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map(s => ({
        _id: s._id,
        name: s.name,
        icon: s.icon ?? undefined,
        color: s.color ?? undefined,
        type: s.type,
      }));
  }
  if (filters.assigneeIds?.length) {
    const users = await Promise.all(
      filters.assigneeIds.map(id => ctx.db.get('users', id)),
    );
    meta.assignees = users
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map(u => ({
        _id: u._id,
        name: u.name ?? undefined,
        email: u.email ?? undefined,
        image: u.image ?? undefined,
      }));
  }
  if (filters.labelIds?.length) {
    const labels = await Promise.all(
      filters.labelIds.map(id => ctx.db.get('issueLabels', id)),
    );
    meta.labels = labels
      .filter((l): l is NonNullable<typeof l> => !!l)
      .map(l => ({
        _id: l._id,
        name: l.name,
        color: l.color ?? undefined,
      }));
  }
  return meta;
}

/** Apply view filters to a list of issues. */
function applyFilters(
  issues: Doc<'issues'>[],
  filters: Doc<'views'>['filters'],
  labelAssignmentsByIssue?: Map<string, Set<string>>,
): Doc<'issues'>[] {
  return issues.filter(issue => {
    if (filters.teamId && issue.teamId !== filters.teamId) return false;
    if (filters.projectId && issue.projectId !== filters.projectId)
      return false;
    if (
      filters.priorityIds?.length &&
      (!issue.priorityId || !filters.priorityIds.includes(issue.priorityId))
    )
      return false;
    if (
      filters.workflowStateIds?.length &&
      (!issue.workflowStateId ||
        !filters.workflowStateIds.includes(issue.workflowStateId))
    )
      return false;
    if (filters.workflowStateTypes?.length && issue.workflowStateId) {
      // This is checked later with state type lookup — skip inline for now
      // (handled in caller)
    }
    if (filters.labelIds?.length && labelAssignmentsByIssue) {
      const issueLabels = labelAssignmentsByIssue.get(issue._id as string);
      if (!issueLabels) return false;
      const hasAny = filters.labelIds.some(id => issueLabels.has(id as string));
      if (!hasAny) return false;
    }
    return true;
  });
}

async function resolveViewIssuePage(
  ctx: QueryCtx,
  view: Doc<'views'>,
  candidates: Doc<'issues'>[],
  page?: number,
  pageSize?: number,
) {
  const assignmentsByIssue = await loadAssignmentsByIssue(
    ctx,
    candidates.map(issue => issue._id),
  );

  const candidatesWithResolvedState = candidates.map(issue => {
    const effectiveStateId =
      issue.workflowStateId ??
      assignmentsByIssue.get(issue._id)?.find(assignment => assignment.stateId)
        ?.stateId ??
      issue.workflowStateId;

    return {
      ...issue,
      workflowStateId: effectiveStateId,
    };
  });

  let labelAssignmentsByIssue: Map<string, Set<string>> | undefined;
  if (view.filters.labelIds?.length) {
    labelAssignmentsByIssue = new Map();
    const labelAssignments = await Promise.all(
      candidatesWithResolvedState.map(issue =>
        ctx.db
          .query('issueLabelAssignments')
          .withIndex('by_issue', q => q.eq('issueId', issue._id))
          .collect(),
      ),
    );
    candidatesWithResolvedState.forEach((issue, index) => {
      labelAssignmentsByIssue!.set(
        issue._id as string,
        new Set(
          labelAssignments[index].map(
            assignment => assignment.labelId as string,
          ),
        ),
      );
    });
  }

  let filtered = applyFilters(
    candidatesWithResolvedState,
    view.filters,
    labelAssignmentsByIssue,
  );

  if (view.filters.workflowStateTypes?.length) {
    const allStates = await ctx.db
      .query('issueStates')
      .withIndex('by_organization', q =>
        q.eq('organizationId', view.organizationId),
      )
      .collect();
    const stateTypeMap = new Map(
      allStates.map(state => [state._id, state.type]),
    );
    const allowedTypes = new Set(view.filters.workflowStateTypes);
    filtered = filtered.filter(issue => {
      if (!issue.workflowStateId) return false;
      const stateType = stateTypeMap.get(issue.workflowStateId);
      return stateType ? allowedTypes.has(stateType) : false;
    });
  }

  if (view.filters.assigneeIds?.length) {
    const allowedAssigneeIds = new Set(view.filters.assigneeIds);
    filtered = filtered.filter(issue =>
      (assignmentsByIssue.get(issue._id) ?? []).some(
        assignment =>
          assignment.assigneeId &&
          allowedAssigneeIds.has(assignment.assigneeId),
      ),
    );
  }

  const exclusions = await ctx.db
    .query('viewExclusions')
    .withIndex('by_view', q => q.eq('viewId', view._id))
    .collect();
  const excludedIds = new Set(exclusions.map(exclusion => exclusion.issueId));
  if (excludedIds.size > 0) {
    filtered = filtered.filter(issue => !excludedIds.has(issue._id));
  }

  filtered.sort(
    (a, b) =>
      (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
  );

  const total = filtered.length;
  const normalizedPageSize =
    pageSize && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : undefined;
  const normalizedPage = page && page > 0 ? Math.floor(page) : 1;
  const paged =
    normalizedPageSize !== undefined
      ? filtered.slice(
          (normalizedPage - 1) * normalizedPageSize,
          normalizedPage * normalizedPageSize,
        )
      : filtered;

  return {
    issues: paged,
    total,
    assignmentsByIssue: new Map(
      paged.map(issue => [issue._id, assignmentsByIssue.get(issue._id) ?? []]),
    ),
  };
}

// ─── Queries ───────────────────────────────────────────────────────────

export const listViews = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();

    const allViews = await ctx.db
      .query('views')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();
    const [hasViewEdit, hasViewDelete] = await Promise.all([
      hasScopedPermission(
        ctx,
        { organizationId: org._id },
        userId,
        PERMISSIONS.VIEW_EDIT,
      ),
      hasScopedPermission(
        ctx,
        { organizationId: org._id },
        userId,
        PERMISSIONS.VIEW_DELETE,
      ),
    ]);

    // Filter to views user can see
    const visible = allViews.filter(view => {
      if (view.visibility === 'public') return true;
      if (view.visibility === 'organization') return Boolean(membership);
      if (view.visibility === 'private') return view.createdBy === userId;
      return false;
    });

    // Sort by updatedAt desc
    visible.sort(
      (a, b) =>
        (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
    );

    // Hydrate creator info
    const creatorIds = [...new Set(visible.map(v => v.createdBy))];
    const creators = await Promise.all(
      creatorIds.map(id => ctx.db.get('users', id)),
    );
    const creatorMap = new Map(creatorIds.map((id, i) => [id, creators[i]]));

    return visible.map(view => ({
      _id: view._id,
      name: view.name,
      description: view.description,
      icon: view.icon,
      color: view.color,
      filters: view.filters,
      layout: view.layout,
      visibility: view.visibility,
      createdBy: view.createdBy,
      canEdit: view.createdBy === userId || hasViewEdit,
      canDelete: view.createdBy === userId || hasViewDelete,
      updatedAt: view.updatedAt ?? view._creationTime,
      creator: (() => {
        const user = creatorMap.get(view.createdBy);
        return user
          ? {
              _id: user._id,
              name: user.name ?? undefined,
              email: user.email ?? undefined,
              image: user.image ?? undefined,
            }
          : null;
      })(),
    }));
  },
});

export const listViewsPage = query({
  args: {
    orgSlug: v.string(),
    scope: v.union(v.literal('mine'), v.literal('all')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();
    const [hasViewEdit, hasViewDelete] = await Promise.all([
      hasScopedPermission(
        ctx,
        { organizationId: org._id },
        userId,
        PERMISSIONS.VIEW_EDIT,
      ),
      hasScopedPermission(
        ctx,
        { organizationId: org._id },
        userId,
        PERMISSIONS.VIEW_DELETE,
      ),
    ]);

    const target = Math.max(1, args.paginationOpts.numItems);
    const pageItems: Doc<'views'>[] = [];
    let cursor = args.paginationOpts.cursor;
    let isDone = false;

    while (pageItems.length < target && !isDone) {
      const source = await ctx.db
        .query('views')
        .withIndex('by_organization', q => q.eq('organizationId', org._id))
        .order('desc')
        .paginate({
          cursor,
          numItems: target - pageItems.length,
        });

      for (const view of source.page) {
        if (matchesViewScope(view, args.scope, userId, Boolean(membership))) {
          pageItems.push(view);
        }
      }

      cursor = source.continueCursor;
      isDone = source.isDone || !source.continueCursor;
    }

    return {
      page: await hydrateViewRows(
        ctx,
        pageItems,
        userId,
        hasViewEdit,
        hasViewDelete,
      ),
      continueCursor: cursor ?? '',
      isDone,
    };
  },
});

export const getListSummary = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const org = await getOrganizationBySlug(ctx, args.orgSlug);
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', org._id).eq('userId', userId),
      )
      .first();
    const allViews = await ctx.db
      .query('views')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    return {
      mineCount: allViews.filter(view =>
        matchesViewScope(view, 'mine', userId, Boolean(membership)),
      ).length,
      sharedCount: allViews.filter(view =>
        matchesViewScope(view, 'all', userId, Boolean(membership)),
      ).length,
    };
  },
});

export const getById = query({
  args: {
    viewId: v.id('views'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const view = await ctx.db.get('views', args.viewId);
    if (!view) return null;

    if (!(await canAccessView(ctx, view, userId))) {
      throw new ConvexError('FORBIDDEN');
    }

    const org = await ctx.db.get('organizations', view.organizationId);
    const creator = await ctx.db.get('users', view.createdBy);
    const filterMeta = await resolveFilterMeta(ctx, view.filters);
    const canEdit = await canEditView(ctx, view, userId);

    return {
      ...view,
      orgSlug: org?.slug,
      orgName: org?.name,
      canEdit,
      creator: creator
        ? {
            _id: creator._id,
            name: creator.name ?? undefined,
            email: creator.email ?? undefined,
            image: creator.image ?? undefined,
          }
        : null,
      filterMeta,
    };
  },
});

export const listViewIssues = query({
  args: {
    viewId: v.id('views'),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('AUTH_REQUIRED');

    const view = await ctx.db.get('views', args.viewId);
    if (!view) return { issues: [], total: 0 };
    if (!(await canAccessView(ctx, view, userId))) {
      throw new ConvexError('FORBIDDEN');
    }

    const [scopedProject, scopedTeam] = await Promise.all([
      view.filters.projectId
        ? ctx.db.get('projects', view.filters.projectId)
        : null,
      view.filters.teamId ? ctx.db.get('teams', view.filters.teamId) : null,
    ]);

    if (
      (view.filters.projectId &&
        (!scopedProject ||
          scopedProject.organizationId !== view.organizationId)) ||
      (view.filters.teamId &&
        (!scopedTeam || scopedTeam.organizationId !== view.organizationId))
    ) {
      return { issues: [], total: 0 };
    }

    const access = await buildIssueVisibilityAccess(
      ctx,
      userId,
      view.organizationId,
    );
    const [scopedProjectVisible, scopedTeamVisible] = await Promise.all([
      scopedProject ? canViewProject(ctx, scopedProject) : false,
      scopedTeam ? canViewTeam(ctx, scopedTeam) : false,
    ]);

    const candidateIssues = await collectIssueCandidates(ctx, {
      organizationId: view.organizationId,
      projectId: scopedProject?._id,
      teamId: scopedTeam?._id,
      projectKey: scopedProject?.key,
    });

    const visibleIssues = candidateIssues.filter(issue =>
      canUserViewIssueFromAccess(access, issue, {
        scopedProjectId: scopedProjectVisible ? scopedProject?._id : undefined,
        scopedProjectVisible,
        scopedTeamId: scopedTeamVisible ? scopedTeam?._id : undefined,
        scopedTeamVisible,
      }),
    );

    const {
      issues: pagedIssues,
      total,
      assignmentsByIssue,
    } = await resolveViewIssuePage(
      ctx,
      view,
      visibleIssues,
      args.page,
      args.pageSize,
    );

    return {
      issues: await flattenIssueRows(ctx, pagedIssues, assignmentsByIssue),
      total,
    };
  },
});

// ─── Public (unauthenticated) queries ──────────────────────────────────

export const getPublicView = query({
  args: {
    orgSlug: v.string(),
    viewId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', q => q.eq('slug', args.orgSlug))
      .first();
    if (!org) return null;

    let view: Doc<'views'> | null;
    try {
      const normalizedId = ctx.db.normalizeId('views', args.viewId);
      if (!normalizedId) return null;
      view = await ctx.db.get('views', normalizedId);
    } catch {
      return null;
    }
    if (!view || view.visibility !== 'public') return null;
    if (view.organizationId !== org._id) return null;

    const filterMeta = await resolveFilterMeta(ctx, view.filters);

    const creator = await ctx.db.get('users', view.createdBy);

    // All org statuses for kanban empty-column display
    const allStatuses = await ctx.db
      .query('issueStates')
      .withIndex('by_organization', q => q.eq('organizationId', org._id))
      .collect();

    return {
      _id: view._id,
      name: view.name,
      description: view.description,
      icon: view.icon,
      color: view.color,
      filters: view.filters,
      layout: view.layout,
      visibility: view.visibility,
      updatedAt: view.updatedAt ?? view._creationTime,
      orgSlug: org.slug,
      orgName: org.name,
      orgLogo: org.logo ? await ctx.storage.getUrl(org.logo) : null,
      creator: creator
        ? {
            name: creator.name ?? undefined,
            email: creator.email ?? undefined,
            image: creator.image ?? undefined,
          }
        : null,
      allStatuses: allStatuses.map(s => ({
        _id: s._id as string,
        name: s.name,
        color: s.color ?? null,
        icon: s.icon ?? null,
        type: s.type,
      })),
      filterMeta,
    };
  },
});

export const listPublicViewIssues = query({
  args: {
    viewId: v.string(),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let view: Doc<'views'> | null;
    try {
      const normalizedId = ctx.db.normalizeId('views', args.viewId);
      if (!normalizedId) return { issues: [], total: 0 };
      view = await ctx.db.get('views', normalizedId);
    } catch {
      return { issues: [], total: 0 };
    }
    if (!view || view.visibility !== 'public') return { issues: [], total: 0 };

    const rawCandidates = await ctx.db
      .query('issues')
      .withIndex('by_organization', q =>
        q.eq('organizationId', view!.organizationId),
      )
      .collect();
    const {
      issues: paged,
      total,
      assignmentsByIssue,
    } = await resolveViewIssuePage(
      ctx,
      view,
      rawCandidates,
      args.page,
      args.pageSize,
    );

    // Hydrate each issue — limited or full based on issue visibility
    const stateIds = [
      ...new Set(
        paged
          .map(i => i.workflowStateId)
          .filter((id): id is Id<'issueStates'> => !!id),
      ),
    ];
    const priorityIds = [
      ...new Set(
        paged
          .map(i => i.priorityId)
          .filter((id): id is Id<'issuePriorities'> => !!id),
      ),
    ];
    const projectIds = [
      ...new Set(
        paged.map(i => i.projectId).filter((id): id is Id<'projects'> => !!id),
      ),
    ];
    const teamIds = [
      ...new Set(
        paged.map(i => i.teamId).filter((id): id is Id<'teams'> => !!id),
      ),
    ];

    const [states, priorities, projects, teams] = await Promise.all([
      Promise.all(stateIds.map(id => ctx.db.get('issueStates', id))),
      Promise.all(priorityIds.map(id => ctx.db.get('issuePriorities', id))),
      Promise.all(projectIds.map(id => ctx.db.get('projects', id))),
      Promise.all(teamIds.map(id => ctx.db.get('teams', id))),
    ]);

    const stateMap = new Map(stateIds.map((id, i) => [id, states[i]]));
    const priorityMap = new Map(
      priorityIds.map((id, i) => [id, priorities[i]]),
    );
    const projectMap = new Map(projectIds.map((id, i) => [id, projects[i]]));
    const teamMap = new Map(teamIds.map((id, i) => [id, teams[i]]));

    // Load assignees for public issues
    const publicIssues = paged.filter(i => i.visibility === 'public');
    const assigneesByIssue = new Map<
      string,
      Array<{ name?: string; image?: string }>
    >();
    if (publicIssues.length > 0) {
      const assignmentResults = publicIssues.map(
        issue => assignmentsByIssue.get(issue._id) ?? [],
      );
      const allAssigneeIds = [
        ...new Set(
          assignmentResults
            .flat()
            .map(a => a.assigneeId)
            .filter((id): id is Id<'users'> => !!id),
        ),
      ];
      const assigneeUsers = await Promise.all(
        allAssigneeIds.map(id => ctx.db.get('users', id)),
      );
      const assigneeMap = new Map(
        allAssigneeIds.map((id, i) => [id, assigneeUsers[i]]),
      );

      publicIssues.forEach((issue, idx) => {
        const assignments = assignmentResults[idx];
        assigneesByIssue.set(
          issue._id as string,
          assignments
            .filter(a => a.assigneeId)
            .map(a => {
              const user = assigneeMap.get(a.assigneeId!);
              return {
                name: user?.name ?? user?.email ?? undefined,
                image: user?.image ?? undefined,
              };
            }),
        );
      });
    }

    const issues = paged.map(issue => {
      const isPublic = issue.visibility === 'public';
      const state = issue.workflowStateId
        ? stateMap.get(issue.workflowStateId)
        : null;

      const base = {
        _id: issue._id,
        key: issue.key,
        title: issue.title,
        description: isPublic ? (issue.description ?? null) : null,
        isPublic,
        status: state
          ? {
              name: state.name,
              color: state.color ?? null,
              type: state.type,
              icon: state.icon ?? null,
            }
          : null,
      };

      if (!isPublic) return base;

      // Full details for public issues
      const priority = issue.priorityId
        ? priorityMap.get(issue.priorityId)
        : null;
      const project = issue.projectId ? projectMap.get(issue.projectId) : null;
      const team = issue.teamId ? teamMap.get(issue.teamId) : null;

      return {
        ...base,
        priority: priority
          ? {
              name: priority.name,
              color: priority.color ?? null,
              icon: priority.icon ?? null,
            }
          : null,
        assignees: assigneesByIssue.get(issue._id as string) ?? [],
        project: project ? { name: project.name, key: project.key } : null,
        team: team ? { name: team.name, key: team.key } : null,
        startDate: issue.startDate ?? null,
        dueDate: issue.dueDate ?? null,
      };
    });

    return { issues, total };
  },
});

export const getViewExcludedIssueIds = query({
  args: { viewId: v.id('views') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const exclusions = await ctx.db
      .query('viewExclusions')
      .withIndex('by_view', q => q.eq('viewId', args.viewId))
      .collect();
    return exclusions.map(e => e.issueId as string);
  },
});

export const getViewsContainingIssue = query({
  args: {
    issueId: v.id('issues'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const issue = await ctx.db.get('issues', args.issueId);
    if (!issue) return [];

    // Get all non-private views for this org
    const views = await ctx.db
      .query('views')
      .withIndex('by_organization', q =>
        q.eq('organizationId', issue.organizationId),
      )
      .collect();

    const nonPrivateViews = views.filter(
      v => v.visibility === 'public' || v.visibility === 'organization',
    );

    // Check which views' filters match this issue
    const matching: Array<{
      _id: Id<'views'>;
      name: string;
      visibility: string;
      isExcluded: boolean;
    }> = [];

    // Load issue's labels for label filter matching
    const issueLabels = await ctx.db
      .query('issueLabelAssignments')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();
    const issueLabelIds = new Set(issueLabels.map(l => l.labelId as string));

    // Load issue's assignees for assignee filter matching
    const issueAssignees = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue', q => q.eq('issueId', issue._id))
      .collect();
    const issueAssigneeIds = new Set(
      issueAssignees
        .map(a => a.assigneeId)
        .filter((id): id is Id<'users'> => !!id)
        .map(id => id as string),
    );

    // Load issue's workflow state type
    let issueStateType: string | undefined;
    if (issue.workflowStateId) {
      const state = await ctx.db.get('issueStates', issue.workflowStateId);
      issueStateType = state?.type;
    }

    for (const view of nonPrivateViews) {
      const f = view.filters;
      let matches = true;

      if (f.teamId && issue.teamId !== f.teamId) matches = false;
      if (f.projectId && issue.projectId !== f.projectId) matches = false;
      if (
        f.priorityIds?.length &&
        (!issue.priorityId || !f.priorityIds.includes(issue.priorityId))
      )
        matches = false;
      if (
        f.workflowStateIds?.length &&
        (!issue.workflowStateId ||
          !f.workflowStateIds.includes(issue.workflowStateId))
      )
        matches = false;
      if (f.workflowStateTypes?.length) {
        if (!issueStateType || !f.workflowStateTypes.includes(issueStateType))
          matches = false;
      }
      if (f.assigneeIds?.length) {
        const hasMatchingAssignee = f.assigneeIds.some(id =>
          issueAssigneeIds.has(id as string),
        );
        if (!hasMatchingAssignee) matches = false;
      }
      if (f.labelIds?.length) {
        const hasMatchingLabel = f.labelIds.some(id =>
          issueLabelIds.has(id as string),
        );
        if (!hasMatchingLabel) matches = false;
      }

      if (matches) {
        // Include if this view has broader visibility than the issue, or same
        const issueVis = issue.visibility ?? 'organization';
        const viewVis = view.visibility;
        const visOrder = { private: 0, organization: 1, public: 2 };
        if (visOrder[viewVis] >= visOrder[issueVis]) {
          const exclusion = await ctx.db
            .query('viewExclusions')
            .withIndex('by_view_issue', q =>
              q.eq('viewId', view._id).eq('issueId', issue._id),
            )
            .first();
          matching.push({
            _id: view._id,
            name: view.name,
            visibility: view.visibility,
            isExcluded: !!exclusion,
          });
        }
      }
    }

    return matching;
  },
});
