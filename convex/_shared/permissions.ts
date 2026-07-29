export const PERMISSIONS = {
  // Organization Permissions
  ORG_VIEW: 'org:view',
  ORG_MANAGE_SETTINGS: 'org:manage:settings',
  ORG_MANAGE_BILLING: 'org:manage:billing',
  ORG_MANAGE_MEMBERS: 'org:manage:members',
  ORG_MANAGE_ROLES: 'org:manage:roles',

  // Collaboration Permissions
  CHANNEL_VIEW: 'channel:view',
  CHANNEL_CREATE: 'channel:create',
  CHANNEL_EDIT: 'channel:edit',
  CHANNEL_ARCHIVE: 'channel:archive',
  CHANNEL_MANAGE_MEMBERS: 'channel:manage:members',
  CHANNEL_MESSAGE_SEND: 'channel:message:send',
  CHANNEL_MESSAGE_MODERATE: 'channel:message:moderate',

  // Registered Agent Permissions
  AGENT_VIEW: 'agent:view',
  AGENT_CREATE: 'agent:create',
  AGENT_EDIT_OWN: 'agent:edit:own',
  AGENT_MANAGE: 'agent:manage',
  AGENT_INTERACT: 'agent:interact',
  AGENT_CONTROL: 'agent:control',

  // Project Permissions
  PROJECT_CREATE: 'project:create',
  PROJECT_VIEW: 'project:view',
  PROJECT_EDIT: 'project:edit',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MEMBER_ADD: 'project:member:add',
  PROJECT_MEMBER_REMOVE: 'project:member:remove',
  PROJECT_MEMBER_UPDATE: 'project:member:update',
  PROJECT_LEAD_UPDATE: 'project:lead:update',

  // Team Permissions
  TEAM_CREATE: 'team:create',
  TEAM_VIEW: 'team:view',
  TEAM_EDIT: 'team:edit',
  TEAM_DELETE: 'team:delete',
  TEAM_MEMBER_ADD: 'team:member:add',
  TEAM_MEMBER_REMOVE: 'team:member:remove',
  TEAM_MEMBER_UPDATE: 'team:member:update',
  TEAM_LEAD_UPDATE: 'team:lead:update',

  // Issue Permissions
  ISSUE_CREATE: 'issue:create',
  ISSUE_VIEW: 'issue:view',
  ISSUE_EDIT: 'issue:edit',
  ISSUE_DELETE: 'issue:delete',
  ISSUE_ASSIGN: 'issue:assign',
  ISSUE_ASSIGNMENT_UPDATE: 'issue:assignment:update',
  ISSUE_RELATION_UPDATE: 'issue:relation:update',
  ISSUE_STATE_UPDATE: 'issue:state:update',
  ISSUE_PRIORITY_UPDATE: 'issue:priority:update',

  // Document Permissions
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_VIEW: 'document:view',
  DOCUMENT_EDIT: 'document:edit',
  DOCUMENT_DELETE: 'document:delete',

  // View Permissions
  VIEW_CREATE: 'view:create',
  VIEW_VIEW: 'view:view',
  VIEW_EDIT: 'view:edit',
  VIEW_DELETE: 'view:delete',

  // Wildcard permissions
  ALL: '*',
  ISSUE_ALL: 'issue:*',
  TEAM_ALL: 'team:*',
  PROJECT_ALL: 'project:*',
  DOCUMENT_ALL: 'document:*',
  VIEW_ALL: 'view:*',
  CHANNEL_ALL: 'channel:*',
  AGENT_ALL: 'agent:*',
} as const;

// Helper type for permission values
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_VALUES: Permission[] = Object.values(PERMISSIONS);

/**
 * Whether a granted permission satisfies a required permission, honoring the
 * `*` and `<domain>:*` wildcards. Client-safe (no server imports) so the UI
 * can evaluate a granted-permission list locally instead of issuing one
 * server round-trip per permission check.
 */
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

/**
 * Evaluate a required permission against a granted set (as returned by the
 * `permissions.queries.effective` query).
 */
