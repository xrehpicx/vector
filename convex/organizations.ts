import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { auth } from "./auth";
import {
  ISSUE_PRIORITY_DEFAULTS,
  ISSUE_STATE_DEFAULTS,
  PROJECT_STATUS_DEFAULTS,
} from "../src/lib/defaults";

/**
 * Get organization by slug
 */
export const getBySlug = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    return org;
  },
});

/**
 * List organization members with roles
 */
export const listMembersWithRoles = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    const members = await ctx.db
      .query("members")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));

    const roles = await ctx.db
      .query("orgRoleAssignments")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    const roleDefs = await Promise.all(roles.map((r) => ctx.db.get(r.roleId)));

    return members.map((m, i) => {
      const user = users[i];
      const userRoles = roles.filter((r) => r.userId === m.userId);
      const customRoles = userRoles
        .map((ur) => roleDefs.find((rd) => rd?._id === ur.roleId))
        .filter((r): r is NonNullable<typeof r> => !!r);
      return {
        ...m,
        name: user?.name,
        email: user?.email,
        image: user?.image,
        roleId: userRoles[0]?.roleId ?? null,
        roleName:
          roleDefs.find((rd) => rd?._id === userRoles[0]?.roleId)?.name ?? null,
        customRoles,
      };
    });
  },
});

export const listInvites = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    return await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
  },
});

export const revokeInvite = mutation({
  args: {
    inviteId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);

    if (!invite) {
      throw new Error("Invite not found");
    }

    await ctx.db.patch(invite._id, { status: "revoked" });
  },
});

export const acceptInvitation = mutation({
  args: {
    inviteId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const invite = await ctx.db.get(args.inviteId);

    if (!invite) {
      throw new Error("Invitation not found");
    }
    if (invite.status !== "pending") {
      throw new Error("Invitation is not pending");
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error(
        `This invitation is for ${invite.email}, but you are logged in as ${user.email}.`,
      );
    }
    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch(invite._id, { status: "expired" });
      throw new Error("This invitation has expired");
    }

    await ctx.db.patch(invite._id, {
      status: "accepted",
      acceptedAt: Date.now(),
    });

    const existingMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", invite.organizationId).eq("userId", userId),
      )
      .first();

    if (!existingMembership) {
      await ctx.db.insert("members", {
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      });
    }

    return { success: true };
  },
});

export const resendInvite = mutation({
  args: {
    token: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    // This is a simplified implementation. The legacy code sends an email.
    // For now, we will just update the expiry date.
    const invite = await ctx.db.get(args.token);

    if (!invite) {
      throw new Error("Invite not found");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await ctx.db.patch(invite._id, { expiresAt: expiresAt.getTime() });
  },
});

export const removeMember = mutation({
  args: {
    orgSlug: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", args.userId),
      )
      .first();

    if (!member) {
      throw new Error("Member not found");
    }

    await ctx.db.delete(member._id);
  },
});

/**
 * Get organization statistics
 */
export const getOrganizationStats = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get counts
    const memberCount = await ctx.db
      .query("members")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect()
      .then((members) => members.length);

    const projectCount = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect()
      .then((projects) => projects.length);

    const teamCount = await ctx.db
      .query("teams")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect()
      .then((teams) => teams.length);

    const issueCount = await ctx.db
      .query("issues")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect()
      .then((issues) => issues.length);

    return {
      memberCount,
      projectCount,
      teamCount,
      issueCount,
    };
  },
});

/**
 * List recent projects
 */
export const getRecentProjects = query({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get recent projects
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Sort by creation time (newest first) and limit
    const sortedProjects = projects
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, args.limit ?? 5);

    return sortedProjects;
  },
});

/**
 * List recent issues
 */
export const getRecentIssues = query({
  args: {
    orgSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get recent issues
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Sort by creation time (newest first) and limit
    const sortedIssues = issues
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, args.limit ?? 10);

    return sortedIssues;
  },
});

/**
 * Create organization
 */
