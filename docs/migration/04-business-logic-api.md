# Phase 4: Business Logic & API

## Overview

This phase maps tRPC routers to Convex functions, implementing CRUD operations for all domains with advanced features like pagination, filtering, and permissions.

## Implementation Tasks

| #   | Task                                                                                           | Status |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| 4.1 | **Organize Convex folder structure** – Create domain folders and split files by function type. | 🔄     |
| 4.2 | **Map tRPC user router** – Implement user queries, mutations, and admin bootstrap.             | ❌     |
| 4.3 | **Map tRPC organization router** – Implement org CRUD, member management, invitations.         | ❌     |
| 4.4 | **Map tRPC project router** – Implement project management with team assignments.              | ❌     |
| 4.5 | **Map tRPC team router** – Implement team CRUD and member management.                          | ❌     |
| 4.6 | **Map tRPC issue router** – Implement issue tracking with states, priorities, assignments.     | ❌     |
| 4.7 | **Map tRPC role router** – Implement custom role management and permissions.                   | ❌     |
| 4.8 | **Add pagination, filtering, and search** – Implement advanced query features.                 | ❌     |
| 4.9 | **Test all endpoints** – Verify functionality matches tRPC implementation.                     | ❌     |

## Current Status: 🔄 IN PROGRESS

### 4.1 Convex Folder Organization 🔄

**Task:** Organize the current flat structure into domain-driven folders with function type separation.

**Current Structure:**

```
/convex/
├── _generated/          # Auto-generated (DO NOT EDIT)
├── _shared/             # Shared utilities
│   ├── auth.ts         # Auth helpers
│   ├── pagination.ts   # Pagination utilities
│   └── validation.ts   # Validation helpers
├── auth.ts             # Auth configuration
├── http.ts             # HTTP router
├── hello.ts            # Example function
├── issues.ts           # Issue functions (all types mixed)
├── organizations.ts    # Organization functions (all types mixed)
├── projects.ts         # Project functions (all types mixed)
├── roles.ts            # Role functions (all types mixed)
├── teams.ts            # Team functions (all types mixed)
├── users.ts            # User functions (all types mixed)
└── schema.ts           # Database schema
```

**Target Structure:**

```
/convex/
├── _generated/          # Auto-generated (DO NOT EDIT)
├── _shared/             # Shared utilities
│   ├── auth.ts         # Auth helpers
│   ├── pagination.ts   # Pagination utilities
│   ├── validation.ts   # Validation helpers
│   ├── permissions.ts  # Permission checking
│   └── filters.ts      # Search and filtering
├── auth/               # Authentication domain
│   ├── auth.ts        # Auth configuration
│   ├── http.ts        # HTTP router
│   └── users.ts       # User management
├── organizations/      # Organization domain
│   ├── queries.ts     # Organization queries
│   ├── mutations.ts   # Organization mutations
│   └── actions.ts     # Organization actions
├── projects/          # Project domain
│   ├── queries.ts     # Project queries
│   ├── mutations.ts   # Project mutations
│   └── actions.ts     # Project actions
├── teams/             # Team domain
│   ├── queries.ts     # Team queries
│   ├── mutations.ts   # Team mutations
│   └── actions.ts     # Team actions
├── issues/            # Issue domain
│   ├── queries.ts     # Issue queries
│   ├── mutations.ts   # Issue mutations
│   └── actions.ts     # Issue actions
├── roles/             # Role domain
│   ├── queries.ts     # Role queries
│   ├── mutations.ts   # Role mutations
│   └── actions.ts     # Role actions
├── users/             # User domain
│   ├── queries.ts     # User queries
│   ├── mutations.ts   # User mutations
│   └── actions.ts     # User actions
├── actions/           # External side effects
│   ├── notifications.ts # Email notifications
│   ├── files.ts       # File handling
│   └── webhooks.ts    # External integrations
├── schema.ts          # Database schema
└── hello.ts           # Example function
```

**Implementation Steps:**

1. **Create Domain Folders:**

   ```bash
   mkdir -p convex/{auth,organizations,projects,teams,issues,roles,users,actions}
   ```

2. **Split Existing Files by Function Type:**

   - Move query functions to `queries.ts`
   - Move mutation functions to `mutations.ts`
   - Move action functions to `actions.ts`

3. **Update Imports:**

   - Update all frontend imports to new file locations
   - Update internal function references
   - Update generated type imports

4. **Add Missing Shared Utilities:**
   - Create `_shared/permissions.ts` for permission checking
   - Create `_shared/filters.ts` for search and filtering
   - Consolidate common patterns

## tRPC to Convex Mapping

### User Router Mapping

**Current tRPC (`src/trpc/routers/user.router.ts`):**

```typescript
export const userRouter = createTRPCRouter({
  bootstrapAdmin: publicProcedure.mutation(...),
  getCurrentUser: protectedProcedure.query(...),
  updateProfile: protectedProcedure.mutation(...),
  // ... more procedures
});
```

