import { PERMISSIONS, type Permission } from "./permissions";

// Define wildcard permission for owner role (type-safe wildcard)
const WILDCARD = PERMISSIONS.ORG_MANAGE; // Use the highest permission as wildcard for now

// Public type for built-in member roles (system roles)
export type BuiltinRole = "owner" | "admin" | "member";

/**
 * Static permission sets for the default organization roles.
 *
 * NOTE: This file purposefully contains **no server-only imports** so it can be
 * bundled on the client side without dragging in the database driver (pg).
 */
export const BUILTIN_ROLE_PERMISSIONS: Record<BuiltinRole, Permission[]> = {
  owner: [WILDCARD], // God-mode within the organization
  admin: [
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.ORG_MANAGE,
    PERMISSIONS.ORG_INVITE,
    PERMISSIONS.ROLE_CREATE,
    PERMISSIONS.ROLE_UPDATE,
    PERMISSIONS.ROLE_DELETE,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.TEAM_CREATE,
    PERMISSIONS.TEAM_UPDATE,
    PERMISSIONS.TEAM_DELETE,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.ISSUE_UPDATE,
    PERMISSIONS.ISSUE_DELETE,
    PERMISSIONS.ASSIGNMENT_MANAGE,
  ],
  member: [
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.PROJECT_VIEW,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.ISSUE_UPDATE,
  ],
};

// Default permissions for new admin roles (for migration purposes)
export const DEFAULT_ADMIN_PERMISSIONS = BUILTIN_ROLE_PERMISSIONS.admin;