export const create = mutation({
  args: {
    data: v.object({
      name: v.string(),
      slug: v.string(),
      logo: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Validate input
    if (!args.data.name.trim()) {
      throw new Error("Organization name is required");
    }
    if (!args.data.slug.trim()) {
      throw new Error("Organization slug is required");
    }
    if (args.data.name.length > 100) {
      throw new Error("Organization name must be 100 characters or less");
    }
    if (args.data.slug.length > 50) {
      throw new Error("Organization slug must be 50 characters or less");
    }

    // Check if slug is unique
    const existingOrg = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.data.slug))
      .first();

    if (existingOrg) {
      throw new Error("Organization with this slug already exists");
    }

    // Create organization
    const orgId = await ctx.db.insert("organizations", {
      name: args.data.name.trim(),
      slug: args.data.slug.trim(),
      logo: args.data.logo,
    });

    // Add creator as owner
    await ctx.db.insert("members", {
      organizationId: orgId,
      userId,
      role: "owner",
    });

    return { orgId };
  },
});

/**
 * Update organization
 */
export const update = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      name: v.optional(v.string()),
      slug: v.optional(v.string()),
      logo: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is owner or admin
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      throw new Error("Insufficient permissions to update organization");
    }

    // Validate input
    if (args.data.name && !args.data.name.trim()) {
      throw new Error("Organization name cannot be empty");
    }
    if (args.data.name && args.data.name.length > 100) {
      throw new Error("Organization name must be 100 characters or less");
    }
    if (args.data.slug && !args.data.slug.trim()) {
      throw new Error("Organization slug cannot be empty");
    }
    if (args.data.slug && args.data.slug.length > 50) {
      throw new Error("Organization slug must be 50 characters or less");
    }

    // Check if slug is unique (if being updated)
    if (args.data?.slug && args.data.slug.trim() !== org.slug) {
      const existingOrg = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.data.slug!.trim()))
        .first();

      if (existingOrg) {
        throw new Error("Organization with this slug already exists");
      }
    }

    // Update organization
    const updateData: Partial<{
      name: string;
      slug: string;
      logo: string;
    }> = {};

    if (args.data.name !== undefined) {
      updateData.name = args.data.name.trim();
    }
    if (args.data.slug !== undefined) {
      updateData.slug = args.data.slug.trim();
    }
    if (args.data.logo !== undefined) {
      updateData.logo = args.data.logo;
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(org._id, updateData);
    }

    return { success: true };
  },
});

/**
 * List organization members
 */
export const listMembers = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get all members
    const members = await ctx.db
      .query("members")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Get user details for each member
    const memberUserIds = members.map((m) => m.userId);
    const users = await Promise.all(memberUserIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(memberUserIds.map((id, i) => [id, users[i]]));

    // Combine results
    const membersWithUsers = members.map((member) => {
      const user = userMap.get(member.userId);
      return {
        ...member,
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              displayUsername: user.displayUsername,
            }
          : null,
      };
    });

    return membersWithUsers;
  },
});

/**
 * Search organization members
 */
export const searchMembers = query({
  args: {
    orgSlug: v.string(),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get all members
    const members = await ctx.db
      .query("members")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Get user details for each member
    const memberUserIds = members.map((m) => m.userId);
    const users = await Promise.all(memberUserIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(memberUserIds.map((id, i) => [id, users[i]]));

    // Filter and search
    let results = members.map((member) => {
      const user = userMap.get(member.userId);
      return {
        ...member,
        user: user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              displayUsername: user.displayUsername,
            }
          : null,
      };
    });

    // Apply search filter
    if (args.query) {
      const searchTerm = args.query.toLowerCase();
      results = results.filter(
        (member) =>
          member.user &&
          (member.user.name?.toLowerCase().includes(searchTerm) ||
            member.user.email?.toLowerCase().includes(searchTerm) ||
            member.user.displayUsername?.toLowerCase().includes(searchTerm)),
      );
    }

    // Apply limit
    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return results;
  },
});

/**
 * List organization teams
 */
export const listTeams = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get teams
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    return teams;
  },
});

/**
 * List organization projects
 */
export const listProjects = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get projects
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Get project statuses and attach to projects
    const projectsWithStatus = await Promise.all(
      projects.map(async (project) => {
        const status = project.statusId
          ? await ctx.db.get(project.statusId)
          : null;

        return {
          ...project,
          statusColor: status?.color,
          statusIcon: status?.icon,
        };
      }),
    );

    return projectsWithStatus;
  },
});