**Target Convex Structure:**

```typescript
// convex/users/queries.ts
export const getCurrentUser = query({...});
export const getUserById = query({...});

// convex/users/mutations.ts
export const bootstrapAdmin = mutation({...});
export const updateProfile = mutation({...});

// convex/users/actions.ts
export const sendWelcomeEmail = action({...});
```

### Organization Router Mapping

**Current tRPC (`src/trpc/routers/organization.router.ts`):**

```typescript
export const organizationRouter = createTRPCRouter({
  create: protectedProcedure.mutation(...),
  getBySlug: protectedProcedure.query(...),
  update: protectedProcedure.mutation(...),
  inviteMember: protectedProcedure.mutation(...),
  // ... more procedures
});
```

**Target Convex Structure:**

```typescript
// convex/organizations/queries.ts
export const getBySlug = query({...});
export const listOrganizations = query({...});

// convex/organizations/mutations.ts
export const create = mutation({...});
export const update = mutation({...});
export const inviteMember = mutation({...});

// convex/organizations/actions.ts
export const sendInvitationEmail = action({...});
```

## Implementation Patterns

### 1. **Query Functions**

```typescript
// convex/organizations/queries.ts
export const getOrganizationBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!organization) throw new Error("Organization not found");

    // Check membership
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", organization._id).eq("userId", userId),
      )
      .first();

    if (!membership) throw new Error("Access denied");

    return { organization, membership };
  },
});
```

### 2. **Mutation Functions**

```typescript
// convex/organizations/mutations.ts
export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Validate input
    if (!args.name.trim()) throw new Error("Organization name is required");

    // Check for existing organization
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) throw new Error("Organization with this slug already exists");

    // Create organization
    const organizationId = await ctx.db.insert("organizations", {
      name: args.name.trim(),
      slug: args.slug,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add user as admin
    await ctx.db.insert("members", {
      organizationId,
      userId,
      role: "admin",
      joinedAt: Date.now(),
    });

    return { id: organizationId };
  },
});
```

### 3. **Action Functions**

```typescript
// convex/organizations/actions.ts
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

    if (!organization) throw new Error("Organization not found");

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

## Advanced Features

### 1. **Pagination**

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

### 2. **Filtering and Search**

```typescript
export const searchIssues = query({
  args: {
    organizationId: v.id("organizations"),
    search: v.optional(v.string()),
    statusId: v.optional(v.id("issueStates")),
    priorityId: v.optional(v.id("issuePriorities")),
    assigneeId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("issues")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      );

    // Apply filters
    if (args.statusId) {
      query = query.filter((q) => q.eq(q.field("statusId"), args.statusId));
    }

    if (args.priorityId) {
      query = query.filter((q) => q.eq(q.field("priorityId"), args.priorityId));
    }

    if (args.assigneeId) {
      query = query.filter((q) => q.eq(q.field("assigneeId"), args.assigneeId));
    }

    const issues = await query.collect();

    // Apply search filter (client-side for now)
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      return issues.filter(
        (issue) =>
          issue.title.toLowerCase().includes(searchLower) ||
          issue.description?.toLowerCase().includes(searchLower),
      );
    }

    return issues;
  },
});
```

### 3. **Permission Checking**

```typescript
// convex/_shared/permissions.ts
export const checkOrganizationAccess = async (
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");

  const membership = await ctx.db
    .query("members")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .first();

  if (!membership) throw new Error("Access denied");

  return { userId, membership };
};
```

## Testing Strategy

### 1. **Unit Tests**

- Test each function individually
- Mock dependencies where needed
- Verify input validation
- Test error conditions

### 2. **Integration Tests**

- Test complete workflows
- Verify data consistency
- Test permission boundaries
- Test real-time updates

### 3. **Performance Tests**

- Test query performance
- Verify index usage
- Test pagination efficiency
- Monitor real-time subscription performance

## Migration Checklist

### Phase 4.1: Folder Organization 🔄

- [ ] Create domain folders
- [ ] Split existing files by function type
- [ ] Update all imports
- [ ] Add missing shared utilities
- [ ] Test folder structure

### Phase 4.2-4.7: Router Migration ❌

- [ ] Map user router
- [ ] Map organization router
- [ ] Map project router
- [ ] Map team router
- [ ] Map issue router
- [ ] Map role router

### Phase 4.8: Advanced Features ❌

- [ ] Implement pagination
- [ ] Add filtering and search
- [ ] Add permission checking
- [ ] Add error handling

### Phase 4.9: Testing ❌

- [ ] Test all endpoints
- [ ] Verify functionality parity
- [ ] Performance testing
- [ ] Security testing

## Next Steps

1. **Complete folder organization** (Phase 4.1)
2. **Implement router migrations** (Phase 4.2-4.7)
3. **Add advanced features** (Phase 4.8)
4. **Comprehensive testing** (Phase 4.9)

The business logic migration will provide complete API parity with the existing tRPC implementation while leveraging Convex's strengths.
