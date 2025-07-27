import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { auth } from "./auth";

/**
 * Get team by organization slug and team key
 */
export const getByKey = query({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
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

    // Find team by key and organization
    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new Error("Team not found");
    }

    // Get team details including lead user
    const leadUser = team.leadId ? await ctx.db.get(team.leadId) : null;

    return {
      ...team,
      lead: leadUser,
    };
  },
});

/**
 * Create new team
 */
export const create = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      key: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      leadId: v.optional(v.id("users")),
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

    // Verify user has permission to create teams
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
      throw new Error("Insufficient permissions to create teams");
    }

    // Check if team key is unique within the organization
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.data.key),
      )
      .first();

    if (existingTeam) {
      throw new Error("Team key already exists in this organization");
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
        throw new Error("Team lead must be a member of the organization");
      }
    }

    // Validate input
    if (!args.data.key.trim()) {
      throw new Error("Team key is required");
    }
    if (!args.data.name.trim()) {
      throw new Error("Team name is required");
    }
    if (args.data.key.length > 10) {
      throw new Error("Team key must be 10 characters or less");
    }
    if (args.data.name.length > 100) {
      throw new Error("Team name must be 100 characters or less");
    }
    if (args.data.description && args.data.description.length > 500) {
      throw new Error("Team description must be 500 characters or less");
    }

    // Create team
    const teamId = await ctx.db.insert("teams", {
      organizationId: org._id,
      key: args.data.key.trim(),
      name: args.data.name.trim(),
      description: args.data.description?.trim(),
      leadId: args.data.leadId,
      icon: args.data.icon,
      color: args.data.color,
    });

    return { teamId };
  },
});

/**
 * Update team details
 */
export const update = mutation({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    data: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      leadId: v.optional(v.id("users")),
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

    // Find team
    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new Error("Team not found");
    }

    // Verify user has permission to update team
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
      throw new Error("Insufficient permissions to update team");
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
        throw new Error("Team lead must be a member of the organization");
      }
    }

    // Update team - only update provided fields
    const updateData: Partial<{
      name: string;
      description: string;
      leadId: Id<"users">;
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
    if (args.data.icon !== undefined) {
      updateData.icon = args.data.icon;
    }
    if (args.data.color !== undefined) {
      updateData.color = args.data.color;
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(team._id, updateData);
    }

    return { success: true };
  },
});

/**
 * List teams in organization
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

    // Get all teams in organization
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Batch database calls for better performance
    const leadIds = teams.map((t) => t.leadId).filter(Boolean) as Id<"users">[];
    const leadUsers = await Promise.all(leadIds.map((id) => ctx.db.get(id)));
    const leadUserMap = new Map(leadIds.map((id, i) => [id, leadUsers[i]]));

    // Get team member counts in batches
    const teamMemberCounts = await Promise.all(
      teams.map(async (team) => {
        const memberCount = await ctx.db
          .query("teamMembers")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect()
          .then((members) => members.length);
        return { teamId: team._id, memberCount };
      }),
    );
    const memberCountMap = new Map(
      teamMemberCounts.map(({ teamId, memberCount }) => [teamId, memberCount]),
    );

    // Combine results
    const teamsWithDetails = teams.map((team) => {
      const leadUser = team.leadId ? leadUserMap.get(team.leadId) : null;
      const memberCount = memberCountMap.get(team._id) ?? 0;

      return {
        ...team,
        lead: leadUser,
        memberCount,
      };
    });

    return teamsWithDetails;
  },
});

/**
 * List team members
 */
export const listMembers = query({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and team
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new Error("Team not found");
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

    // Get team members
    const teamMembers = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    // Get user details for each member
    const membersWithUsers = await Promise.all(
      teamMembers.map(async (member) => {
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
 * Add member to team
 */
export const addMember = mutation({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    userId: v.id("users"),
    role: v.union(v.literal("lead"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (currentUserId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and team
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new Error("Team not found");
    }

    // Verify current user has permission
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
      throw new Error("Insufficient permissions to add team members");
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

    // Check if user is already a team member
    const existingMember = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();

    if (existingMember) {
      throw new Error("User is already a member of this team");
    }

    // Add team member
    const membershipId = await ctx.db.insert("teamMembers", {
      teamId: team._id,
      userId: args.userId,
      role: args.role,
      joinedAt: Date.now(),
    });

    return { membershipId };
  },
});

/**
 * Remove member from team
 */
export const removeMember = mutation({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
    membershipId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and team
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new Error("Team not found");
    }

    // Get the membership to remove
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.teamId !== team._id) {
      throw new Error("Team membership not found");
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
      throw new Error("Insufficient permissions to remove team member");
    }

    // Remove membership
    await ctx.db.delete(args.membershipId);

    return { success: true };
  },
});

/**
 * Delete team
 */
export const deleteTeam = mutation({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and team
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new Error("Team not found");
    }

    // Verify user has permission to delete team
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
      throw new Error("Insufficient permissions to delete team");
    }

    // Delete team and related data
    // First delete all team members
    const teamMembers = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    for (const member of teamMembers) {
      await ctx.db.delete(member._id);
    }

    // Finally delete the team
    await ctx.db.delete(team._id);

    return { success: true };
  },
});