/**
 * List issue states
 */
export const listIssueStates = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get issue states
    const states = await ctx.db
      .query("issueStates")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    return states;
  },
});

/**
 * List project statuses
 */
export const listProjectStatuses = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get project statuses
    const statuses = await ctx.db
      .query("projectStatuses")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    return statuses;
  },
});

/**
 * List issue priorities
 */
export const listIssuePriorities = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is a member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get issue priorities
    const priorities = await ctx.db
      .query("issuePriorities")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    return priorities;
  },
});

/**
 * Invite a user to the organization
 */
export const invite = mutation({
  args: {
    orgSlug: v.string(),
    email: v.string(),
    role: v.union(v.literal("member"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user has permission to invite
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      throw new Error("Insufficient permissions to invite users");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      // Check if user is already a member
      const existingMembership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userId", existingUser._id),
        )
        .first();

      if (existingMembership) {
        throw new Error("User is already a member of this organization");
      }
    }

    // Create invitation
    const inviteId = await ctx.db.insert("invitations", {
      organizationId: org._id,
      email: args.email.toLowerCase(),
      role: args.role,
      status: "pending",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      inviterId: userId,
    });

    return { inviteId };
  },
});

/**
 * Check if user has specific permission in organization
 */
export const hasPermission = query({
  args: {
    orgSlug: v.string(),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return false; // Not authenticated users have no permissions
    }

    try {
      // Find organization
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
        .first();

      if (!org) {
        return false; // Organization not found
      }

      // Check if user is a member
      const membership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userId", userId),
        )
        .first();

      if (!membership) {
        return false; // Not a member
      }

      // Owner has all permissions
      if (membership.role === "owner") {
        return true;
      }

      // Admin has most permissions (could be refined based on specific permission)
      if (membership.role === "admin") {
        return true;
      }

      // Check custom role permissions
      const roleAssignments = await ctx.db
        .query("orgRoleAssignments")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();

      for (const assignment of roleAssignments) {
        const rolePermissions = await ctx.db
          .query("orgRolePermissions")
          .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
          .collect();

        for (const rolePerm of rolePermissions) {
          if (
            rolePerm.permission === args.permission ||
            rolePerm.permission === "*"
          ) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      return false; // On any error, deny permission
    }
  },
});

/**
 * Check if user has multiple permissions in organization
 */
export const hasPermissions = query({
  args: {
    orgSlug: v.string(),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      // Return false for all permissions if not authenticated
      return Object.fromEntries(args.permissions.map((p) => [p, false]));
    }

    try {
      // Find organization
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
        .first();

      if (!org) {
        // Return false for all permissions if org not found
        return Object.fromEntries(args.permissions.map((p) => [p, false]));
      }

      // Check if user is a member
      const membership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userId", userId),
        )
        .first();

      if (!membership) {
        // Return false for all permissions if not a member
        return Object.fromEntries(args.permissions.map((p) => [p, false]));
      }

      // Owner and Admin have all permissions
      if (membership.role === "owner" || membership.role === "admin") {
        return Object.fromEntries(args.permissions.map((p) => [p, true]));
      }

      // Check custom role permissions
      const roleAssignments = await ctx.db
        .query("orgRoleAssignments")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();

      const userPermissions = new Set<string>();

      for (const assignment of roleAssignments) {
        const rolePermissions = await ctx.db
          .query("orgRolePermissions")
          .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
          .collect();

        for (const rolePerm of rolePermissions) {
          if (rolePerm.permission === "*") {
            // Wildcard permission grants all permissions
            return Object.fromEntries(args.permissions.map((p) => [p, true]));
          }
          userPermissions.add(rolePerm.permission);
        }
      }

      // Return map of permission -> boolean
      return Object.fromEntries(
        args.permissions.map((p) => [p, userPermissions.has(p)]),
      );
    } catch (error) {
      // On any error, deny all permissions
      return Object.fromEntries(args.permissions.map((p) => [p, false]));
    }
  },
});

/**
 * Update member role in organization
 */
