# Phase 6: Middleware & Permissions

## Overview

This phase ports the permission system to Convex, updating middleware and access controls to work with the new architecture.

## Implementation Tasks

| #   | Task                                                                                                                                        | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 6.1 | **Research Convex permission patterns** – Google "Convex permissions 2024", "Convex RBAC patterns", "Convex access control best practices". | ❌     |
| 6.2 | **Implement permission checking functions** – Create reusable permission validation functions.                                              | ❌     |
| 6.3 | **Update middleware patterns** – Replace tRPC middleware with Convex permission checks.                                                     | ❌     |
| 6.4 | **Implement role-based access control** – Port custom role system to Convex functions.                                                      | ❌     |
| 6.5 | **Add organization-scoped permissions** – Ensure all operations respect organization boundaries.                                            | ❌     |
| 6.6 | **Test permission system** – Verify all access controls work correctly.                                                                     | ❌     |

## Current Status: ❌ PENDING

### 6.1 Convex Permission Research ❌

**Task:** Research current Convex permission implementation patterns and best practices.

**Research Areas:**

- Convex permission checking patterns
- Role-based access control (RBAC) implementation
- Organization-scoped permissions
- Middleware replacement strategies
- Security best practices

**Expected Findings:**

- Permission checking via helper functions
- Organization-based data isolation
- Role-based function access
- Security through data layer validation

### 6.2 Permission Checking Functions ❌

**Target Implementation:**

```typescript
// convex/_shared/permissions.ts
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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

export const checkProjectAccess = async (
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");

  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");

  const membership = await ctx.db
    .query("members")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", project.organizationId).eq("userId", userId),
    )
    .first();

  if (!membership) throw new Error("Access denied");

  return { userId, membership, project };
};

export const checkAdminAccess = async (
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
) => {
  const { membership } = await checkOrganizationAccess(ctx, organizationId);

  if (membership.role !== "admin") {
    throw new Error("Admin access required");
  }

  return { membership };
};

export const checkCustomPermission = async (
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  permission: string,
) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");

  // Check custom role permissions
  const roleAssignments = await ctx.db
    .query("orgRoleAssignments")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("organizationId", organizationId),
    )
    .collect();

  for (const assignment of roleAssignments) {
    const permissions = await ctx.db
      .query("orgRolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", assignment.roleId))
      .collect();

    if (permissions.some((p) => p.permission === permission)) {
      return true;
    }
  }

  throw new Error(`Permission denied: ${permission}`);
};
```

### 6.3 Middleware Pattern Updates ❌

**Current tRPC Middleware (`src/trpc/init.ts`):**

```typescript
// Current tRPC middleware
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;
  const session = await auth.api.getSession({ req, res });

  return {
    session,
    db,
    auth,
  };
};

export const createTRPCMiddleware = <TInput, TOutput>(
  middleware: MiddlewareFunction<TInput, TOutput>,
) => {
  return middleware;
};

export const protectedProcedure = t.procedure.use(
  createTRPCMiddleware(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.session.user,
      },
    });
  }),
);
```

**Target Convex Implementation:**

```typescript
// Convex permission checking (no middleware needed)
export const getOrganizationData = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Permission check built into function
    const { userId, membership } = await checkOrganizationAccess(
      ctx,
      args.organizationId,
    );

    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("Organization not found");

    return { organization, membership };
  },
});
```

### 6.4 Role-Based Access Control ❌

**Custom Role System Implementation:**

```typescript
// convex/roles/mutations.ts
export const createRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check admin access
    await checkAdminAccess(ctx, args.organizationId);

    // Create role
    const roleId = await ctx.db.insert("orgRoles", {
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      isSystem: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add permissions
    for (const permission of args.permissions) {
      await ctx.db.insert("orgRolePermissions", {
        roleId,
        permission,
        createdAt: Date.now(),
      });
    }

    return { id: roleId };
  },
});

export const assignRole = mutation({
  args: {
    roleId: v.id("orgRoles"),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Check admin access
    await checkAdminAccess(ctx, args.organizationId);

    // Check if user is member
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .first();

    if (!membership)
      throw new Error("User is not a member of this organization");

    // Assign role
    await ctx.db.insert("orgRoleAssignments", {
      roleId: args.roleId,
      userId: args.userId,
      organizationId: args.organizationId,
      assignedAt: Date.now(),
    });

    return { success: true };
  },
});
```

### 6.5 Organization-Scoped Permissions ❌

**Data Isolation Patterns:**

```typescript
// All queries filter by organization
export const listProjects = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Permission check
    await checkOrganizationAccess(ctx, args.organizationId);

    // Organization-scoped query
    return await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
  },
});

// All mutations verify organization access
export const createProject = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    // Permission check
    await checkOrganizationAccess(ctx, args.organizationId);

    // Create project in organization
    const projectId = await ctx.db.insert("projects", {
      organizationId: args.organizationId,
      name: args.name,
      key: args.key,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { id: projectId };
  },
});
```

## Implementation Strategy

### Phase 6.1: Research and Planning ❌

- [ ] Research Convex permission patterns
- [ ] Document current permission system
- [ ] Plan migration strategy
- [ ] Design permission checking functions

### Phase 6.2: Core Permission Functions ❌

- [ ] Implement organization access checking
- [ ] Implement project access checking
- [ ] Implement admin access checking
- [ ] Implement custom permission checking

### Phase 6.3: Role Management ❌

- [ ] Implement role creation
- [ ] Implement role assignment
- [ ] Implement permission management
- [ ] Implement role queries

### Phase 6.4: Function Updates ❌

- [ ] Update all queries with permission checks
- [ ] Update all mutations with permission checks
- [ ] Update all actions with permission checks
- [ ] Test permission boundaries

### Phase 6.5: Testing ❌

- [ ] Test organization access controls
- [ ] Test project access controls
- [ ] Test admin permissions
- [ ] Test custom role permissions

## Key Considerations

### 1. **Security Model**

- Organization-based data isolation
- Role-based function access
- Permission-based operations
- Audit trail requirements

### 2. **Performance Impact**

- Permission checking overhead
- Query optimization with permissions
- Caching permission results
- Real-time permission updates

### 3. **Complexity Management**

- Reusable permission functions
- Clear permission patterns
- Consistent error messages
- Comprehensive testing

### 4. **Migration Strategy**

- Gradual permission implementation
- Backward compatibility
- Testing at each step
- Rollback procedures

## Migration Benefits

### 1. **Simplified Security**

- Built-in permission checking
- Organization-scoped data access
- Role-based function access
- Reduced security complexity

### 2. **Better Performance**

- Optimized permission queries
- Reduced middleware overhead
- Efficient permission caching
- Real-time permission updates

### 3. **Enhanced Security**

- Data-layer permission enforcement
- Organization boundary enforcement
- Role-based access control
- Comprehensive audit trails

## Next Steps

1. **Complete research** (Phase 6.1)
2. **Implement core functions** (Phase 6.2)
3. **Add role management** (Phase 6.3)
4. **Update all functions** (Phase 6.4)
5. **Comprehensive testing** (Phase 6.5)

The permission system migration will provide robust access control while simplifying the security architecture.