export function hasPermissionInSet(
  granted: readonly string[],
  required: Permission,
): boolean {
  return granted.some(permission => permissionMatches(permission, required));
}

/**
 * Permission dependencies: granting the key permission is meaningless without
 * the permissions it implies (you cannot edit an issue you cannot view). These
 * are expanded automatically whenever a role's permission set is saved, so a
 * role can never end up in an incoherent state like "edit but not view".
 *
 * Lives here (no server-only imports) so both the Convex mutations and the
 * client role editor can share the exact same rules.
 */
export const PERMISSION_DEPENDENCIES: Partial<
  Record<Permission, Permission[]>
> = {
  // Org management implies being able to see the org.
  [PERMISSIONS.ORG_MANAGE_SETTINGS]: [PERMISSIONS.ORG_VIEW],
  [PERMISSIONS.ORG_MANAGE_BILLING]: [PERMISSIONS.ORG_VIEW],
  [PERMISSIONS.ORG_MANAGE_MEMBERS]: [PERMISSIONS.ORG_VIEW],
  [PERMISSIONS.ORG_MANAGE_ROLES]: [PERMISSIONS.ORG_VIEW],

  // Collaboration.
  [PERMISSIONS.CHANNEL_CREATE]: [PERMISSIONS.CHANNEL_VIEW],
  [PERMISSIONS.CHANNEL_EDIT]: [PERMISSIONS.CHANNEL_VIEW],
  [PERMISSIONS.CHANNEL_ARCHIVE]: [PERMISSIONS.CHANNEL_VIEW],
  [PERMISSIONS.CHANNEL_MANAGE_MEMBERS]: [PERMISSIONS.CHANNEL_VIEW],
  [PERMISSIONS.CHANNEL_MESSAGE_SEND]: [PERMISSIONS.CHANNEL_VIEW],
  [PERMISSIONS.CHANNEL_MESSAGE_MODERATE]: [PERMISSIONS.CHANNEL_VIEW],
  [PERMISSIONS.AGENT_CREATE]: [PERMISSIONS.AGENT_VIEW],
  [PERMISSIONS.AGENT_EDIT_OWN]: [PERMISSIONS.AGENT_VIEW],
  [PERMISSIONS.AGENT_MANAGE]: [PERMISSIONS.AGENT_VIEW],
  [PERMISSIONS.AGENT_INTERACT]: [
    PERMISSIONS.AGENT_VIEW,
    PERMISSIONS.CHANNEL_VIEW,
  ],
  [PERMISSIONS.AGENT_CONTROL]: [PERMISSIONS.AGENT_VIEW],

  // Any project action implies viewing projects.
  [PERMISSIONS.PROJECT_CREATE]: [PERMISSIONS.PROJECT_VIEW],
  [PERMISSIONS.PROJECT_EDIT]: [PERMISSIONS.PROJECT_VIEW],
  [PERMISSIONS.PROJECT_DELETE]: [PERMISSIONS.PROJECT_VIEW],
  [PERMISSIONS.PROJECT_MEMBER_ADD]: [PERMISSIONS.PROJECT_VIEW],
  [PERMISSIONS.PROJECT_MEMBER_REMOVE]: [PERMISSIONS.PROJECT_VIEW],
  [PERMISSIONS.PROJECT_MEMBER_UPDATE]: [PERMISSIONS.PROJECT_VIEW],
  [PERMISSIONS.PROJECT_LEAD_UPDATE]: [PERMISSIONS.PROJECT_VIEW],

  // Any team action implies viewing teams.
  [PERMISSIONS.TEAM_CREATE]: [PERMISSIONS.TEAM_VIEW],
  [PERMISSIONS.TEAM_EDIT]: [PERMISSIONS.TEAM_VIEW],
  [PERMISSIONS.TEAM_DELETE]: [PERMISSIONS.TEAM_VIEW],
  [PERMISSIONS.TEAM_MEMBER_ADD]: [PERMISSIONS.TEAM_VIEW],
  [PERMISSIONS.TEAM_MEMBER_REMOVE]: [PERMISSIONS.TEAM_VIEW],
  [PERMISSIONS.TEAM_MEMBER_UPDATE]: [PERMISSIONS.TEAM_VIEW],
  [PERMISSIONS.TEAM_LEAD_UPDATE]: [PERMISSIONS.TEAM_VIEW],

  // Any issue action implies viewing issues.
  [PERMISSIONS.ISSUE_CREATE]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_EDIT]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_DELETE]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_ASSIGN]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_ASSIGNMENT_UPDATE]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_RELATION_UPDATE]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_STATE_UPDATE]: [PERMISSIONS.ISSUE_VIEW],
  [PERMISSIONS.ISSUE_PRIORITY_UPDATE]: [PERMISSIONS.ISSUE_VIEW],

  // Documents / views.
  [PERMISSIONS.DOCUMENT_CREATE]: [PERMISSIONS.DOCUMENT_VIEW],
  [PERMISSIONS.DOCUMENT_EDIT]: [PERMISSIONS.DOCUMENT_VIEW],
  [PERMISSIONS.DOCUMENT_DELETE]: [PERMISSIONS.DOCUMENT_VIEW],
  [PERMISSIONS.VIEW_CREATE]: [PERMISSIONS.VIEW_VIEW],
  [PERMISSIONS.VIEW_EDIT]: [PERMISSIONS.VIEW_VIEW],
  [PERMISSIONS.VIEW_DELETE]: [PERMISSIONS.VIEW_VIEW],
};