export const updateRole = mutation({
  args: {
    orgSlug: v.string(),
    userId: v.id("users"),
    role: v.union(v.literal("member"), v.literal("admin"), v.literal("owner")),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (currentUserId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify current user has permission to update roles
    const currentUserMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", currentUserId),
      )
      .first();

    if (
      !currentUserMembership ||
      (currentUserMembership.role !== "owner" &&
        currentUserMembership.role !== "admin")
    ) {
      throw new Error("Insufficient permissions to update roles");
    }

    // Find the target user's membership
    const targetMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", args.userId),
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this organization");
    }

    // Prevent demoting the last owner
    if (targetMembership.role === "owner" && args.role !== "owner") {
      const ownerCount = await ctx.db
        .query("members")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();

      if (ownerCount.length <= 1) {
        throw new Error("Cannot remove the last owner from the organization");
      }
    }

    // Update the role
    await ctx.db.patch(targetMembership._id, {
      role: args.role,
    });

    return { success: true };
  },
});

/**
 * Delete an issue priority for an organization
 */
export const deleteIssuePriority = mutation({
  args: {
    orgSlug: v.string(),
    priorityId: v.id("issuePriorities"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is an admin or owner
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "owner")
    ) {
      throw new Error("Access denied - admin or owner role required");
    }

    // Check if priority exists and belongs to organization
    const priority = await ctx.db.get(args.priorityId);
    if (!priority || priority.organizationId !== org._id) {
      throw new Error("Priority not found");
    }

    // Delete the priority
    await ctx.db.delete(args.priorityId);

    return { success: true };
  },
});

/**
 * Create an issue priority
 */
export const createIssuePriority = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    weight: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is an admin or owner
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "owner")
    ) {
      throw new Error("Access denied - admin or owner role required");
    }

    // Create the priority
    const priorityId = await ctx.db.insert("issuePriorities", {
      organizationId: org._id,
      name: args.name,
      color: args.color || "#94a3b8",
      icon: args.icon,
      weight: args.weight,
    });

    return { id: priorityId, success: true };
  },
});

/**
 * Update an issue priority
 */
export const updateIssuePriority = mutation({
  args: {
    orgSlug: v.string(),
    priorityId: v.id("issuePriorities"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    weight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user is an admin or owner
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (
      !membership ||
      (membership.role !== "admin" && membership.role !== "owner")
    ) {
      throw new Error("Access denied - admin or owner role required");
    }

    // Check if priority exists and belongs to organization
    const priority = await ctx.db.get(args.priorityId);
    if (!priority || priority.organizationId !== org._id) {
      throw new Error("Priority not found");
    }

    // Update the priority
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.color !== undefined) updates.color = args.color;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.weight !== undefined) updates.weight = args.weight;

    await ctx.db.patch(args.priorityId, updates);

    return { success: true };
  },
});

export const resetIssuePriorities = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!userId || !org) {
      throw new Error("Unauthorized");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const existingPriorities = await ctx.db
      .query("issuePriorities")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    for (const priority of existingPriorities) {
      await ctx.db.delete(priority._id);
    }

    for (const priority of ISSUE_PRIORITY_DEFAULTS) {
      await ctx.db.insert("issuePriorities", {
        organizationId: org._id,
        name: priority.name,
        weight: priority.weight,
        color: priority.color,
        icon: priority.icon,
      });
    }
  },
});

export const resetIssueStates = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!userId || !org) {
      throw new Error("Unauthorized");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const existingStates = await ctx.db
      .query("issueStates")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    for (const state of existingStates) {
      await ctx.db.delete(state._id);
    }

    for (const state of ISSUE_STATE_DEFAULTS) {
      await ctx.db.insert("issueStates", {
        organizationId: org._id,
        name: state.name,
        position: state.position,
        color: state.color,
        icon: state.icon,
        type: state.type,
      });
    }
  },
});

export const resetProjectStatuses = mutation({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!userId || !org) {
      throw new Error("Unauthorized");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const existingStatuses = await ctx.db
      .query("projectStatuses")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    for (const status of existingStatuses) {
      await ctx.db.delete(status._id);
    }

    for (const status of PROJECT_STATUS_DEFAULTS) {
      await ctx.db.insert("projectStatuses", {
        organizationId: org._id,
        name: status.name,
        position: status.position,
        color: status.color,
        icon: status.icon,
        type: status.type,
      });
    }
  },
});

