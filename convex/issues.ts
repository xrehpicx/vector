import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { auth } from "./auth";

/**
 * Get issue by organization slug and issue key
 */
export const getByKey = query({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
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

    // Find issue by key within the organization
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_key", (q) => q.eq("key", args.issueKey))
      .filter((q) => q.eq(q.field("organizationId"), org._id))
      .first();

    if (!issue) {
      throw new Error("Issue not found");
    }

    // Get related data
    const project = issue.projectId ? await ctx.db.get(issue.projectId) : null;
    const assignees = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();

    const assigneeUsers = await Promise.all(
      assignees.map(async (assignee) => {
        if (!assignee.assigneeId) return null;
        return await ctx.db.get(assignee.assigneeId);
      }),
    ).then((users) => users.filter(Boolean));

    const createdByUser = issue.reporterId
      ? await ctx.db.get(issue.reporterId)
      : null;
    const priority = issue.priorityId
      ? await ctx.db.get(issue.priorityId)
      : null;

    return {
      ...issue,
      project,
      assignees: assigneeUsers,
      createdBy: createdByUser,
      priority,
    };
  },
});

/**
 * Create new issue
 */
export const create = mutation({
  args: {
    orgSlug: v.string(),
    data: v.object({
      title: v.string(),
      description: v.optional(v.string()),
      projectId: v.id("projects"),
      stateId: v.optional(v.id("issueStates")),
      priorityId: v.optional(v.id("issuePriorities")),
      assigneeIds: v.optional(v.array(v.id("users"))),
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

    // Verify project exists and belongs to org
    const project = await ctx.db.get(args.data.projectId);
    if (!project || project.organizationId !== org._id) {
      throw new Error("Project not found or not in this organization");
    }

    // Generate issue key - get next number for the project
    const existingIssues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.data.projectId))
      .collect();

    const nextNumber = existingIssues.length + 1;
    const issueKey = `${project.key}-${nextNumber}`;

    // Verify assignees are members of the organization if provided
    if (args.data.assigneeIds) {
      for (const assigneeId of args.data.assigneeIds) {
        const assigneeMembership = await ctx.db
          .query("members")
          .withIndex("by_org_user", (q) =>
            q.eq("organizationId", org._id).eq("userId", assigneeId),
          )
          .first();

        if (!assigneeMembership) {
          throw new Error("All assignees must be members of the organization");
        }
      }
    }

    // Validate input
    if (!args.data.title.trim()) {
      throw new Error("Issue title is required");
    }
    if (args.data.title.length > 200) {
      throw new Error("Issue title must be 200 characters or less");
    }
    if (args.data.description && args.data.description.length > 5000) {
      throw new Error("Issue description must be 5000 characters or less");
    }

    // Create issue
    const issueId = await ctx.db.insert("issues", {
      organizationId: org._id,
      projectId: args.data.projectId,
      key: issueKey,
      sequenceNumber: nextNumber,
      title: args.data.title.trim(),
      description: args.data.description?.trim(),
      priorityId: args.data.priorityId,
      reporterId: userId,
      teamId: project.teamId, // Use project's team if available
    });

    // Create assignee relationships if provided
    if (args.data.assigneeIds && args.data.assigneeIds.length > 0) {
      // Get default state for new issues
      const defaultState = await ctx.db
        .query("issueStates")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .first();

      if (defaultState) {
        for (const assigneeId of args.data.assigneeIds) {
          await ctx.db.insert("issueAssignees", {
            issueId,
            assigneeId,
            stateId: defaultState._id,
          });
        }
      }
    }

    return { issueId, key: issueKey };
  },
});

/**
 * Update issue details
 */
