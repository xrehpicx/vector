import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { getOrganizationBySlug, requireOrganizationMember } from '../authz';
import {
  hasScopedPermission,
  PERMISSIONS,
  type Permission,
  type PermissionScope,
  type VisibilityState,
} from '../permissions/utils';

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

export type AssistantPendingAction =
  | {
      id: string;
      kind: 'delete_entity';
      entityType: 'document' | 'issue' | 'project' | 'team' | 'folder';
      entityId: string;
      entityLabel: string;
      summary: string;
      createdAt: number;
      executed?: boolean;
    }
  | {
      id: string;
      kind: 'bulk_delete_entities';
      entityType: 'document' | 'issue' | 'project' | 'team';
      entities: Array<{ entityId: string; entityLabel: string }>;
      summary: string;
      createdAt: number;
      executed?: boolean;
    }
  | {
      id: string;
      kind: 'send_email';
      recipientName: string;
      recipientEmail: string;
      subject: string;
      body: string;
      template?: string;
      html: string;
      summary: string;
      createdAt: number;
      executed?: boolean;
    };

export const assistantPageContextValidator = v.any();

export function normalizePendingActions(
  value: unknown,
): AssistantPendingAction[] {
  if (!value) return [];
  return Array.isArray(value)
    ? (value as AssistantPendingAction[])
    : [value as AssistantPendingAction];
}

export function appendPendingAction(
  currentValue: unknown,
  nextAction: AssistantPendingAction,
) {
  return [...normalizePendingActions(currentValue), nextAction];
}

export function removePendingAction(
  currentValue: unknown,
  actionId?: string | null,
) {
  if (!actionId) return undefined;

  const remaining = normalizePendingActions(currentValue).filter(
    action => action.id !== actionId,
  );
  return remaining.length > 0 ? remaining : undefined;
}

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

function scopeFromEntity(entity: {
  organizationId: Id<'organizations'>;
  teamId?: Id<'teams'> | null;
  projectId?: Id<'projects'> | null;
}): PermissionScope {
  return {
    organizationId: entity.organizationId,
    teamId: entity.teamId ?? undefined,
    projectId: entity.projectId ?? undefined,
  };
}

function getVisibility(
  visibility: VisibilityState | null | undefined,
): VisibilityState {
  return visibility ?? 'organization';
}

async function hasPermissionForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  scope: PermissionScope,
  permission: Permission,
) {
  return await hasScopedPermission(ctx, scope, userId, permission);
}

// --- Thread access control ---

export type ThreadVisibility = 'private' | 'organization' | 'public';

export async function canViewThread(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<'assistantThreads'>,
  userId: Id<'users'>,
): Promise<boolean> {
  // Creator can always view
  if (thread.userId === userId || thread.createdBy === userId) return true;

  const visibility = (thread.visibility ?? 'private') as ThreadVisibility;

  if (visibility === 'public') return true;

  if (visibility === 'organization') {
    const orgMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', thread.organizationId).eq('userId', userId),
      )
      .first();
    return !!orgMembership;
  }

  // private — check threadMembers
  const membership = await ctx.db
    .query('threadMembers')
    .withIndex('by_thread_user', q =>
      q.eq('threadId', thread._id).eq('userId', userId),
    )
    .first();
  return !!membership;
}

export async function canEditThread(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<'assistantThreads'>,
  userId: Id<'users'>,
): Promise<boolean> {
  // Creator can always edit
  if (thread.userId === userId || thread.createdBy === userId) return true;

  // Check for editor role in threadMembers
  const membership = await ctx.db
    .query('threadMembers')
    .withIndex('by_thread_user', q =>
      q.eq('threadId', thread._id).eq('userId', userId),
    )
    .first();
  return membership?.role === 'editor';
}

export async function canCommentOnThread(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<'assistantThreads'>,
  userId: Id<'users'>,
): Promise<boolean> {
  // Creator can always comment
  if (thread.userId === userId || thread.createdBy === userId) return true;

  const visibility = (thread.visibility ?? 'private') as ThreadVisibility;

  // Organization-visible threads allow any org member to comment
  if (visibility === 'organization') {
    const orgMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', thread.organizationId).eq('userId', userId),
      )
      .first();
    return !!orgMembership;
  }

  // Check for commenter or editor role
  const membership = await ctx.db
    .query('threadMembers')
    .withIndex('by_thread_user', q =>
      q.eq('threadId', thread._id).eq('userId', userId),
    )
    .first();
  return membership?.role === 'commenter' || membership?.role === 'editor';
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

