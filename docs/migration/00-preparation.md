# Phase 0: Preparation

## Overview

This phase involved comprehensive research and analysis of the current system architecture and Convex best practices to establish a solid foundation for the migration.

## Research Tasks

| #   | Task                                                                                                                                                                                   | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0.1 | **Research Convex Auth Patterns** – Google "Convex auth Next.js 2024", "Convex custom auth providers", "Convex session management" to understand current auth implementation patterns. | ✅     |
| 0.2 | **Research Convex Schema Design** – Google "Convex schema relationships", "Convex document database design patterns", "Convex indexes best practices" for multi-tenant SaaS apps.      | ✅     |
| 0.3 | **Research Convex File Storage** – Google "Convex file storage 2024", "Convex storage migration from S3", "Convex file upload patterns" to understand current implementation.          | ✅     |
| 0.4 | **Map Current Better-Auth Implementation** – Document exact auth flows in `src/auth/auth.ts`, session handling, organization plugin usage, and admin role patterns.                    | ✅     |
| 0.5 | **Map Current Database Schema** – Document all Drizzle tables in `src/db/schema/*`, their relationships, indexes, and foreign key constraints for Convex schema design.                | ✅     |
| 0.6 | **Map Current tRPC Endpoints** – Document all procedures in `src/trpc/routers/*`, their input/output types, and business logic for Convex function mapping.                            | ✅     |
| 0.7 | **Map Current S3 Usage** – Document file upload/download patterns in `src/lib/s3.ts` and `src/app/api/files/[...key]/route.ts` for Convex storage migration.                           | ✅     |

## Research Findings

### 0.1 Convex Auth Patterns Research ✅

**Key Findings:**

- **Primary Recommendation:** Use built-in Convex Auth with Google OAuth + magic email links
- **Alternative Options:** Auth0/Clerk integration, custom Lucia-based auth
- **NextAuth Integration:** Possible but requires complex JWT handling and session management
- **Current Best Practice (2024):** Convex Auth beta provides the most seamless integration

**Implementation Approach for Migration:**

- Replace Better-Auth with Convex Auth
- Maintain email/password + username functionality via Convex Auth providers
- Handle organization/admin features through custom Convex Auth configuration
- Session management via Convex's built-in session handling

### 0.2 Convex Schema Design Research ✅

**Key Findings:**

- **Document-based relationships:** Use document IDs for references, not SQL-style foreign keys
- **Indexes:** Required for efficient queries - create indexes for all commonly queried fields
- **Multi-tenant patterns:** Add `organizationId` to all tables, use compound indexes
- **Schema evolution:** Use optional fields with defaults for gradual migration
- **Convex Ents:** Available library for ORM-like relationships, but adds complexity

**Design Patterns Identified:**

- Use `Doc<"tableName">` types from schema for type safety
- Create indexes for all foreign key relationships
- Implement multi-tenancy with organizationId scoping
- Use Convex's built-in validation with `v` validators

### 0.3 Convex File Storage Research ✅

**Key Findings:**

- **Convex Storage (Beta):** Built-in file storage with `storage.generateUploadUrl()`
- **Migration Strategy:** S3 objects can be streamed to Convex Storage via actions
- **File Handling:** Upload URLs generated via mutations, files accessed via storage API
- **Limitations:** Beta feature, may have size/performance constraints vs S3

**Migration Approach:**

- Replace S3 pre-signed URLs with Convex storage upload URLs
- Migrate existing S3 files using background jobs
- Update file access patterns to use Convex storage getUrl()

### 0.4 Current Better-Auth Implementation Analysis ✅

**Current Setup (`src/auth/auth.ts`):**

```typescript
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [username(), admin(), organization()],
  session: { cookieCache: { enabled: true, maxAge: 300 } },
});
```

**Key Features to Migrate:**

- Email/password authentication
- Username-based sign-in (via username plugin)
- Admin panel functionality (admin plugin)
- Multi-organization workspaces (organization plugin)
- Session caching in encrypted cookies
- Drizzle PostgreSQL adapter integration

**Database Tables Used:**

- user, session, account, verification (auth core)
- organization, member, invitation (org plugin)
- Custom org_role, org_role_permission, org_role_assignment (RBAC)

### 0.5 Current Database Schema Analysis ✅

**Schema Files Mapped:**