/**
 * Expand a permission set to include every implied permission (transitive
 * closure over PERMISSION_DEPENDENCIES), returning a de-duplicated array.
 * Wildcard permissions are passed through unchanged.
 */
export function expandPermissions(
  permissions: readonly Permission[],
): Permission[] {
  const result = new Set<Permission>();
  const queue = [...permissions];

  while (queue.length > 0) {
    const permission = queue.pop()!;
    if (result.has(permission)) continue;
    result.add(permission);
    const implied = PERMISSION_DEPENDENCIES[permission];
    if (implied) {
      for (const dep of implied) {
        if (!result.has(dep)) queue.push(dep);
      }
    }
  }

  return Array.from(result);
}

// Define wildcard permission for owner role (full access)
const WILDCARD: Permission = PERMISSIONS.ALL;

// Public type for built-in member roles (system roles)
export type BuiltinRole = 'owner' | 'admin' | 'member';

export const SYSTEM_ROLE_KEYS = {
  ORG_OWNER: 'org:owner',
  ORG_ADMIN: 'org:admin',
  ORG_MEMBER: 'org:member',
  TEAM_LEAD: 'team:lead',
  TEAM_MEMBER: 'team:member',
  PROJECT_LEAD: 'project:lead',
  PROJECT_MEMBER: 'project:member',
} as const;

