# Convex Function Patterns

This document outlines the recommended patterns and best practices for implementing Convex functions, with a focus on type safety and maintainability.

## Function Types Overview

### 1. **Query Functions** (`query`)

- Read-only operations
- Can access database and other queries
- Cannot modify data
- Can be called from client and other functions

### 2. **Mutation Functions** (`mutation`)

- Data modification operations
- Can access database and other queries
- Can modify data
- Can be called from client and actions

### 3. **Action Functions** (`action`)

- External side effects (emails, webhooks, file storage)
- Can call external APIs
- Cannot directly access database
- Can call queries and mutations via `ctx.runQuery` and `ctx.runMutation`

### 4. **Internal Functions** (`internalQuery`/`internalMutation`)

- Can only be called from actions
- Used for code reuse within actions
- Cannot be called directly from client

## Type Safety Guidelines

### 🚨 **CRITICAL: ZERO TYPE WORKAROUNDS**

**NEVER use these patterns:**

```typescript
// ❌ FORBIDDEN - Type assertions
const userId = args.userId as string;
const user = result as User;

// ❌ FORBIDDEN - Non-null assertions
const user = getUser()!;
const name = user.name!;

// ❌ FORBIDDEN - Any types
const data: any = getData();
const result = processData(data as any);

// ❌ FORBIDDEN - Type workarounds
const id = value as unknown as Id<"users">;
```

**ALWAYS use proper typing:**

```typescript
// ✅ CORRECT - Proper type handling
const userId = args.userId; // Already typed from schema
const user = await ctx.db.get(userId); // Returns proper type

// ✅ CORRECT - Null checking
const user = await getUser();
if (!user) throw new Error("User not found");
const name = user.name;

// ✅ CORRECT - Proper validation
const data = validateData(input);
const result = processData(data);
```

## Function Implementation Patterns

### Query Functions

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getOrganization = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    // Get organization by slug
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!organization) {
      throw new Error("Organization not found");
    }

    return organization;
  },
});
```

### Mutation Functions

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate input
    if (!args.name.trim()) {
      throw new Error("Organization name is required");
    }

    // Check for existing organization
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      throw new Error("Organization with this slug already exists");
    }

    // Create organization
    const organizationId = await ctx.db.insert("organizations", {
      name: args.name,
      slug: args.slug,
    });

    return { id: organizationId };
  },
});
```

### Action Functions

```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendInvitationEmail = action({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    // Get organization details
    const organization = await ctx.runQuery(internal.organizations.getById, {
      id: args.organizationId,
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    // Send email (external side effect)
    await sendEmail({
      to: args.email,
      subject: `Invitation to join ${organization.name}`,
      template: "invitation",
      data: { organization, role: args.role },
    });

    // Create invitation record
    await ctx.runMutation(internal.invitations.create, {
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
    });
  },
});
```

## Authentication Patterns

### Getting Current User

```typescript
import { getAuthUserId } from "@convex-dev/auth/server";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    return user;
  },
});
```

### Organization Access Pattern

```typescript
export const getOrganizationWithAccess = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Get organization
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!organization) {
      throw new Error("Organization not found");
    }

    // Check membership
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    return {
      organization,
      membership,
    };
  },
});
```

## Error Handling Patterns

### Consistent Error Messages

```typescript
// ✅ GOOD - Clear, actionable error messages
throw new Error("Organization not found");
throw new Error(
  "Access denied: You don't have permission to view this project",
);
throw new Error("Invalid input: Project name must be at least 3 characters");

// ❌ BAD - Vague error messages
throw new Error("Error");
throw new Error("Something went wrong");
throw new Error("Invalid");
```

### Error Propagation

```typescript
export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Validate input
      if (!args.name.trim()) {
        throw new Error("Project name is required");
      }

      // Get project
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      // Check permissions
      const userId = await getAuthUserId(ctx);
      if (!userId) {
        throw new Error("Unauthorized");
      }

      // Update project
      await ctx.db.patch(args.projectId, {
        name: args.name.trim(),
      });

      return { success: true };
    } catch (error) {
      // Re-throw with context
      throw new Error(`Failed to update project: ${error.message}`);
    }
  },
});
```