export const update = mutation({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    data: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      priorityId: v.optional(v.id("issuePriorities")),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and issue
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const issue = await ctx.db
      .query("issues")
      .withIndex("by_key", (q) => q.eq("key", args.issueKey))
      .filter((q) => q.eq(q.field("organizationId"), org._id))
      .first();

    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has permission
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Update issue - only update provided fields
    const updateData: Partial<{
      title: string;
      description: string;
      priorityId: Id<"issuePriorities">;
    }> = {};

    if (args.data.title !== undefined) {
      updateData.title = args.data.title;
    }
    if (args.data.description !== undefined) {
      updateData.description = args.data.description;
    }
    if (args.data.priorityId !== undefined) {
      updateData.priorityId = args.data.priorityId;
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(issue._id, updateData);
    }

    return { success: true };
  },
});

/**
 * List issues by project or organization
 */
export const list = query({
  args: {
    orgSlug: v.string(),
    projectKey: v.optional(v.string()),
    stateId: v.optional(v.id("issueStates")),
    assigneeId: v.optional(v.id("users")),
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

    let issues;

    if (args.projectKey) {
      const projectKey = args.projectKey;
      // Find project first
      const project = await ctx.db
        .query("projects")
        .withIndex("by_org_key", (q) =>
          q.eq("organizationId", org._id).eq("key", projectKey),
        )
        .first();

      if (!project) {
        throw new Error("Project not found");
      }

      // Get issues for specific project
      issues = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
    } else {
      // Get all issues in organization
      issues = await ctx.db
        .query("issues")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();
    }

    // Apply filters
    // NOTE: Issue state is stored per-assignee; global state filter not supported yet

    if (args.assigneeId) {
      // Filter by assignee - need to check issueAssignees table
      const assigneeIssueIds = new Set();
      const assignments = await ctx.db
        .query("issueAssignees")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", args.assigneeId))
        .collect();

      assignments.forEach((assignment) => {
        assigneeIssueIds.add(assignment.issueId);
      });

      issues = issues.filter((issue) => assigneeIssueIds.has(issue._id));
    }

    // Apply limit
    if (args.limit) {
      issues = issues.slice(0, args.limit);
    }

    // Batch database calls for better performance
    const projectIds = issues
      .map((i) => i.projectId)
      .filter(Boolean) as Id<"projects">[];
    const priorityIds = issues
      .map((i) => i.priorityId)
      .filter(Boolean) as Id<"issuePriorities">[];
    const reporterIds = issues
      .map((i) => i.reporterId)
      .filter(Boolean) as Id<"users">[];

    const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
    const priorities = await Promise.all(
      priorityIds.map((id) => ctx.db.get(id)),
    );
    const reporters = await Promise.all(
      reporterIds.map((id) => ctx.db.get(id)),
    );

    const projectMap = new Map();
    projectIds.forEach((id, i) => {
      if (projects[i]) projectMap.set(id, projects[i]);
    });

    const priorityMap = new Map();
    priorityIds.forEach((id, i) => {
      if (priorities[i]) priorityMap.set(id, priorities[i]);
    });

    const reporterMap = new Map();
    reporterIds.forEach((id, i) => {
      if (reporters[i]) reporterMap.set(id, reporters[i]);
    });

    // Get all assignees for all issues - need to query individually since index doesn't support inArray
    const allAssignments = await Promise.all(
      issues.map((issue) =>
        ctx.db
          .query("issueAssignees")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .collect(),
      ),
    ).then((results) => results.flat());

    const assigneeIds = allAssignments
      .map((a) => a.assigneeId)
      .filter(Boolean) as Id<"users">[];
    const assigneeUsers = await Promise.all(
      assigneeIds.map((id) => ctx.db.get(id)),
    );
    const assigneeMap = new Map();
    assigneeIds.forEach((id, i) => {
      if (assigneeUsers[i]) assigneeMap.set(id, assigneeUsers[i]);
    });

    // Group assignments by issue
    const assignmentsByIssue = new Map<Id<"issues">, typeof allAssignments>();
    for (const assignment of allAssignments) {
      if (!assignmentsByIssue.has(assignment.issueId)) {
        assignmentsByIssue.set(assignment.issueId, []);
      }
      assignmentsByIssue.get(assignment.issueId)!.push(assignment);
    }

    // Combine results
    const issuesWithDetails = issues.map((issue) => {
      const project = issue.projectId ? projectMap.get(issue.projectId) : null;
      const priority = issue.priorityId
        ? priorityMap.get(issue.priorityId)
        : null;
      const createdBy = issue.reporterId
        ? reporterMap.get(issue.reporterId)
        : null;

      // Get assignees for this issue
      const issueAssignments = assignmentsByIssue.get(issue._id) ?? [];
      const assigneeUsers = issueAssignments
        .map((assignment) => {
          if (!assignment.assigneeId) return null;
          return assigneeMap.get(assignment.assigneeId);
        })
        .filter(Boolean);

      return {
        ...issue,
        project,
        priority,
        createdBy,
        state: null, // per-assignee state not loaded here
        assignees: assigneeUsers,
      };
    });

    return issuesWithDetails;
  },
});