/**
 * Resolve a specific assistant thread by id and verify it belongs to the
 * given organization and user. Prefer this over `requireAssistantThreadRow`
 * inside tool mutations: the latter returns the user's first thread via an
 * index scan, which mismatches the agent's active thread when the user has
 * more than one thread and causes spurious FORBIDDEN errors.
 */
export async function requireAssistantThreadById(
  ctx: QueryCtx | MutationCtx,
  assistantThreadId: Id<'assistantThreads'>,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
) {
  const row = await ctx.db.get('assistantThreads', assistantThreadId);
  if (!row || row.organizationId !== organizationId || row.userId !== userId) {
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

async function canViewIssueForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  issue: Doc<'issues'>,
) {
  const visibility = getVisibility(issue.visibility);

  if (visibility === 'public') return true;
  if (issue.createdBy === userId) return true;

  if (issue.teamId) {
    const teamMembership = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', issue.teamId!).eq('userId', userId),
      )
      .first();
    if (teamMembership) return true;
  }

  if (issue.projectId) {
    const projectMembership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', issue.projectId!).eq('userId', userId),
      )
      .first();
    if (projectMembership) return true;
  }

  if (visibility === 'private') {
    const assignment = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue_assignee', q =>
        q.eq('issueId', issue._id).eq('assigneeId', userId),
      )
      .first();
    return !!assignment;
  }

  if (visibility === 'organization') {
    const orgMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', issue.organizationId).eq('userId', userId),
      )
      .first();
    return !!orgMembership;
  }

  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(issue),
    PERMISSIONS.ISSUE_VIEW,
  );
}

async function canEditIssueForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  issue: Doc<'issues'>,
) {
  if (issue.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(issue),
    PERMISSIONS.ISSUE_EDIT,
  );
}

async function canDeleteIssueForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  issue: Doc<'issues'>,
) {
  if (issue.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(issue),
    PERMISSIONS.ISSUE_DELETE,
  );
}

async function canViewTeamForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  team: Doc<'teams'>,
) {
  const visibility = getVisibility(team.visibility);

  if (visibility === 'public') return true;
  if (team.createdBy === userId) return true;

  if (visibility === 'private') {
    const membership = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', team._id).eq('userId', userId),
      )
      .first();
    return !!membership;
  }

  if (visibility === 'organization') {
    const orgMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', team.organizationId).eq('userId', userId),
      )
      .first();
    return !!orgMembership;
  }

  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(team),
    PERMISSIONS.TEAM_VIEW,
  );
}

async function canEditTeamForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  team: Doc<'teams'>,
) {
  if (team.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(team),
    PERMISSIONS.TEAM_EDIT,
  );
}

async function canDeleteTeamForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  team: Doc<'teams'>,
) {
  if (team.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(team),
    PERMISSIONS.TEAM_DELETE,
  );
}

async function canViewProjectForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  project: Doc<'projects'>,
) {
  const visibility = getVisibility(project.visibility);

  if (visibility === 'public') return true;
  if (project.createdBy === userId) return true;

  if (visibility === 'private') {
    const membership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', project._id).eq('userId', userId),
      )
      .first();
    return !!membership;
  }

  if (visibility === 'organization') {
    const orgMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', project.organizationId).eq('userId', userId),
      )
      .first();
    return !!orgMembership;
  }

  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(project),
    PERMISSIONS.PROJECT_VIEW,
  );
}

async function canEditProjectForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  project: Doc<'projects'>,
) {
  if (project.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(project),
    PERMISSIONS.PROJECT_EDIT,
  );
}

async function canDeleteProjectForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  project: Doc<'projects'>,
) {
  if (project.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(project),
    PERMISSIONS.PROJECT_DELETE,
  );
}

async function canViewDocumentForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  document: Doc<'documents'>,
) {
  const visibility = getVisibility(document.visibility);

  if (visibility === 'public') return true;
  if (document.createdBy === userId) return true;

  if (document.teamId) {
    const teamMembership = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', document.teamId!).eq('userId', userId),
      )
      .first();
    if (teamMembership) return true;
  }

  if (document.projectId) {
    const projectMembership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', document.projectId!).eq('userId', userId),
      )
      .first();
    if (projectMembership) return true;
  }

  if (visibility === 'private') {
    return false;
  }

  if (visibility === 'organization') {
    const orgMembership = await ctx.db
      .query('members')
      .withIndex('by_org_user', q =>
        q.eq('organizationId', document.organizationId).eq('userId', userId),
      )
      .first();
    return !!orgMembership;
  }

  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(document),
    PERMISSIONS.DOCUMENT_VIEW,
  );
}

