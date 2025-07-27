import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { auth } from "./auth";

/**
 * Get project by organization slug and project key
 */
export const getByKey = query({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
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

    // Verify user is a member of the organization
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Find project by key and organization
    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.projectKey),
      )
      .first();

    if (!project) {
      throw new Error("Project not found");
    }

    // Get project details including lead user
    const leadUser = project.leadId ? await ctx.db.get(project.leadId) : null;

    return {
      ...project,
      lead: leadUser,
    };
  },
});

/**
 * Create new project
 */
export const create = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      key: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      leadId: v.optional(v.id("users")),
      statusId: v.optional(v.id("projectStatuses")),
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

    // Verify user has permission to create projects
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Check if project key is unique within the organization
    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.data.key),
      )
      .first();

    if (existingProject) {
      throw new Error("Project key already exists in this organization");
    }

    // Validate lead user exists and is member of org if provided
    if (args.data.leadId) {
      const leadId = args.data.leadId;
      const leadMembership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userId", leadId),
        )
        .first();

      if (!leadMembership) {
        throw new Error("Project lead must be a member of the organization");
      }
    }

    // Validate input
    if (!args.data.key.trim()) {
      throw new Error("Project key is required");
    }
    if (!args.data.name.trim()) {
      throw new Error("Project name is required");
    }
    if (args.data.key.length > 20) {
      throw new Error("Project key must be 20 characters or less");
    }
    if (args.data.name.length > 100) {
      throw new Error("Project name must be 100 characters or less");
    }
    if (args.data.description && args.data.description.length > 1000) {
      throw new Error("Project description must be 1000 characters or less");
    }

    // Create project
    const projectId = await ctx.db.insert("projects", {
      organizationId: org._id,
      key: args.data.key.trim(),
      name: args.data.name.trim(),
      description: args.data.description?.trim(),
      leadId: args.data.leadId,
      statusId: args.data.statusId,
      createdBy: userId,
    });

    return { projectId };
  },
});

/**
 * Update project details
 */
export const update = mutation({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    data: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      leadId: v.optional(v.id("users")),
      teamId: v.optional(v.id("teams")),
      statusId: v.optional(v.id("projectStatuses")),
      icon: v.optional(v.string()),
      color: v.optional(v.string()),
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

    // Find project
    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.projectKey),
      )
      .first();

    if (!project) {
      throw new Error("Project not found");
    }

    // Verify user has permission to update project
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Validate lead user if provided
    if (args.data.leadId) {
      const leadId = args.data.leadId;
      const leadMembership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userId", leadId),
        )
        .first();

      if (!leadMembership) {
        throw new Error("Project lead must be a member of the organization");
      }
    }

    // Validate team exists in organization if provided
    if (args.data.teamId) {
      const team = await ctx.db.get(args.data.teamId);
      if (!team || team.organizationId !== org._id) {
        throw new Error("Team not found or not in this organization");
      }
    }

    // Update project - only update provided fields
    const updateData: Partial<{
      name: string;
      description: string;
      leadId: Id<"users">;
      teamId: Id<"teams">;
      statusId: Id<"projectStatuses">;
      icon: string;
      color: string;
    }> = {};

    if (args.data.name !== undefined) {
      updateData.name = args.data.name;
    }
    if (args.data.description !== undefined) {
      updateData.description = args.data.description;
    }
    if (args.data.leadId !== undefined) {
      updateData.leadId = args.data.leadId;
    }
    if (args.data.teamId !== undefined) {
      updateData.teamId = args.data.teamId;
    }
    if (args.data.statusId !== undefined) {
      updateData.statusId = args.data.statusId;
    }
    if (args.data.icon !== undefined) {
      updateData.icon = args.data.icon;
    }
    if (args.data.color !== undefined) {
      updateData.color = args.data.color;
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(project._id, updateData);
    }

    return { success: true };
  },
});

export const changeStatus = mutation({
  args: {
    projectId: v.id("projects"),
    statusId: v.union(v.id("projectStatuses"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      statusId: args.statusId ?? undefined,
    });
  },
});