export const createIssueState = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("canceled"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!userId || !org) {
      throw new Error("Unauthorized");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.insert("issueStates", {
      organizationId: org._id,
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });
  },
});

export const updateIssueState = mutation({
  args: {
    orgSlug: v.string(),
    stateId: v.id("issueStates"),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal("backlog"),
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("canceled"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.stateId, {
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });
  },
});

export const createProjectStatus = mutation({
  args: {
    orgSlug: v.string(),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal("backlog"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("canceled"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.insert("projectStatuses", {
      organizationId: org._id,
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });
  },
});

export const updateProjectStatus = mutation({
  args: {
    orgSlug: v.string(),
    statusId: v.id("projectStatuses"),
    name: v.string(),
    position: v.number(),
    color: v.string(),
    icon: v.optional(v.string()),
    type: v.union(
      v.literal("backlog"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("canceled"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const member = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!member || member.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.statusId, {
      name: args.name,
      position: args.position,
      color: args.color,
      icon: args.icon,
      type: args.type,
    });
  },
});

export const listIssuesPaged = query({
  args: {
    orgSlug: v.string(),
    page: v.number(),
    pageSize: v.number(),
    projectId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    assignedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      return { issues: [], total: 0, counts: {} };
    }

    let query = ctx.db
      .query("issues")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id));

    if (args.projectId) {
      query = query.filter((q) =>
        q.eq(q.field("projectId"), args.projectId as any),
      );
    }

    if (args.teamId) {
      query = query.filter((q) => q.eq(q.field("teamId"), args.teamId as any));
    }

    const issues = await query
      .order("desc")
      .paginate({ numItems: args.pageSize, cursor: null });

    // This is a simplified implementation. The legacy code has more complex logic
    // for calculating total and counts.
    return {
      issues: issues.page,
      total: issues.page.length,
      counts: {},
    };
  },
});

/**
 * Delete an issue state for an organization
 */
export const deleteIssueState = mutation({
  args: {
    orgSlug: v.string(),
    stateId: v.id("issueStates"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const state = await ctx.db.get(args.stateId);
    if (!state || state.organizationId !== org._id) {
      throw new Error("Issue state not found");
    }

    const assignments = await ctx.db
      .query("issueAssignees")
      .withIndex("by_state", (q) => q.eq("stateId", args.stateId))
      .collect();

    if (assignments.length > 0) {
      throw new Error("State is in use by existing issues");
    }

    await ctx.db.delete(args.stateId);
    return { success: true };
  },
});

/**
 * Delete a project status for an organization
 */
export const deleteProjectStatus = mutation({
  args: {
    orgSlug: v.string(),
    statusId: v.id("projectStatuses"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const status = await ctx.db.get(args.statusId);
    if (!status || status.organizationId !== org._id) {
      throw new Error("Project status not found");
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_status", (q) => q.eq("statusId", args.statusId))
      .collect();

    if (projects.length > 0) {
      throw new Error("Status is in use by existing projects");
    }

    await ctx.db.delete(args.statusId);
    return { success: true };
  },
});

/**
 * Check if user is an admin or owner of the organization.
 */
export const isOrgAdminOrOwner = query({
  args: {
    orgSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await getOrgMember(ctx, args.orgSlug);
    return (
      membership !== null &&
      (membership.role === "admin" || membership.role === "owner")
    );
  },
});

/**
 * Get the current user's membership details for an organization.
 * @param ctx - The query or mutation context.
 * @param orgSlug - The slug of the organization.
 * @returns The membership object if the user is a member, otherwise null.
 */
async function getOrgMember(ctx: QueryCtx | MutationCtx, orgSlug: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }

  const org = await ctx.db
    .query("organizations")
    .withIndex("by_slug", (q) => q.eq("slug", orgSlug))
    .first();

  if (!org) {
    return null;
  }

  const membership = await ctx.db
    .query("members")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", org._id).eq("userId", userId),
    )
    .first();

  return membership;
}