async function canEditDocumentForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  document: Doc<'documents'>,
) {
  if (document.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(document),
    PERMISSIONS.DOCUMENT_EDIT,
  );
}

async function canDeleteDocumentForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  document: Doc<'documents'>,
) {
  if (document.createdBy === userId) return true;
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(document),
    PERMISSIONS.DOCUMENT_DELETE,
  );
}

export async function canViewEntity(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  entity: unknown,
  entityType: 'document' | 'issue' | 'project' | 'team',
) {
  switch (entityType) {
    case 'document':
      return await canViewDocumentForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveDocumentFromContext>>,
      );
    case 'issue':
      return await canViewIssueForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveIssueFromContext>>,
      );
    case 'project':
      return await canViewProjectForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveProjectFromContext>>,
      );
    case 'team':
      return await canViewTeamForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveTeamFromContext>>,
      );
  }
}

export async function canEditEntity(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  entity: unknown,
  entityType: 'document' | 'issue' | 'project' | 'team',
) {
  switch (entityType) {
    case 'document':
      return await canEditDocumentForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveDocumentFromContext>>,
      );
    case 'issue':
      return await canEditIssueForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveIssueFromContext>>,
      );
    case 'project':
      return await canEditProjectForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveProjectFromContext>>,
      );
    case 'team':
      return await canEditTeamForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveTeamFromContext>>,
      );
  }
}

export async function canDeleteEntity(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  entity: unknown,
  entityType: 'document' | 'issue' | 'project' | 'team',
) {
  switch (entityType) {
    case 'document':
      return await canDeleteDocumentForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveDocumentFromContext>>,
      );
    case 'issue':
      return await canDeleteIssueForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveIssueFromContext>>,
      );
    case 'project':
      return await canDeleteProjectForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveProjectFromContext>>,
      );
    case 'team':
      return await canDeleteTeamForUser(
        ctx,
        userId,
        entity as Awaited<ReturnType<typeof resolveTeamFromContext>>,
      );
  }
}

export async function canManageTeamMembersForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  team: Doc<'teams'>,
  action: 'add' | 'remove' | 'update',
) {
  const permissionMap = {
    add: PERMISSIONS.TEAM_MEMBER_ADD,
    remove: PERMISSIONS.TEAM_MEMBER_REMOVE,
    update: PERMISSIONS.TEAM_MEMBER_UPDATE,
  };
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(team),
    permissionMap[action],
  );
}

export async function canManageProjectMembersForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  project: Doc<'projects'>,
  action: 'add' | 'remove' | 'update',
) {
  const permissionMap = {
    add: PERMISSIONS.PROJECT_MEMBER_ADD,
    remove: PERMISSIONS.PROJECT_MEMBER_REMOVE,
    update: PERMISSIONS.PROJECT_MEMBER_UPDATE,
  };
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(project),
    permissionMap[action],
  );
}

export async function canAssignIssueForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  issue: Doc<'issues'>,
) {
  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(issue),
    PERMISSIONS.ISSUE_ASSIGN,
  );
}

export async function canUpdateIssueAssignmentStateForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  issue: Doc<'issues'>,
  assigneeId: Id<'users'>,
) {
  if (assigneeId === userId) {
    const assignment = await ctx.db
      .query('issueAssignees')
      .withIndex('by_issue_assignee', q =>
        q.eq('issueId', issue._id).eq('assigneeId', userId),
      )
      .first();
    return !!assignment;
  }

  return await hasPermissionForUser(
    ctx,
    userId,
    scopeFromEntity(issue),
    PERMISSIONS.ISSUE_ASSIGNMENT_UPDATE,
  );
}

export async function canEditFolderForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  folder: Doc<'documentFolders'>,
) {
  return await hasPermissionForUser(
    ctx,
    userId,
    { organizationId: folder.organizationId },
    PERMISSIONS.DOCUMENT_EDIT,
  );
}

export async function canDeleteFolderForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  folder: Doc<'documentFolders'>,
) {
  return await hasPermissionForUser(
    ctx,
    userId,
    { organizationId: folder.organizationId },
    PERMISSIONS.DOCUMENT_DELETE,
  );
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

  const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

  return (
    states.find(state => normalize(state.name) === normalize(stateName)) ??
    // Fallback: match by state type (e.g. "todo" matches type "todo")
    states.find(state => state.type?.toLowerCase() === normalize(stateName)) ??
    null
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
