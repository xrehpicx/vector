import { query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v, ConvexError } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { PERMISSIONS, type Permission } from "./_shared/permissions";

// -----------------------------------------------------------------------------
// Permission Definitions
// -----------------------------------------------------------------------------

// Re-export for convenience, but the source is now in _shared
export { PERMISSIONS, type Permission };

// Permission scope context for scoped permission checks
export interface PermissionScope {
  organizationId: Id<"organizations">;
  teamId?: Id<"teams">;
  projectId?: Id<"projects">;
}

// -----------------------------------------------------------------------------
// Visibility Types
// -----------------------------------------------------------------------------

export type VisibilityState = "private" | "organization" | "public";

// -----------------------------------------------------------------------------
// Permission Resolution Logic (Internal)
// -----------------------------------------------------------------------------

/**
 * Check if a permission matches against another permission, considering wildcards.
 *
 * @param userPermission - The permission the user has
 * @param requiredPermission - The permission being checked
 * @returns True if the user permission grants the required permission
 */
function permissionMatches(
  userPermission: string,
  requiredPermission: string,
): boolean {
  // Exact match
  if (userPermission === requiredPermission) {
    return true;
  }

  // Full wildcard
  if (userPermission === PERMISSIONS.ALL) {
    return true;
  }

  // Scoped wildcards (e.g., 'issue:*' matches 'issue:create')
  if (userPermission.endsWith(":*")) {
    const prefix = userPermission.slice(0, -1); // Remove '*'
    return requiredPermission.startsWith(prefix);
  }

  return false;
}

/**
 * Get default permissions for organization members.
 * All org members get these permissions by default.
 */
function getDefaultMemberPermissions(): Permission[] {
  return [PERMISSIONS.ISSUE_CREATE, PERMISSIONS.ISSUE_VIEW];
}

/**
 * Centralized permission checking logic with scope support.
 *
 * This function is the single source of truth for determining if a user has
 * a specific permission. It checks permissions in this order:
 * 1. Organization membership and built-in roles (owner, admin)
 * 2. Default member permissions
 * 3. Organization custom roles
 * 4. Team-scoped roles (if teamId provided)
 * 5. Project-scoped roles (if projectId provided)
 *
 * @returns {Promise<boolean>} - True if the user has the permission, false otherwise.
 */
export async function hasScopedPermission(
  ctx: QueryCtx | MutationCtx,
  scope: PermissionScope,
  userId: Id<"users">,
  requiredPermission: Permission,
): Promise<boolean> {
  // 1. Check for organization membership
  const member = await ctx.db
    .query("members")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", scope.organizationId).eq("userId", userId),
    )
    .first();

  if (!member) {
    return false; // User is not a member of the organization
  }

  // 2. Grant all permissions to owners and admins
  if (member.role === "owner" || member.role === "admin") {
    return true;
  }

  // 3. Check default member permissions
  const defaultPermissions = getDefaultMemberPermissions();
  if (
    defaultPermissions.some((perm) =>
      permissionMatches(perm, requiredPermission),
    )
  ) {
    return true;
  }

  // 4. Check organization custom roles
  const orgRoleAssignments = await ctx.db
    .query("orgRoleAssignments")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", scope.organizationId),
    )
    .filter((q) => q.eq(q.field("userId"), userId))
    .collect();

  for (const assignment of orgRoleAssignments) {
    const rolePermissions = await ctx.db
      .query("orgRolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
      .collect();

    for (const rolePerm of rolePermissions) {
      if (permissionMatches(rolePerm.permission, requiredPermission)) {
        return true;
      }
    }
  }

  // 5. Check team-scoped roles if teamId is provided
  if (scope.teamId) {
    const teamRoleAssignments = await ctx.db
      .query("teamRoleAssignments")
      .withIndex("by_team", (q) => q.eq("teamId", scope.teamId!))
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    for (const assignment of teamRoleAssignments) {
      const rolePermissions = await ctx.db
        .query("teamRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (permissionMatches(rolePerm.permission, requiredPermission)) {
          return true;
        }
      }
    }
  }

  // 6. Check project-scoped roles if projectId is provided
  if (scope.projectId) {
    const projectRoleAssignments = await ctx.db
      .query("projectRoleAssignments")
      .withIndex("by_project", (q) => q.eq("projectId", scope.projectId!))
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    for (const assignment of projectRoleAssignments) {
      const rolePermissions = await ctx.db
        .query("projectRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (permissionMatches(rolePerm.permission, requiredPermission)) {
          return true;
        }
      }
    }
  }

  // 7. Deny permission if no matching role or permission is found
  return false;
}

/**
 * Legacy function for backwards compatibility.
 * Use hasScopedPermission for new code.
 */
export async function hasPermission(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
  requiredPermission: Permission,
): Promise<boolean> {
  return hasScopedPermission(
    ctx,
    { organizationId },
    userId,
    requiredPermission,
  );
}

/**
 * Enforces a permission check within a mutation or query.
 *
 * Throws a 'FORBIDDEN' error if the user does not have the required permission,
 * halting the execution of the function.
 *
 * @throws {Error} - 'FORBIDDEN' if permission is denied.
 */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  requiredPermission: Permission,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("UNAUTHORIZED");
  }

  const hasAccess = await hasPermission(
    ctx,
    organizationId,
    userId,
    requiredPermission,
  );

  if (!hasAccess) {
    throw new ConvexError("FORBIDDEN");
  }
}

// -----------------------------------------------------------------------------
// Client-Facing Permission Queries
// -----------------------------------------------------------------------------

/**
 * A client-callable query to check for a single permission with optional scope.
 */
export const has = query({
  args: {
    orgSlug: v.string(),
    permission: v.union(...Object.values(PERMISSIONS).map((p) => v.literal(p))),
    teamId: v.optional(v.id("teams")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      return false;
    }

    const scope: PermissionScope = {
      organizationId: org._id,
      teamId: args.teamId,
      projectId: args.projectId,
    };

    return await hasScopedPermission(ctx, scope, userId, args.permission);
  },
});

/**
 * A client-callable query to check for multiple permissions at once with optional scope.
 */
export const hasMultiple = query({
  args: {
    orgSlug: v.string(),
    permissions: v.array(
      v.union(...Object.values(PERMISSIONS).map((p) => v.literal(p))),
    ),
    teamId: v.optional(v.id("teams")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const results: Record<string, boolean> = {};

    if (!userId) {
      for (const permission of args.permissions) {
        results[permission] = false;
      }
      return results;
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      for (const permission of args.permissions) {
        results[permission] = false;
      }
      return results;
    }

    const scope: PermissionScope = {
      organizationId: org._id,
      teamId: args.teamId,
      projectId: args.projectId,
    };

    for (const permission of args.permissions) {
      results[permission] = await hasScopedPermission(
        ctx,
        scope,
        userId,
        permission,
      );
    }

    return results;
  },
});
