import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { auth } from "./auth";

/**
 * Get the current authenticated user
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    return user;
  },
});

/**
 * Update current user profile
 */
export const updateProfile = mutation({
  args: {
    name: v.string(),
    displayUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(userId, {
      name: args.name,
      displayUsername: args.displayUsername,
    });

    return { success: true };
  },
});

/**
 * Check if any admin users exist in the system
 */
export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const adminUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();

    return adminUser !== null;
  },
});

/**
 * Check if any users exist in the system (for first-run check)
 */
export const hasAnyUsers = query({
  args: {},
  handler: async (ctx) => {
    const anyUser = await ctx.db.query("users").first();
    return anyUser !== null;
  },
});

/**
 * Bootstrap the very first administrator user
 * Creates both user and credential account, throws if admin already exists
 */
export const bootstrapAdmin = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if admin already exists
    const existingAdmin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();

    if (existingAdmin) {
      throw new Error("An admin account already exists");
    }

    // Check for existing user with same email or username
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingByEmail) {
      throw new Error("A user with this email already exists");
    }

    if (args.username) {
      const existingByUsername = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", args.username))
        .first();

      if (existingByUsername) {
        throw new Error("A user with this username already exists");
      }
    }

    // Create the admin user using Convex Auth
    // We'll use the signIn mutation to create the user with proper auth integration
    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      emailVerified: true,
      username: args.username,
      displayUsername: args.username,
      role: "admin",
      banned: false,
    });

    return { id: userId };
  },
});

/**
 * Get user's active organization for post-login redirect
 */
export const getUserActiveOrganization = query({
  args: {
    sessionActiveOrgId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Try session active org first
    if (args.sessionActiveOrgId) {
      const sessionOrgId = args.sessionActiveOrgId;
      const membership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", sessionOrgId).eq("userId", userId),
        )
        .first();

      if (membership) {
        const org = await ctx.db.get(sessionOrgId);
        return org?.slug ?? null;
      }
    }

    // Fallback: Get first organization membership
    const firstMembership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (firstMembership) {
      const org = await ctx.db.get(firstMembership.organizationId);
      return org?.slug ?? null;
    }

    return null;
  },
});

/**
 * Search users by name or email (for assignments, etc.)
 */
export const searchUsers = query({
  args: {
    query: v.string(),
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const limit = args.limit ?? 10;
    const searchQuery = args.query.toLowerCase();

    // If organizationId provided, only search within that org
    if (args.organizationId) {
      const orgId = args.organizationId;
      // Get org members first
      const members = await ctx.db
        .query("members")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect();

      const memberUserIds = members.map((m) => m.userId);

      // Get user details and filter by search query
      const users = await Promise.all(
        memberUserIds.map((id) => ctx.db.get(id)),
      );

      return users
        .filter(
          (user) =>
            user &&
            (user.name.toLowerCase().includes(searchQuery) ||
              user.email.toLowerCase().includes(searchQuery) ||
              (user.username &&
                user.username.toLowerCase().includes(searchQuery))),
        )
        .slice(0, limit);
    }

    // Global search (for admin users)
    const allUsers = await ctx.db.query("users").collect();

    return allUsers
      .filter(
        (user) =>
          user.name.toLowerCase().includes(searchQuery) ||
          user.email.toLowerCase().includes(searchQuery) ||
          (user.username && user.username.toLowerCase().includes(searchQuery)),
      )
      .slice(0, limit);
  },
});

export const getCurrentUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const getOrganizations = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) {
      return [];
    }
    const orgs = await Promise.all(orgIds.map((id) => ctx.db.get(id)));
    return orgs.filter(Boolean);
  },
});

export const getPendingInvitations = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return [];
    }

    const invites = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) => q.eq("email", user.email))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const invitesWithOrg = await Promise.all(
      invites.map(async (invite) => {
        const organization = await ctx.db.get(invite.organizationId);
        return { ...invite, organization };
      }),
    );
    return invitesWithOrg;
  },
});
