import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requirePermission, PERMISSIONS } from "./permissions";
import {
  canViewTeam,
  canEditTeam,
  canDeleteTeam,
  canManageTeamMembers,
} from "./access";

/**
 * Get team by organization slug and team key
 */
export const getByKey = query({
  args: {
    orgSlug: v.string(),
    teamKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError("ORGANIZATION_NOT_FOUND");
    }

    // Find team by key and organization
    const team = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.teamKey),
      )
      .first();

    if (!team) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }

    // Check if user can view this team based on visibility
    if (!(await canViewTeam(ctx, team))) {
      throw new ConvexError("FORBIDDEN");
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
      visibility: v.optional(
        v.union(
          v.literal("private"),
          v.literal("organization"),
          v.literal("public"),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("UNAUTHORIZED");
    }

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError("ORGANIZATION_NOT_FOUND");
    }

    await requirePermission(ctx, org._id, PERMISSIONS.TEAM_CREATE);

    // Check if team key is unique within the organization
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_org_key", (q) =>
        q.eq("organizationId", org._id).eq("key", args.data.key),
      )
      .first();

    if (existingTeam) {
      throw new ConvexError("TEAM_KEY_EXISTS");
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
        throw new ConvexError("INVALID_TEAM_LEAD");
      }
    }

    // Validate input
    if (!args.data.key.trim()) {
      throw new ConvexError("INVALID_INPUT");
    }
    if (!args.data.name.trim()) {
      throw new ConvexError("INVALID_INPUT");
    }
    if (args.data.key.length > 10) {
      throw new ConvexError("INVALID_INPUT");
    }
    if (args.data.name.length > 100) {
      throw new ConvexError("INVALID_INPUT");
    }
    if (args.data.description && args.data.description.length > 500) {
      throw new ConvexError("INVALID_INPUT");
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
      visibility: args.data.visibility || "organization", // Default to organization visibility
      createdBy: userId,
    });

    // Automatically add the creator as a team member with "owner" role
    await ctx.db.insert("teamMembers", {
      teamId: teamId,
      userId: userId,
      role: "lead", // Using "lead" as the owner role for team members
      joinedAt: Date.now(),
    });

    return { teamId };
  },
});

/**
 * Update team details
 */
export const update = mutation({
  args: {
    teamId: v.id("teams"),
    data: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      leadId: v.optional(v.id("users")),
      icon: v.optional(v.string()),
      color: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }

    if (!(await canEditTeam(ctx, team))) {
      throw new ConvexError("FORBIDDEN");
    }

    // Validate lead user if provided
    if (args.data.leadId) {
      const leadMembership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q
            .eq("organizationId", team.organizationId)
            .eq("userId", args.data.leadId!),
        )
        .first();

      if (!leadMembership) {
        throw new ConvexError("INVALID_TEAM_LEAD");
      }
    }

    await ctx.db.patch(team._id, { ...args.data });

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
    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new ConvexError("ORGANIZATION_NOT_FOUND");
    }

    // Get all teams in organization
    const allTeams = await ctx.db
      .query("teams")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    // Filter teams based on visibility permissions
    const teamPromises = allTeams.map(async (team) => {
      const canView = await canViewTeam(ctx, team);
      return canView ? team : null;
    });
    const teams = (await Promise.all(teamPromises)).filter(
      (team): team is Doc<"teams"> => team !== null,
    );

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
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    if (!args.teamId) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }

    if (!(await canViewTeam(ctx, team))) {
      throw new ConvexError("FORBIDDEN");
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
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: v.union(v.literal("lead"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }

    if (!(await canManageTeamMembers(ctx, team, "add"))) {
      throw new ConvexError("FORBIDDEN");
    }

    // Verify target user is member of organization
    const targetUserMembership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", team.organizationId).eq("userId", args.userId),
      )
      .first();

    if (!targetUserMembership) {
      throw new ConvexError("USER_NOT_MEMBER");
    }

    // Check if user is already a team member
    const existingMember = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", team._id).eq("userId", args.userId),
      )
      .first();

    if (existingMember) {
      throw new ConvexError("USER_ALREADY_MEMBER");
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
    membershipId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new ConvexError("TEAM_MEMBERSHIP_NOT_FOUND");
    }

    const team = await ctx.db.get(membership.teamId);
    if (!team) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }

    if (!(await canManageTeamMembers(ctx, team, "remove"))) {
      throw new ConvexError("FORBIDDEN");
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
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new ConvexError("TEAM_NOT_FOUND");
    }

    if (!(await canDeleteTeam(ctx, team))) {
      throw new ConvexError("FORBIDDEN");
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

export const changeVisibility = mutation({
  args: {
    teamId: v.id("teams"),
    visibility: v.union(
      v.literal("private"),
      v.literal("organization"),
      v.literal("public"),
    ),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new ConvexError("TEAM_NOT_FOUND");

    if (!(await canEditTeam(ctx, team))) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(team._id, {
      visibility: args.visibility,
    });

    return { success: true };
  },
});
