import { ConvexError, v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import {
  canDeleteDocument,
  canDeleteIssue,
  canDeleteProject,
  canDeleteTeam,
  canEditDocument,
  canEditIssue,
  canEditProject,
  canEditTeam,
  canViewDocument,
  canViewIssue,
  canViewProject,
  canViewTeam,
} from '../access';
import { getOrganizationBySlug, requireOrganizationMember } from '../authz';
import { hasScopedPermission, PERMISSIONS } from '../permissions/utils';

export type AssistantPageContextKind =
  | 'documents_list'
  | 'document_detail'
  | 'document_folder'
  | 'issues_list'
  | 'issue_detail'
  | 'projects_list'
  | 'project_detail'
  | 'teams_list'
  | 'team_detail'
  | 'org_generic';

export type AssistantPageContext = {
  kind: AssistantPageContextKind;
  orgSlug: string;
  path: string;
  issueKey?: string;
  projectKey?: string;
  teamKey?: string;
  documentId?: string;
  folderId?: string;
  entityType?: 'document' | 'issue' | 'project' | 'team';
  entityId?: string;
  entityKey?: string;
  assigneeFilter?: string;
};

export type AssistantPendingAction = {
  id: string;
  kind: 'delete_entity';
  entityType: 'document' | 'issue' | 'project' | 'team';
  entityId: string;
  entityLabel: string;
  summary: string;
  createdAt: number;
};

export const assistantPageContextValidator = v.any();

export async function requireOrgForAssistant(
  ctx: QueryCtx | MutationCtx,
  orgSlug: string,
  userId: Id<'users'>,
) {
  const organization = await getOrganizationBySlug(ctx, orgSlug);
  await requireOrganizationMember(ctx, organization._id, userId);
  return organization;
}

export async function requireOrgPermissionForUser(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
) {
  const allowed = await hasScopedPermission(
    ctx,
    { organizationId },
    userId,
    permission,
  );

  if (!allowed) {
    throw new ConvexError('FORBIDDEN');
  }
}

export async function getAssistantThreadRow(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('assistantThreads')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', organizationId).eq('userId', userId),
    )
    .first();
}

export async function requireAssistantThreadRow(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
) {
  const row = await getAssistantThreadRow(ctx, organizationId, userId);
  if (!row) {
    throw new ConvexError('THREAD_NOT_FOUND');
  }
  return row;
}

export function buildAssistantThreadPatch(pageContext: AssistantPageContext) {
  return {
    lastContextType: pageContext.kind,
    lastContextPath: pageContext.path,
    lastEntityId: pageContext.entityId ?? pageContext.documentId,
    lastEntityKey:
      pageContext.entityKey ??
      pageContext.issueKey ??
      pageContext.projectKey ??
      pageContext.teamKey,
  };
}

export async function resolveDocumentFromContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  pageContext?: AssistantPageContext,
  documentId?: string | null,
) {
  const rawId = documentId ?? pageContext?.documentId;
  if (!rawId) {
    throw new ConvexError('DOCUMENT_CONTEXT_REQUIRED');
  }

  const normalizedId = ctx.db.normalizeId('documents', rawId);
  if (!normalizedId) {
    throw new ConvexError('DOCUMENT_NOT_FOUND');
  }

  const document = await ctx.db.get('documents', normalizedId);
  if (!document || document.organizationId !== organizationId) {
    throw new ConvexError('DOCUMENT_NOT_FOUND');
  }

  return document;
}

export async function resolveFolderFromContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  pageContext?: AssistantPageContext,
  folderId?: string | null,
) {
  const rawId = folderId ?? pageContext?.folderId;
  if (!rawId) {
    return null;
  }

  const normalizedId = ctx.db.normalizeId('documentFolders', rawId);
  if (!normalizedId) {
    throw new ConvexError('FOLDER_NOT_FOUND');
  }

  const folder = await ctx.db.get('documentFolders', normalizedId);
  if (!folder || folder.organizationId !== organizationId) {
    throw new ConvexError('FOLDER_NOT_FOUND');
  }

  return folder;
}

export async function resolveIssueFromContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  pageContext?: AssistantPageContext,
  issueKey?: string | null,
) {
  const key = issueKey ?? pageContext?.issueKey;
  if (!key) {
    throw new ConvexError('ISSUE_CONTEXT_REQUIRED');
  }

  const issue = await ctx.db
    .query('issues')
    .withIndex('by_org_key', q =>
      q.eq('organizationId', organizationId).eq('key', key),
    )
    .first();

  if (!issue) {
    throw new ConvexError('ISSUE_NOT_FOUND');
  }

  return issue;
}