## Pagination Patterns

### Cursor-Based Pagination

```typescript
export const listProjects = query({
  args: {
    organizationId: v.id("organizations"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const cursor = args.cursor ? JSON.parse(args.cursor) : null;

    let query = ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc");

    if (cursor) {
      query = query.paginate(cursor);
    }

    const results = await query.take(limit);

    return {
      projects: results.page,
      nextCursor: results.continueCursor,
    };
  },
});
```

## Permission Checking Patterns

### Direct Permission Implementation

```typescript
export const deleteProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Get project
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Check organization membership
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new Error("Access denied");
    }

    // Check if user is admin or project lead
    if (membership.role !== "admin" && project.leadId !== userId) {
      throw new Error("Insufficient permissions");
    }

    // Delete project
    await ctx.db.delete(args.projectId);

    return { success: true };
  },
});
```

## Schema-Driven Types

### Using Schema Types

```typescript
import { Doc, Id } from "./_generated/dataModel";

// ✅ CORRECT - Use schema types
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"users">> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updatedUser = await ctx.db.patch(args.userId, {
      name: args.name,
    });

    return updatedUser;
  },
});
```

## Performance Patterns

### Efficient Queries

```typescript
// ✅ GOOD - Use indexes for efficient queries
export const getProjectsByTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
  },
});

// ❌ BAD - Inefficient query without index
export const getProjectsByTeamBad = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db.query("projects").collect();
    return allProjects.filter((p) => p.teamId === args.teamId);
  },
});
```

### Batch Operations

```typescript
export const bulkUpdateIssues = mutation({
  args: {
    issueIds: v.array(v.id("issues")),
    statusId: v.id("issueStates"),
  },
  handler: async (ctx, args) => {
    const updates = args.issueIds.map((id) =>
      ctx.db.patch(id, { statusId: args.statusId }),
    );

    await Promise.all(updates);

    return { updated: args.issueIds.length };
  },
});
```

## Testing Patterns

### Function Testing

```typescript
// Example test structure
describe("organizations", () => {
  describe("queries", () => {
    it("should get organization by slug", async () => {
      // Test implementation
    });
  });

  describe("mutations", () => {
    it("should create organization", async () => {
      // Test implementation
    });
  });
});
```

## Common Anti-Patterns to Avoid

### 1. **Helper Functions in Convex**

```typescript
// ❌ BAD - Don't create regular async helper functions
async function checkPermission(ctx, userId, organizationId) {
  // Implementation
}

// ✅ GOOD - Implement logic directly in each function
export const someFunction = query({
  args: {
    /* ... */
  },
  handler: async (ctx, args) => {
    // Implement permission logic directly here
  },
});
```

### 2. **Internal Function Misuse**

```typescript
// ❌ BAD - Don't try to call internal functions from queries/mutations
const result = await ctx.runQuery(internal.someFunction, args);

// ✅ GOOD - Internal functions only work in actions
export const someAction = action({
  args: {
    /* ... */
  },
  handler: async (ctx, args) => {
    const result = await ctx.runQuery(internal.someFunction, args);
  },
});
```

### 3. **Type Assertions**

```typescript
// ❌ BAD - Don't use type assertions
const userId = args.userId as Id<"users">;

// ✅ GOOD - Use proper validation
const userId = args.userId; // Already typed from schema
```

## Migration Checklist

- [ ] Review all existing functions for type safety
- [ ] Remove any type assertions or `any` types
- [ ] Implement proper error handling
- [ ] Add authentication checks where needed
- [ ] Optimize queries with proper indexes
- [ ] Test all functions thoroughly
- [ ] Update documentation

This guide provides the foundation for writing maintainable, type-safe Convex functions that scale with your application.
