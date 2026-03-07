import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { getAuthUserId } from './authUtils';
import {
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_VALUES,
  PROJECT_SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_KEYS,
  TEAM_SYSTEM_ROLE_PERMISSIONS,
  type Permission,
} from './_shared/permissions';

export type VisibilityState = 'private' | 'organization' | 'public';

export interface PermissionScope {
  organizationId: Id<'organizations'>;
  teamId?: Id<'teams'>;
  projectId?: Id<'projects'>;
}

const permissionValidator = v.union(
  ...PERMISSION_VALUES.map(permission => v.literal(permission)),
);

export { permissionValidator };

export function permissionMatches(
  userPermission: string,
  requiredPermission: string,
): boolean {
  if (userPermission === requiredPermission) return true;
  if (userPermission === PERMISSIONS.ALL) return true;
  if (userPermission.endsWith(':*')) {
    const prefix = userPermission.slice(0, -1);
    return requiredPermission.startsWith(prefix);
  }
  return false;
}

function addPermissions(
  target: Set<Permission>,
  permissions: readonly Permission[],
): void {
  for (const permission of permissions) {
    target.add(permission);
  }
}

function getProjectMemberPermissions(role?: string | null): Permission[] {
  if (role === 'lead') {
    return PROJECT_SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLE_KEYS.PROJECT_LEAD];
  }
  return PROJECT_SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLE_KEYS.PROJECT_MEMBER];
}

function getTeamMemberPermissions(
  role?: 'lead' | 'member' | null,
): Permission[] {
  if (role === 'lead') {
    return TEAM_SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLE_KEYS.TEAM_LEAD];
  }
  return TEAM_SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLE_KEYS.TEAM_MEMBER];
}

function isRoleAssignmentApplicable(
  assignment: Doc<'roleAssignments'>,
  scope: PermissionScope,
): boolean {
  if (assignment.organizationId !== scope.organizationId) {
    return false;
  }

  if (assignment.projectId) {
    return assignment.projectId === scope.projectId;
  }

  if (assignment.teamId) {
    return assignment.teamId === scope.teamId;
  }

  return true;
}

async function collectPermissionsForRoleIds(
  ctx: QueryCtx | MutationCtx,
  roleIds: readonly Id<'roles'>[],
): Promise<Set<Permission>> {
  const permissions = new Set<Permission>();

  for (const roleId of roleIds) {
    const rolePermissions = await ctx.db
      .query('rolePermissions')
      .withIndex('by_role', q => q.eq('roleId', roleId))
      .collect();

    for (const rolePermission of rolePermissions) {
      permissions.add(rolePermission.permission);
    }
  }

  return permissions;
}

async function collectLegacyPermissions(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
  userId: Id<'users'>,
): Promise<Set<Permission>> {
  const permissions = new Set<Permission>();

  const orgAssignments = await ctx.db
    .query('orgRoleAssignments')
    .withIndex('by_organization', q =>
      q.eq('organizationId', scope.organizationId),
    )
    .filter(q => q.eq(q.field('userId'), userId))
    .collect();

  for (const assignment of orgAssignments) {
    const rolePermissions = await ctx.db
      .query('orgRolePermissions')
      .withIndex('by_role', q => q.eq('roleId', assignment.roleId))
      .collect();

    for (const rolePermission of rolePermissions) {
      permissions.add(rolePermission.permission);
    }
  }

  if (scope.teamId) {
    const teamAssignments = await ctx.db
      .query('teamRoleAssignments')
      .withIndex('by_team', q => q.eq('teamId', scope.teamId!))
      .filter(q => q.eq(q.field('userId'), userId))
      .collect();

    for (const assignment of teamAssignments) {
      const rolePermissions = await ctx.db
        .query('teamRolePermissions')
        .withIndex('by_role', q => q.eq('roleId', assignment.roleId))
        .collect();

      for (const rolePermission of rolePermissions) {
        permissions.add(rolePermission.permission);
      }
    }
  }

  if (scope.projectId) {
    const projectAssignments = await ctx.db
      .query('projectRoleAssignments')
      .withIndex('by_project', q => q.eq('projectId', scope.projectId!))
      .filter(q => q.eq(q.field('userId'), userId))
      .collect();

    for (const assignment of projectAssignments) {
      const rolePermissions = await ctx.db
        .query('projectRolePermissions')
        .withIndex('by_role', q => q.eq('roleId', assignment.roleId))
        .collect();

      for (const rolePermission of rolePermissions) {
        permissions.add(rolePermission.permission);
      }
    }
  }

  return permissions;
}

