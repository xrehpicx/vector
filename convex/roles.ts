import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";

// Permission constants matching the existing system
const PERMISSIONS = {
  ORG_VIEW: "org:view",
  ORG_MANAGE: "org:manage",
  ORG_INVITE: "org:invite",
  ROLE_CREATE: "role:create",
  ROLE_UPDATE: "role:update",
  ROLE_DELETE: "role:delete",
  ROLE_ASSIGN: "role:assign",
  PROJECT_VIEW: "project:view",
  PROJECT_CREATE: "project:create",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",
  TEAM_VIEW: "team:view",
  TEAM_CREATE: "team:create",
  TEAM_UPDATE: "team:update",
  TEAM_DELETE: "team:delete",
  ISSUE_VIEW: "issue:view",
  ISSUE_CREATE: "issue:create",
  ISSUE_UPDATE: "issue:update",
  ISSUE_DELETE: "issue:delete",
  ASSIGNMENT_MANAGE: "assignment:manage",
} as const;

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// List all roles for an organization
export const list = query({
  args: { orgSlug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if user is member of organization
    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!member) throw new Error("FORBIDDEN");

    // Check if user has permission to view roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== userId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_CREATE ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    const roles = await ctx.db
      .query("orgRoles")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .order("desc")
      .collect();

    return roles;
  },
});

// Get a specific role with its permissions
export const get = query({
  args: {
    orgSlug: v.string(),
    roleId: v.id("orgRoles"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if user is member of organization
    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!member) throw new Error("FORBIDDEN");

    // Check if user has permission to view roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== userId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_UPDATE ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    const role = await ctx.db.get(args.roleId);
    if (!role || role.organizationId !== organization._id) {
      throw new Error("Role not found");
    }

    const permissions = await ctx.db
      .query("orgRolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
      .collect();

    return {
      id: role._id,
      name: role.name,
      description: role.description,
      system: role.system,
      createdAt: role._creationTime,
      permissions: permissions.map((p) => p.permission),
    };
  },
});

// Create a new role
export const create = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if user is member of organization
    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!member) throw new Error("FORBIDDEN");

    // Check if user has permission to create roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== userId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_CREATE ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    const roleId = await ctx.db.insert("orgRoles", {
      organizationId: organization._id,
      name: args.name,
      description: args.description,
      system: false,
    });

    // Add permissions if provided
    if (args.permissions && args.permissions.length > 0) {
      for (const permission of args.permissions) {
        await ctx.db.insert("orgRolePermissions", {
          roleId,
          permission,
        });
      }
    }

    return { id: roleId };
  },
});

// Update an existing role
export const update = mutation({
  args: {
    orgSlug: v.string(),
    roleId: v.id("orgRoles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if user is member of organization
    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!member) throw new Error("FORBIDDEN");

    // Check if user has permission to update roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== userId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_UPDATE ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    const role = await ctx.db.get(args.roleId);
    if (!role || role.organizationId !== organization._id) {
      throw new Error("Role not found");
    }
    if (role.system) {
      throw new Error("Cannot update system role");
    }

    // Update role fields
    const updates: Partial<Doc<"orgRoles">> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.roleId, updates);

    // Update permissions if provided
    if (args.permissions !== undefined) {
      // Remove existing permissions
      const existingPermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
        .collect();

      for (const perm of existingPermissions) {
        await ctx.db.delete(perm._id);
      }

      // Add new permissions
      for (const permission of args.permissions) {
        await ctx.db.insert("orgRolePermissions", {
          roleId: args.roleId,
          permission,
        });
      }
    }
  },
});

// Delete a role
export const deleteRole = mutation({
  args: {
    orgSlug: v.string(),
    roleId: v.id("orgRoles"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if user is member of organization
    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!member) throw new Error("FORBIDDEN");

    // Check if user has permission to delete roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== userId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_DELETE ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    const role = await ctx.db.get(args.roleId);
    if (!role || role.organizationId !== organization._id) {
      throw new Error("Role not found");
    }
    if (role.system) {
      throw new Error("Cannot delete system role");
    }

    // Remove all role assignments
    const assignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
      .collect();

    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }

    // Remove all role permissions
    const permissions = await ctx.db
      .query("orgRolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
      .collect();

    for (const permission of permissions) {
      await ctx.db.delete(permission._id);
    }

    // Delete the role
    await ctx.db.delete(args.roleId);
  },
});

// Assign a role to a user
export const assign = mutation({
  args: {
    orgSlug: v.string(),
    roleId: v.id("orgRoles"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if current user is member of organization
    const currentUserMember = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", currentUserId),
      )
      .first();

    if (!currentUserMember) throw new Error("FORBIDDEN");

    // Check if current user has permission to assign roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== currentUserId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_ASSIGN ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    // Verify target user is member of organization
    const targetUserMember = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", args.userId),
      )
      .first();

    if (!targetUserMember) {
      throw new Error("User is not a member of this organization");
    }

    // Verify role exists and belongs to organization
    const role = await ctx.db.get(args.roleId);
    if (!role || role.organizationId !== organization._id) {
      throw new Error("Role not found in this organization");
    }

    // Check if assignment already exists
    const existingAssignment = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_role_user", (q) =>
        q.eq("roleId", args.roleId).eq("userId", args.userId),
      )
      .first();

    if (existingAssignment) {
      // Role already assigned - silently ignore
      return;
    }

    // Create assignment
    await ctx.db.insert("orgRoleAssignments", {
      roleId: args.roleId,
      userId: args.userId,
      organizationId: organization._id,
      assignedAt: Date.now(),
    });
  },
});

// Remove a role assignment from a user
export const removeAssignment = mutation({
  args: {
    orgSlug: v.string(),
    roleId: v.id("orgRoles"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if current user is member of organization
    const currentUserMember = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", currentUserId),
      )
      .first();

    if (!currentUserMember) throw new Error("FORBIDDEN");

    // Check if current user has permission to assign roles
    const roleAssignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    let hasPermission = false;
    for (const assignment of roleAssignments) {
      if (assignment.userId !== currentUserId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (!role) continue;

      const rolePermissions = await ctx.db
        .query("orgRolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
        .collect();

      for (const rolePerm of rolePermissions) {
        if (
          rolePerm.permission === PERMISSIONS.ROLE_ASSIGN ||
          rolePerm.permission === "*"
        ) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) throw new Error("FORBIDDEN");

    const assignment = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_role_user", (q) =>
        q.eq("roleId", args.roleId).eq("userId", args.userId),
      )
      .first();

    if (assignment) {
      await ctx.db.delete(assignment._id);
    }
  },
});

// List all roles assigned to a user in an organization
export const listUserRoles = query({
  args: {
    orgSlug: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Unauthorized");

    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check if current user is member of organization
    const currentUserMember = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", currentUserId),
      )
      .first();

    if (!currentUserMember) throw new Error("FORBIDDEN");

    const assignments = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organization._id),
      )
      .collect();

    const roles = [];
    for (const assignment of assignments) {
      if (assignment.userId !== args.userId) continue;

      const role = await ctx.db.get(assignment.roleId);
      if (role) {
        roles.push({
          roleId: role._id,
          name: role.name,
          description: role.description,
        });
      }
    }

    return roles;
  },
});
