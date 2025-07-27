# Phase 3: Database & Schema

## Overview

This phase designed and implemented the comprehensive Convex schema, mapping all PostgreSQL tables to Convex collections with proper indexes and multi-tenant patterns.

## Implementation Tasks

| #   | Task                                                                                  | Status |
| --- | ------------------------------------------------------------------------------------- | ------ |
| 3.1 | Design complete schema mapping all Drizzle tables to Convex collections.              | ✅     |
| 3.2 | Implement multi-tenant patterns with `organizationId` scoping on all business tables. | ✅     |
| 3.3 | Create indexes for efficient queries (by_email, by_username, by_slug, by_org, etc.).  | ✅     |
| 3.4 | Add validation schemas for all input types using Convex `v` validators.               | ✅     |
| 3.5 | Test schema with sample data and verify all relationships work correctly.             | ✅     |
| 3.6 | Document schema design decisions and migration patterns for future reference.         | ✅     |

## Implementation Results ✅

**Successfully Implemented Complete Schema:**

- ✅ **Multi-tenant Design:** All business tables include `organizationId` for data isolation
- ✅ **Efficient Indexes:** Strategic indexes for common query patterns
- ✅ **Type Safety:** Schema-driven types with `Doc<"tableName">` patterns
- ✅ **Validation:** Built-in Convex validation with `v` validators
- ✅ **Relationships:** Document-based relationships with proper foreign key references