- `users-and-auth.ts` - Core auth tables + organization structure
- `org-roles.ts` - Custom RBAC system
- `teams.ts` - Team management within orgs
- `projects.ts` - Project entities
- `issues.ts` - Issue tracking
- `issue-config.ts` - Issue workflow configuration

**Core Tables & Relationships:**

```typescript
// Auth & Users (users-and-auth.ts)
user -> session (1:many via userId)
user -> account (1:many via userId)
user -> member (1:many via userId)
organization -> member (1:many via organizationId)
organization -> invitation (1:many via organizationId)

// Custom Roles (org-roles.ts)
organization -> orgRole (1:many via organizationId)
orgRole -> orgRolePermission (1:many via roleId)
orgRole -> orgRoleAssignment (1:many via roleId)
user -> orgRoleAssignment (1:many via userId)

// Business Entities
organization -> teams (1:many via organizationId)
organization -> projects (1:many via organizationId)
projects -> issues (1:many via projectId)
```

**Key Constraints & Indexes Needed:**

- All business tables scoped by organizationId (multi-tenancy)
- Unique constraints: user.email, user.username, organization.slug
- Complex RBAC with custom roles, permissions, and assignments
- Enum types: memberRoleEnum, invitationStatusEnum, issue state/priority enums

### 0.6 Current tRPC Endpoints Analysis ✅

**Router Structure (`src/trpc/routers/_app.ts`):**

```typescript
export const appRouter = createTRPCRouter({
  user: userRouter, // User management & bootstrap
  team: teamRouter, // Team CRUD operations
  project: projectRouter, // Project management
  issue: issueRouter, // Issue tracking
  organization: organizationRouter, // Org management
  role: roleRouter, // Custom role management
});
```

**Key Patterns Observed:**

- All routers use `createTRPCRouter` and procedure types
- Input validation with Zod schemas
- Service layer pattern (entities/\*/service.ts)
- Permission checking via middleware/context
- Organization-scoped operations throughout

**Sample Procedure (`user.router.ts`):**

```typescript
bootstrapAdmin: publicProcedure
  .input(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      username: z.string().min(1).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    // Service layer call
    const { id } = await createAdminUser(input);
    return { id };
  });
```

### 0.7 Current S3 Usage Analysis ✅

**S3 Configuration (`src/lib/s3.ts`):**

```typescript
// Current S3 client setup
const s3Client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.S3_ENDPOINT ?? undefined, // Supports MinIO/R2
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId, secretAccessKey },
});
```

**Key Functions:**

- `getPresignedUploadUrl(key, contentType, expiresIn)` - Generate upload URLs
- `getPresignedReadUrl(key, expiresIn)` - Generate download URLs
- `getPublicUrlForKey(key)` - Construct public URLs

**File Access Pattern (`src/app/api/files/[...key]/route.ts`):**

- Route: `/api/files/org-logos/<orgId>/...`
- Authentication via Better-Auth session
- Organization access verification
- S3 presigned URL redirect (1-hour expiry)
- Primary use case: Organization logo files

**Migration Requirements:**

- Replace presigned URLs with Convex storage equivalents
- Maintain organization-scoped file access controls
- Migrate existing org logo files from S3 to Convex Storage
- Update file upload/download UX to work with Convex Storage

## Key Insights

### Architecture Patterns

- **Multi-tenant SaaS:** All data scoped by organizationId
- **RBAC System:** Complex role-based access control with custom roles
- **Service Layer:** Business logic separated from API layer
- **Type Safety:** Heavy use of TypeScript with Zod validation

### Migration Strategy

- **Gradual Migration:** Keep existing system running during transition
- **Feature Parity:** Maintain all existing functionality
- **Type Safety:** Preserve strong typing throughout migration
- **Performance:** Ensure efficient queries with proper indexes

### Technical Decisions

- **Convex Auth:** Use built-in auth with password provider
- **Schema Design:** Document-based with proper indexes
- **File Storage:** Migrate to Convex Storage (beta)
- **Organization:** Domain-driven folder structure

## Next Steps

With the research complete, the foundation is established for:

1. **Phase 1:** Bootstrap Convex project
2. **Phase 2:** Implement authentication
3. **Phase 3:** Design and implement schema
4. **Phase 4:** Migrate business logic

The research provides a clear roadmap for maintaining feature parity while leveraging Convex's strengths.