export type SystemRoleKey =
  (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

/**
 * Static permission sets for the default organization roles.
 *
 * NOTE: This file purposefully contains **no server-only imports** so it can be
 * bundled on the client side without dragging in the database driver (pg).
 */
export const BUILTIN_ROLE_PERMISSIONS: Record<BuiltinRole, Permission[]> = {
  // Owner gets universal wildcard permission
  owner: [WILDCARD],

  // Admin gets broad but scoped permissions (no universal wildcard)
  admin: [
    // Organization
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.ORG_MANAGE_SETTINGS,
    PERMISSIONS.ORG_MANAGE_BILLING,
    PERMISSIONS.ORG_MANAGE_MEMBERS,
    PERMISSIONS.ORG_MANAGE_ROLES,

    // Collaboration
    PERMISSIONS.CHANNEL_ALL,
    PERMISSIONS.AGENT_ALL,

    // Projects
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_EDIT,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_MEMBER_ADD,
    PERMISSIONS.PROJECT_MEMBER_REMOVE,
    PERMISSIONS.PROJECT_MEMBER_UPDATE,
    PERMISSIONS.PROJECT_LEAD_UPDATE,

    // Teams
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.TEAM_CREATE,
    PERMISSIONS.TEAM_EDIT,
    PERMISSIONS.TEAM_DELETE,
    PERMISSIONS.TEAM_MEMBER_ADD,
    PERMISSIONS.TEAM_MEMBER_REMOVE,
    PERMISSIONS.TEAM_MEMBER_UPDATE,
    PERMISSIONS.TEAM_LEAD_UPDATE,

    // Issues
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.ISSUE_EDIT,
    PERMISSIONS.ISSUE_DELETE,
    PERMISSIONS.ISSUE_ASSIGN,
    PERMISSIONS.ISSUE_ASSIGNMENT_UPDATE,
    PERMISSIONS.ISSUE_RELATION_UPDATE,
    PERMISSIONS.ISSUE_STATE_UPDATE,
    PERMISSIONS.ISSUE_PRIORITY_UPDATE,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_EDIT,
    PERMISSIONS.DOCUMENT_DELETE,

    // Views
    PERMISSIONS.VIEW_VIEW,
    PERMISSIONS.VIEW_CREATE,
    PERMISSIONS.VIEW_EDIT,
    PERMISSIONS.VIEW_DELETE,
  ],

  // Member gets essential read / limited write access
  member: [
    PERMISSIONS.ORG_VIEW,

    // Collaboration
    PERMISSIONS.CHANNEL_VIEW,
    PERMISSIONS.CHANNEL_CREATE,
    PERMISSIONS.CHANNEL_EDIT,
    PERMISSIONS.CHANNEL_MESSAGE_SEND,
    PERMISSIONS.AGENT_VIEW,
    PERMISSIONS.AGENT_CREATE,
    PERMISSIONS.AGENT_EDIT_OWN,
    PERMISSIONS.AGENT_INTERACT,

    // Projects
    PERMISSIONS.PROJECT_VIEW,

    // Teams
    PERMISSIONS.TEAM_VIEW,

    // Issues
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.ISSUE_EDIT,
    PERMISSIONS.ISSUE_ASSIGN,
    PERMISSIONS.ISSUE_STATE_UPDATE,

    // Documents
    PERMISSIONS.DOCUMENT_VIEW,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_EDIT,

    // Views
    PERMISSIONS.VIEW_VIEW,
    PERMISSIONS.VIEW_CREATE,
  ],
};

// Default permissions for new admin roles (for migration purposes)
export const DEFAULT_ADMIN_PERMISSIONS = BUILTIN_ROLE_PERMISSIONS.admin;

export const TEAM_SYSTEM_ROLE_PERMISSIONS: Record<
  typeof SYSTEM_ROLE_KEYS.TEAM_LEAD | typeof SYSTEM_ROLE_KEYS.TEAM_MEMBER,
  Permission[]
> = {
  [SYSTEM_ROLE_KEYS.TEAM_LEAD]: [PERMISSIONS.TEAM_ALL, PERMISSIONS.ISSUE_ALL],
  [SYSTEM_ROLE_KEYS.TEAM_MEMBER]: [
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_EDIT,
    PERMISSIONS.ISSUE_ASSIGN,
    PERMISSIONS.ISSUE_STATE_UPDATE,
  ],
};

export const PROJECT_SYSTEM_ROLE_PERMISSIONS: Record<
  typeof SYSTEM_ROLE_KEYS.PROJECT_LEAD | typeof SYSTEM_ROLE_KEYS.PROJECT_MEMBER,
  Permission[]
> = {
  [SYSTEM_ROLE_KEYS.PROJECT_LEAD]: [
    PERMISSIONS.PROJECT_ALL,
    PERMISSIONS.ISSUE_ALL,
  ],
  [SYSTEM_ROLE_KEYS.PROJECT_MEMBER]: [
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_EDIT,
    PERMISSIONS.ISSUE_STATE_UPDATE,
  ],
};