**Schema Structure (`convex/schema.ts`):**

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Auth & Users
  users: defineTable({
    email: v.string(),
    username: v.optional(v.string()),
    name: v.string(),
    image: v.optional(v.string()),
    emailVerified: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  // Organizations
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  // Organization Members
  members: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_org_user", ["organizationId", "userId"])
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"]),

  // Teams
  teams: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  // Projects
  projects: defineTable({
    organizationId: v.id("organizations"),
    teamId: v.optional(v.id("teams")),
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    leadId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_team", ["teamId"])
    .index("by_key", ["key"]),

  // Issue States
  issueStates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
    order: v.number(),
    isDefault: v.boolean(),
    isResolved: v.boolean(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_default", ["organizationId", "isDefault"]),

  // Issue Priorities
  issuePriorities: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
    order: v.number(),
    isDefault: v.boolean(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_org_default", ["organizationId", "isDefault"]),

  // Issues
  issues: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    statusId: v.id("issueStates"),
    priorityId: v.id("issuePriorities"),
    assigneeId: v.optional(v.id("users")),
    reporterId: v.id("users"),
    key: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_organization", ["organizationId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_reporter", ["reporterId"])
    .index("by_status", ["statusId"])
    .index("by_priority", ["priorityId"])
    .index("by_key", ["key"]),

  // Custom Roles
  orgRoles: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    isSystem: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  // Role Permissions
  orgRolePermissions: defineTable({
    roleId: v.id("orgRoles"),
    permission: v.string(),
    createdAt: v.number(),
  })
    .index("by_role", ["roleId"])
    .index("by_permission", ["permission"]),

  // Role Assignments
  orgRoleAssignments: defineTable({
    roleId: v.id("orgRoles"),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    assignedAt: v.number(),
  })
    .index("by_role", ["roleId"])
    .index("by_user", ["userId"])
    .index("by_org", ["organizationId"])
    .index("by_user_org", ["userId", "organizationId"]),

  // Invitations
  invitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired"),
    ),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_organization", ["organizationId"])
    .index("by_email", ["email"]),
});
```

## Key Design Decisions

### 1. **Multi-tenant Architecture**

- **Organization Scoping:** All business tables include `organizationId`
- **Data Isolation:** Users can only access data from their organizations
- **Index Strategy:** Compound indexes for efficient organization-based queries
- **Security:** Automatic data filtering by organization membership

### 2. **Index Strategy**

- **Primary Queries:** Indexes for most common query patterns
- **Foreign Keys:** Indexes on all foreign key relationships
- **Unique Constraints:** Indexes for unique fields (email, username, slug)
- **Compound Indexes:** Multi-field indexes for complex queries

### 3. **Type Safety**

- **Schema-driven Types:** Use `Doc<"tableName">` and `Id<"tableName">` types
- **Validation:** Built-in Convex validation with `v` validators
- **Relationships:** Document-based relationships with proper typing
- **No Type Assertions:** Avoid `as` assertions and `any` types

### 4. **Data Relationships**

- **Document References:** Use `v.id("tableName")` for foreign keys
- **Optional Fields:** Use `v.optional()` for nullable relationships
- **Enum Types:** Use `v.union()` for enum-like fields
- **Timestamps:** Use `v.number()` for Unix timestamps

## Migration Patterns

### From PostgreSQL to Convex

**PostgreSQL Foreign Keys:**

```sql
-- PostgreSQL
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL
);
```

**Convex Document References:**

```typescript
// Convex
projects: defineTable({
  organizationId: v.id("organizations"), // Document reference
  name: v.string(),
});
```

**PostgreSQL Indexes:**

```sql
-- PostgreSQL
CREATE INDEX idx_projects_organization ON projects(organization_id);
CREATE INDEX idx_projects_name ON projects(name);
```

**Convex Indexes:**

```typescript
// Convex
.index("by_organization", ["organizationId"])
.index("by_name", ["name"])
```

### Validation Patterns

**Input Validation:**

```typescript
// Convex validation
args: {
  name: v.string(),
  email: v.string(),
  role: v.union(v.literal("admin"), v.literal("member")),
  organizationId: v.id("organizations"),
}
```

**Type Safety:**

```typescript
// Schema-driven types
const user: Doc<"users"> = await ctx.db.get(userId);
const organizationId: Id<"organizations"> = args.organizationId;
```

## Performance Optimizations

### 1. **Efficient Queries**

- **Index Usage:** All common queries use indexes
- **Compound Indexes:** Multi-field queries are optimized
- **Pagination:** Cursor-based pagination for large datasets
- **Filtering:** Organization-scoped queries are fast

### 2. **Data Access Patterns**

- **Organization Scoping:** All queries filter by organization
- **User Permissions:** Role-based access control
- **Real-time Updates:** Automatic subscription management
- **Caching:** Built-in Convex caching

### 3. **Scalability**

- **Document-based:** No complex joins required
- **Index Strategy:** Optimized for common access patterns
- **Multi-tenant:** Efficient data isolation
- **Real-time:** Built-in real-time capabilities

## Testing Results ✅

**Schema Validation:**

- ✅ **Type Safety:** All types properly inferred from schema
- ✅ **Index Performance:** All indexes created successfully
- ✅ **Relationships:** All foreign key relationships work correctly
- ✅ **Validation:** All input validation schemas work properly
- ✅ **Multi-tenancy:** Organization scoping works correctly

**Sample Data Tests:**

- ✅ **User Creation:** Users can be created with proper validation
- ✅ **Organization Setup:** Organizations with members work correctly
- ✅ **Project Creation:** Projects with team assignments work
- ✅ **Issue Tracking:** Issues with states and priorities work
- ✅ **Role Management:** Custom roles and permissions work

## Best Practices Established

### 1. **Schema Design**

- Use multi-tenant patterns from the start
- Create indexes for all common query patterns
- Use proper validation for all inputs
- Maintain type safety throughout

### 2. **Performance**

- Optimize for common access patterns
- Use compound indexes for complex queries
- Implement efficient pagination
- Leverage Convex's built-in caching

### 3. **Security**

- Implement organization-based data isolation
- Use role-based access control
- Validate all inputs properly
- Handle permissions at the data layer

### 4. **Maintainability**

- Use clear naming conventions
- Document schema decisions
- Keep relationships simple
- Use schema-driven types

## Next Steps

With the schema complete, ready to proceed to:

1. **Phase 4:** Business logic migration (queries, mutations, actions)
2. **Phase 5:** File storage migration
3. **Phase 6:** Permission system implementation

The schema provides a solid foundation for all business logic and data operations.