export async function getEffectivePermissions(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
  userId: Id<'users'>,
): Promise<Set<Permission>> {
  const membership = await ctx.db
    .query('members')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', scope.organizationId).eq('userId', userId),
    )
    .first();

  if (!membership) {
    return new Set();
  }

  if (membership.role === 'owner') {
    return new Set([PERMISSIONS.ALL]);
  }

  const permissions = new Set<Permission>();
  addPermissions(
    permissions,
    membership.role === 'admin'
      ? BUILTIN_ROLE_PERMISSIONS.admin
      : BUILTIN_ROLE_PERMISSIONS.member,
  );

  if (scope.teamId) {
    const teamMembership = await ctx.db
      .query('teamMembers')
      .withIndex('by_team_user', q =>
        q.eq('teamId', scope.teamId!).eq('userId', userId),
      )
      .first();

    if (teamMembership) {
      addPermissions(
        permissions,
        getTeamMemberPermissions(teamMembership.role),
      );
    }
  }

  if (scope.projectId) {
    const projectMembership = await ctx.db
      .query('projectMembers')
      .withIndex('by_project_user', q =>
        q.eq('projectId', scope.projectId!).eq('userId', userId),
      )
      .first();

    if (projectMembership) {
      addPermissions(
        permissions,
        getProjectMemberPermissions(projectMembership.role),
      );
    }
  }

  const assignments = await ctx.db
    .query('roleAssignments')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', scope.organizationId).eq('userId', userId),
    )
    .collect();

  const applicableRoleIds = assignments
    .filter(assignment => isRoleAssignmentApplicable(assignment, scope))
    .map(assignment => assignment.roleId);

  const scopedPermissions = await collectPermissionsForRoleIds(
    ctx,
    applicableRoleIds,
  );
  for (const permission of scopedPermissions) {
    permissions.add(permission);
  }

  const legacyPermissions = await collectLegacyPermissions(ctx, scope, userId);
  for (const permission of legacyPermissions) {
    permissions.add(permission);
  }

  return permissions;
}

export async function hasScopedPermission(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
  userId: Id<'users'>,
  requiredPermission: Permission,
): Promise<boolean> {
  const permissions = await getEffectivePermissions(ctx, scope, userId);

  for (const permission of permissions) {
    if (permissionMatches(permission, requiredPermission)) {
      return true;
    }
  }

  return false;
}

export async function getPermissionMap(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
  userId: Id<'users'>,
  permissions: readonly Permission[],
): Promise<Record<string, boolean>> {
  const effectivePermissions = await getEffectivePermissions(
    ctx,
    scope,
    userId,
  );
  const results: Record<string, boolean> = {};

  for (const permission of permissions) {
    results[permission] = Array.from(effectivePermissions).some(granted =>
      permissionMatches(granted, permission),
    );
  }

  return results;
}

export async function requireScopedPermission(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
  requiredPermission: Permission,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError('UNAUTHORIZED');
  }

  const allowed = await hasScopedPermission(
    ctx,
    scope,
    userId,
    requiredPermission,
  );
  if (!allowed) {
    throw new ConvexError('FORBIDDEN');
  }

  return userId;
}

export async function requireOrgPermission(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  requiredPermission: Permission,
) {
  return requireScopedPermission(ctx, { organizationId }, requiredPermission);
}

export async function requireAuthUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError('UNAUTHORIZED');
  }
  return userId;
}

export async function getOrganizationBySlug(
  ctx: QueryCtx | MutationCtx,
  orgSlug: string,
) {
  const org = await ctx.db
    .query('organizations')
    .withIndex('by_slug', q => q.eq('slug', orgSlug))
    .first();

  if (!org) {
    throw new ConvexError('ORGANIZATION_NOT_FOUND');
  }

  return org;
}

export async function requireOrganizationMember(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<'organizations'>,
  userId?: Id<'users'>,
) {
  const authenticatedUserId = userId ?? (await requireAuthUser(ctx));
  const membership = await ctx.db
    .query('members')
    .withIndex('by_org_user', q =>
      q.eq('organizationId', organizationId).eq('userId', authenticatedUserId),
    )
    .first();

  if (!membership) {
    throw new ConvexError('FORBIDDEN');
  }

  return membership;
}

export async function ensureScopeMatchesOrganization(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
) {
  if (scope.teamId) {
    const team = await ctx.db.get('teams', scope.teamId);
    if (!team || team.organizationId !== scope.organizationId) {
      throw new ConvexError('INVALID_TEAM_SCOPE');
    }
  }

  if (scope.projectId) {
    const project = await ctx.db.get('projects', scope.projectId);
    if (!project || project.organizationId !== scope.organizationId) {
      throw new ConvexError('INVALID_PROJECT_SCOPE');
    }
  }
}