export async function resolveProjectFromContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  pageContext?: AssistantPageContext,
  projectKey?: string | null,
) {
  const key = projectKey ?? pageContext?.projectKey;
  if (!key) {
    throw new ConvexError('PROJECT_CONTEXT_REQUIRED');
  }

  const project = await ctx.db
    .query('projects')
    .withIndex('by_org_key', q =>
      q.eq('organizationId', organizationId).eq('key', key),
    )
    .first();

  if (!project) {
    throw new ConvexError('PROJECT_NOT_FOUND');
  }

  return project;
}

export async function resolveTeamFromContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  pageContext?: AssistantPageContext,
  teamKey?: string | null,
) {
  const key = teamKey ?? pageContext?.teamKey;
  if (!key) {
    throw new ConvexError('TEAM_CONTEXT_REQUIRED');
  }

  const team = await ctx.db
    .query('teams')
    .withIndex('by_org_key', q =>
      q.eq('organizationId', organizationId).eq('key', key),
    )
    .first();

  if (!team) {
    throw new ConvexError('TEAM_NOT_FOUND');
  }

  return team;
}

export async function findIssuePriorityByName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  priorityName?: string | null,
) {
  if (!priorityName) {
    return null;
  }

  const priorities = await ctx.db
    .query('issuePriorities')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  return (
    priorities.find(
      priority => priority.name.toLowerCase() === priorityName.toLowerCase(),
    ) ?? null
  );
}

export async function findProjectStatusByName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  statusName?: string | null,
) {
  if (!statusName) {
    return null;
  }

  const statuses = await ctx.db
    .query('projectStatuses')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  return (
    statuses.find(
      status => status.name.toLowerCase() === statusName.toLowerCase(),
    ) ?? null
  );
}

export async function canViewEntity(
  ctx: QueryCtx | MutationCtx,
  entity: unknown,
  entityType: 'document' | 'issue' | 'project' | 'team',
) {
  switch (entityType) {
    case 'document':
      return await canViewDocument(
        ctx,
        entity as Awaited<ReturnType<typeof resolveDocumentFromContext>>,
      );
    case 'issue':
      return await canViewIssue(
        ctx,
        entity as Awaited<ReturnType<typeof resolveIssueFromContext>>,
      );
    case 'project':
      return await canViewProject(
        ctx,
        entity as Awaited<ReturnType<typeof resolveProjectFromContext>>,
      );
    case 'team':
      return await canViewTeam(
        ctx,
        entity as Awaited<ReturnType<typeof resolveTeamFromContext>>,
      );
  }
}

export async function canEditEntity(
  ctx: QueryCtx | MutationCtx,
  entity: unknown,
  entityType: 'document' | 'issue' | 'project' | 'team',
) {
  switch (entityType) {
    case 'document':
      return await canEditDocument(
        ctx,
        entity as Awaited<ReturnType<typeof resolveDocumentFromContext>>,
      );
    case 'issue':
      return await canEditIssue(
        ctx,
        entity as Awaited<ReturnType<typeof resolveIssueFromContext>>,
      );
    case 'project':
      return await canEditProject(
        ctx,
        entity as Awaited<ReturnType<typeof resolveProjectFromContext>>,
      );
    case 'team':
      return await canEditTeam(
        ctx,
        entity as Awaited<ReturnType<typeof resolveTeamFromContext>>,
      );
  }
}

export async function canDeleteEntity(
  ctx: QueryCtx | MutationCtx,
  entity: unknown,
  entityType: 'document' | 'issue' | 'project' | 'team',
) {
  switch (entityType) {
    case 'document':
      return await canDeleteDocument(
        ctx,
        entity as Awaited<ReturnType<typeof resolveDocumentFromContext>>,
      );
    case 'issue':
      return await canDeleteIssue(
        ctx,
        entity as Awaited<ReturnType<typeof resolveIssueFromContext>>,
      );
    case 'project':
      return await canDeleteProject(
        ctx,
        entity as Awaited<ReturnType<typeof resolveProjectFromContext>>,
      );
    case 'team':
      return await canDeleteTeam(
        ctx,
        entity as Awaited<ReturnType<typeof resolveTeamFromContext>>,
      );
  }
}

export async function findIssueStateByName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  stateName?: string | null,
) {
  if (!stateName) {
    return null;
  }

  const states = await ctx.db
    .query('issueStates')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  return (
    states.find(
      state => state.name.toLowerCase() === stateName.toLowerCase(),
    ) ?? null
  );
}

export async function findMemberByName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  nameOrEmail?: string | null,
) {
  if (!nameOrEmail) {
    return null;
  }

  const members = await ctx.db
    .query('members')
    .withIndex('by_organization', q => q.eq('organizationId', organizationId))
    .collect();

  const needle = nameOrEmail.toLowerCase();
  for (const member of members) {
    const user = await ctx.db.get('users', member.userId);
    if (!user) continue;
    if (
      user.name?.toLowerCase() === needle ||
      user.email?.toLowerCase() === needle ||
      user.username?.toLowerCase() === needle
    ) {
      return { member, user };
    }
  }

  return null;
}

export function makePendingActionId() {
  return `assistant_action_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