/**
 * Assign users to issue
 */
export const assign = mutation({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    assigneeIds: v.array(v.id("users")),
    replace: v.optional(v.boolean()), // if true, replace existing assignees; if false, add to existing
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and issue
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const issue = await ctx.db
      .query("issues")
      .withIndex("by_key", (q) => q.eq("key", args.issueKey))
      .filter((q) => q.eq(q.field("organizationId"), org._id))
      .first();

    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has permission
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Verify all assignees are members of the organization
    for (const assigneeId of args.assigneeIds) {
      const assigneeMembership = await ctx.db
        .query("members")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", org._id).eq("userId", assigneeId),
        )
        .first();

      if (!assigneeMembership) {
        throw new Error("All assignees must be members of the organization");
      }
    }

    // If replace mode, remove existing assignees first
    if (args.replace) {
      const existingAssignees = await ctx.db
        .query("issueAssignees")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect();

      for (const assignee of existingAssignees) {
        await ctx.db.delete(assignee._id);
      }
    }

    // Add new assignees (skip duplicates if not in replace mode)
    for (const assigneeId of args.assigneeIds) {
      if (!args.replace) {
        // Check if already assigned
        const existingAssignment = await ctx.db
          .query("issueAssignees")
          .withIndex("by_issue_assignee", (q) =>
            q.eq("issueId", issue._id).eq("assigneeId", assigneeId),
          )
          .first();

        if (existingAssignment) {
          continue; // Skip if already assigned
        }
      }

      const assignments = await ctx.db
        .query("issueAssignees")
        .withIndex("by_assignee", (q) => q.eq("assigneeId", assigneeId))
        .collect();

      // Get default state for the organization if no existing assignment state
      let defaultStateId = assignments[0]?.stateId;
      if (!defaultStateId) {
        const defaultState = await ctx.db
          .query("issueStates")
          .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
          .order("asc")
          .first();

        if (!defaultState) {
          throw new Error("No issue states found for organization");
        }

        defaultStateId = defaultState._id;
      }

      await ctx.db.insert("issueAssignees", {
        issueId: issue._id,
        assigneeId,
        stateId: defaultStateId,
      });
    }

    return { success: true };
  },
});

/**
 * Add comment to issue
 */
export const addComment = mutation({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and issue
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const issue = await ctx.db
      .query("issues")
      .withIndex("by_key", (q) => q.eq("key", args.issueKey))
      .filter((q) => q.eq(q.field("organizationId"), org._id))
      .first();

    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has permission
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Create comment
    const commentId = await ctx.db.insert("comments", {
      issueId: issue._id,
      authorId: userId,
      body: args.body,
      deleted: false,
    });

    return { commentId };
  },
});

/**
 * List comments for an issue
 */