export const changeTeam = mutation({
  args: {
    projectId: v.id("projects"),
    teamId: v.union(v.id("teams"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      teamId: args.teamId ?? undefined,
    });
  },
});

export const changeLead = mutation({
  args: {
    projectId: v.id("projects"),
    leadId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      leadId: args.leadId ?? undefined,
    });
  },
});

/**
 * List projects in organization
 */
export const list = query({
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

    // Get all projects in organization
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Batch database calls for better performance
    const leadIds = projects
      .map((p) => p.leadId)
      .filter(Boolean) as Id<"users">[];
    const statusIds = projects
      .map((p) => p.statusId)
      .filter(Boolean) as Id<"projectStatuses">[];

    const leadUsers = await Promise.all(leadIds.map((id) => ctx.db.get(id)));
    const statuses = await Promise.all(statusIds.map((id) => ctx.db.get(id)));

    const leadUserMap = new Map(leadIds.map((id, i) => [id, leadUsers[i]]));
    const statusMap = new Map(statusIds.map((id, i) => [id, statuses[i]]));

    // Combine results
    const projectsWithDetails = projects.map((project) => {
      const leadUser = project.leadId ? leadUserMap.get(project.leadId) : null;
      const status = project.statusId ? statusMap.get(project.statusId) : null;

      return {
        ...project,
        lead: leadUser,
        status,
      };
    });

    return projectsWithDetails;
  },
});

/**
 * List project members
 */
export const listMembers = query({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and project
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.projectKey),
      )
      .first();

    if (!project) {
      throw new Error("Project not found");
    }

    // Verify user has access
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get project members
    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    // Get user details for each member
    const membersWithUsers = await Promise.all(
      projectMembers.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return {
          ...member,
          user,
        };
      }),
    );

    return membersWithUsers;
  },
});

/**
 * Add member to project
 */
export const addMember = mutation({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    userId: v.id("users"),
    role: v.union(v.literal("lead"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (currentUserId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and project
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.projectKey),
      )
      .first();

    if (!project) {
      throw new Error("Project not found");
    }

    // Verify current user has permission
    const currentUserMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", currentUserId),
      )
      .first();

    if (!currentUserMembership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Verify target user is member of organization
    const targetUserMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", args.userId),
      )
      .first();

    if (!targetUserMembership) {
      throw new Error("User is not a member of this organization");
    }

    // Check if user is already a project member
    const existingMember = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", project._id).eq("userId", args.userId),
      )
      .first();

    if (existingMember) {
      throw new Error("User is already a member of this project");
    }

    // Add project member
    const membershipId = await ctx.db.insert("projectMembers", {
      projectId: project._id,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    });

    return { membershipId };
  },
});

/**
 * Remove member from project
 */
export const removeMember = mutation({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
    membershipId: v.id("projectMembers"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and project
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.projectKey),
      )
      .first();

    if (!project) {
      throw new Error("Project not found");
    }

    // Get the membership to remove
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.projectId !== project._id) {
      throw new Error("Project membership not found");
    }

    // Verify user has permission or is removing themselves
    const userMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    const isRemovingSelf = membership.userId === userId;
    const hasPermission =
      userMembership &&
      (userMembership.role === "owner" || userMembership.role === "admin");

    if (!isRemovingSelf && !hasPermission) {
      throw new Error("Insufficient permissions to remove project member");
    }

    // Remove membership
    await ctx.db.delete(args.membershipId);

    return { success: true };
  },
});

/**
 * Delete project
 */
export const deleteProject = mutation({
  args: {
    orgSlug: v.string(),
    projectKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and project
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.projectKey),
      )
      .first();

    if (!project) {
      throw new Error("Project not found");
    }

    // Verify user has permission to delete project
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
      throw new Error("Insufficient permissions to delete project");
    }

    // Delete project and related data
    // First delete all project members
    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    for (const member of projectMembers) {
      await ctx.db.delete(member._id);
    }

    // Delete project teams associations
    const projectTeams = await ctx.db
      .query("projectTeams")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    for (const team of projectTeams) {
      await ctx.db.delete(team._id);
    }

    // Finally delete the project
    await ctx.db.delete(project._id);

    return { success: true };
  },
});