export const listComments = query({
  args: {
    orgSlug: v.string(),
    issueKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Find organization and issue
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const issue = await ctx.db
      .query("issues")
      .withIndex("by_key", (q) => q.eq("key", args.issueKey))
      .filter((q) => q.eq(q.field("organizationId"), org._id))
      .first();

    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has permission
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied - not a member of this organization");
    }

    // Get comments
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();

    // Get author details for each comment
    const commentsWithAuthors = await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.authorId);
        return {
          ...comment,
          author,
        };
      }),
    );

    return commentsWithAuthors;
  },
});

/**
 * Delete issue
 */
export const deleteIssue = mutation({
  args: {
    issueId: v.id("issues"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    const org = await ctx.db.get(issue.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify user has permission (admin/owner or issue creator)
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    const canDelete =
      membership &&
      (membership.role === "owner" ||
        membership.role === "admin" ||
        issue.reporterId === userId);

    if (!canDelete) {
      throw new Error("Insufficient permissions to delete issue");
    }

    // Delete related data first
    // Delete assignees
    const assignees = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();

    for (const assignee of assignees) {
      await ctx.db.delete(assignee._id);
    }

    // Delete comments
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Finally delete the issue
    await ctx.db.delete(issue._id);

    return { success: true };
  },
});

/**
 * Get assignments for a specific issue
 */
export const getAssignments = query({
  args: {
    issueId: v.id("issues"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Get the issue to verify access
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has access to the organization
    const organization = await ctx.db.get(issue.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Get all assignments for this issue
    const assignments = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    // Get assignee details
    const assigneeIds = assignments
      .map((a) => a.assigneeId)
      .filter((id): id is Id<"users"> => Boolean(id));
    const assignees = await Promise.all(
      assigneeIds.map((id) => ctx.db.get(id)),
    );
    const assigneeMap = new Map(assigneeIds.map((id, i) => [id, assignees[i]]));

    // Get state details
    const stateIds = assignments
      .map((a) => a.stateId)
      .filter((id): id is Id<"issueStates"> => Boolean(id));
    const states = await Promise.all(stateIds.map((id) => ctx.db.get(id)));
    const stateMap = new Map(stateIds.map((id, i) => [id, states[i]]));

    return assignments.map((assignment) => ({
      ...assignment,
      assignee: assignment.assigneeId
        ? assigneeMap.get(assignment.assigneeId)
        : null,
      state: assignment.stateId ? stateMap.get(assignment.stateId) : null,
    }));
  },
});

/**
 * Add assignee to issue
 */
export const addAssignee = mutation({
  args: {
    issueId: v.id("issues"),
    assigneeId: v.id("users"),
    stateId: v.optional(v.id("issueStates")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Get the issue to verify access
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has access to the organization
    const organization = await ctx.db.get(issue.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Check if already assigned
    const existingAssignment = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue_assignee", (q) =>
        q.eq("issueId", args.issueId).eq("assigneeId", args.assigneeId),
      )
      .first();

    if (existingAssignment) {
      throw new Error("User is already assigned to this issue");
    }

    // Get default state if not provided
    let stateId = args.stateId;
    if (!stateId) {
      const defaultState = await ctx.db
        .query("issueStates")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organization._id),
        )
        .order("asc")
        .first();

      if (!defaultState) {
        throw new Error("No issue states found for organization");
      }

      stateId = defaultState._id;
    }

    // Add assignment
    const assignmentId = await ctx.db.insert("issueAssignees", {
      issueId: args.issueId,
      assigneeId: args.assigneeId,
      stateId,
    });

    return { assignmentId };
  },
});

/**
 * Change assignment state
 */
export const changeAssignmentState = mutation({
  args: {
    assignmentId: v.id("issueAssignees"),
    stateId: v.id("issueStates"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Get the assignment
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Get the issue to verify access
    const issue = await ctx.db.get(assignment.issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has access to the organization
    const organization = await ctx.db.get(issue.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Update assignment state
    await ctx.db.patch(args.assignmentId, {
      stateId: args.stateId,
    });

    return { success: true };
  },
});

/**
 * Update assignment assignee
 */
export const updateAssignmentAssignee = mutation({
  args: {
    assignmentId: v.id("issueAssignees"),
    assigneeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Get the assignment
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Get the issue to verify access
    const issue = await ctx.db.get(assignment.issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has access to the organization
    const organization = await ctx.db.get(issue.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Check if the new assignee is already assigned to this issue
    const existingAssignment = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue_assignee", (q) =>
        q.eq("issueId", assignment.issueId).eq("assigneeId", args.assigneeId),
      )
      .first();

    if (existingAssignment && existingAssignment._id !== args.assignmentId) {
      throw new Error("User is already assigned to this issue");
    }

    // Update assignment assignee
    await ctx.db.patch(args.assignmentId, {
      assigneeId: args.assigneeId,
    });

    return { success: true };
  },
});

/**
 * Delete assignment
 */
export const deleteAssignment = mutation({
  args: {
    assignmentId: v.id("issueAssignees"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    // Get the assignment
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    // Get the issue to verify access
    const issue = await ctx.db.get(assignment.issueId);
    if (!issue) {
      throw new Error("Issue not found");
    }

    // Verify user has access to the organization
    const organization = await ctx.db.get(issue.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Delete assignment
    await ctx.db.delete(args.assignmentId);

    return { success: true };
  },
});

export const changePriority = mutation({
  args: {
    issueId: v.id("issues"),
    priorityId: v.id("issuePriorities"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.issueId, { priorityId: args.priorityId });

    await ctx.db.insert("activities", {
      issueId: args.issueId,
      actorId: userId,
      type: "priority_changed",
      payload: { priorityId: args.priorityId },
    });
  },
});

export const updateAssignees = mutation({
  args: {
    issueId: v.id("issues"),
    assigneeIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // This is a simplified implementation. The legacy code has more complex logic
    // for adding/removing assignees. For now, we will just overwrite the assignees.
    const existingAssignments = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    const stateId = existingAssignments[0]?.stateId;

    for (const assignment of existingAssignments) {
      await ctx.db.delete(assignment._id);
    }

    if (!stateId) {
      // If there are no existing assignments, we can't determine the state.
      // This is a simplification and should be handled more gracefully.
      throw new Error(
        "Cannot update assignees for an issue with no existing assignments.",
      );
    }

    for (const assigneeId of args.assigneeIds) {
      await ctx.db.insert("issueAssignees", {
        issueId: args.issueId,
        assigneeId,
        stateId,
      });
    }
  },
});

export const changeTeam = mutation({
  args: {
    issueId: v.id("issues"),
    teamId: v.union(v.id("teams"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.issueId, { teamId: args.teamId ?? undefined });
  },
});

export const changeProject = mutation({
  args: {
    issueId: v.id("issues"),
    projectId: v.union(v.id("projects"), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.issueId, {
      projectId: args.projectId ?? undefined,
    });
  },
});

export const updateTitle = mutation({
  args: {
    issueId: v.id("issues"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.issueId, { title: args.title });

    await ctx.db.insert("activities", {
      issueId: args.issueId,
      actorId: userId,
      type: "title_changed",
      payload: { title: args.title },
    });
  },
});

export const updateDescription = mutation({
  args: {
    issueId: v.id("issues"),
    description: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.issueId, {
      description: args.description ?? undefined,
    });

    await ctx.db.insert("activities", {
      issueId: args.issueId,
      actorId: userId,
      type: "description_changed",
    });
  },
});

export const updateEstimatedTimes = mutation({
  args: {
    issueId: v.id("issues"),
    estimatedTimes: v.union(v.object({}), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.issueId, {
      estimatedTimes: args.estimatedTimes ?? undefined,
    });

    await ctx.db.insert("activities", {
      issueId: args.issueId,
      actorId: userId,
      type: "estimated_times_changed",
      payload: { estimatedTimes: args.estimatedTimes },
    });
  },
});

export const listIssues = query({
  args: {
    orgSlug: v.string(),
    projectId: v.optional(v.string()),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .first();

    if (!org) {
      throw new Error("Organization not found");
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", org._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    let issuesQuery = ctx.db
      .query("issues")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id));

    if (args.projectId) {
      const project = await ctx.db
        .query("projects")
        .withIndex("by_org_key", (q) =>
          q.eq("organizationId", org._id).eq("key", args.projectId!),
        )
        .first();
      if (project) {
        issuesQuery = issuesQuery.filter((q) =>
          q.eq(q.field("projectId"), project._id),
        );
      }
    }

    if (args.teamId) {
      const team = await ctx.db
        .query("teams")
        .withIndex("by_org_key", (q) =>
          q.eq("organizationId", org._id).eq("key", args.teamId!),
        )
        .first();
      if (team) {
        issuesQuery = issuesQuery.filter((q) =>
          q.eq(q.field("teamId"), team._id),
        );
      }
    }

    const issues = await issuesQuery.order("desc").collect();

    const issuesWithDetails = await Promise.all(
      issues.map(async (issue) => {
        const priority = issue.priorityId
          ? await ctx.db.get(issue.priorityId)
          : null;
        const project = issue.projectId
          ? await ctx.db.get(issue.projectId)
          : null;
        const team = issue.teamId ? await ctx.db.get(issue.teamId) : null;
        const reporter = issue.reporterId
          ? await ctx.db.get(issue.reporterId)
          : null;

        const assignments = await ctx.db
          .query("issueAssignees")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .collect();

        const assignees = await Promise.all(
          assignments.map(async (assignment) => {
            const assignee = assignment.assigneeId
              ? await ctx.db.get(assignment.assigneeId)
              : null;
            const state = assignment.stateId
              ? await ctx.db.get(assignment.stateId)
              : null;
            return {
              assignmentId: assignment._id,
              assigneeId: assignee?._id,
              assigneeName: assignee?.name,
              assigneeEmail: assignee?.email,
              stateId: state?._id,
              stateName: state?.name,
              stateIcon: state?.icon,
              stateColor: state?.color,
              stateType: state?.type,
            };
          }),
        );

        return {
          ...issue,
          id: issue._id,
          updatedAt: issue._creationTime,
          priorityId: priority?._id,
          priorityName: priority?.name,
          priorityIcon: priority?.icon,
          priorityColor: priority?.color,
          projectKey: project?.key,
          teamKey: team?.key,
          reporterName: reporter?.name,
          assignments:
            assignees.length > 0
              ? assignees
              : [
                  {
                    assignmentId: "unassigned",
                    assigneeId: undefined,
                    assigneeName: null,
                    assigneeEmail: null,
                    stateId: undefined,
                    stateName: null,
                    stateIcon: null,
                    stateColor: null,
                    stateType: null,
                  },
                ], // Ensure at least one empty assignment for structure
        };
      }),
    );

    const flattenedIssues = issuesWithDetails.flatMap((issue) =>
      issue.assignments.map((assignment) => ({
        ...issue,
        ...assignment,
      })),
    );

    const allStates = await ctx.db
      .query("issueStates")
      .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
      .collect();

    const counts = allStates.reduce(
      (acc, state) => {
        acc[state.type] = 0;
        return acc;
      },
      {} as Record<string, number>,
    );
    let total = 0;

    issuesWithDetails.forEach((issue) => {
      total++;
      const uniqueStates = new Set(
        issue.assignments.map((a) => a.stateType).filter(Boolean),
      );
      uniqueStates.forEach((stateType) => {
        if (stateType) {
          counts[stateType] = (counts[stateType] || 0) + 1;
        }
      });
    });

    return {
      issues: flattenedIssues.filter((issue) => issue.id !== "unassigned"), // Filter out empty assignments
      total,
      counts,
    };
  },
});
