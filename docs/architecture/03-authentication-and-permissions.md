# Authentication and Permissions

This document outlines the current auth and authorization model used by Vector.

## Authentication

- Auth provider: Better Auth with the Convex adapter
- Server-side integration: `convex/auth.ts`
- Next.js bridge: `src/lib/auth-server.ts`
- Client helper: `src/lib/auth-client.ts`
- Auth route: `src/app/api/auth/[...all]/route.ts`
- First-admin bootstrap flow: `src/app/setup-admin/page.tsx`

The application uses Better Auth for identity and session handling, while Convex remains the source of truth for application data, permissions, and role assignments.

## Permission Scope Model

Permissions are evaluated at three scopes:

1. **Organization scope**
2. **Team scope**
3. **Project scope**

Issue and document access may inherit through organization, team, or project membership depending on the resource.

## Permission Sources

- Permission constants: `convex/_shared/permissions.ts`
- Backend access checks: `convex/access.ts`
- Permission query API for the frontend: `convex/permissions/queries.ts`
- Role assignment and system-role management: `convex/roles/index.ts`
- Frontend hooks: `src/hooks/use-permissions.tsx`
- UI wrappers: `src/components/ui/permission-aware.tsx`

## Built-In Organization Roles

The default organization roles are:

| Role     | Summary                                                                 |
| -------- | ----------------------------------------------------------------------- |
| `owner`  | Full access via wildcard permission                                     |
| `admin`  | Broad org, team, project, issue, and document management access         |
| `member` | Basic access to view org resources and create/edit issues and documents |

The exact permission lists live in `BUILTIN_ROLE_PERMISSIONS` in `convex/_shared/permissions.ts`.

## Scoped System Roles

Vector also creates scoped system roles for team and project membership:

- `team:lead`
- `team:member`
- `project:lead`
- `project:member`

These roles are managed through `convex/roles/index.ts` and allow permissions to vary per team or project without forking the entire organization role model.

## Frontend Usage

For UI checks, use:

- `usePermissionCheck()` for simple boolean checks
- `useScopedPermission()` for scoped checks
- `PermissionAware`, `PermissionAwareButton`, `PermissionAwareField`, and related wrappers for interactive UI

See [UI-Level Permission Handling Guide](../development/07-permission-handling.md) for examples.

## Backend Usage

For server-side enforcement:

- Use backend access helpers in `convex/access.ts`
- Use role and permission queries in `convex/permissions/queries.ts`
- Never rely only on client-side permission checks for security

## Adding a New Permission

1. Add the permission constant to `convex/_shared/permissions.ts`.
2. Add it to the appropriate built-in or system role sets if needed.
3. Enforce it in backend code.
4. Expose it to the frontend through existing permission queries and wrappers.
5. Update the documentation.

### Frontend Usage

#### Simple Permission Check (Recommended)

For most UI components, use the simple permission check hook:

```typescript
import { usePermissionCheck } from "@/components/ui/permission-aware";
import { PERMISSIONS } from "@/convex/_shared/permissions";

function MyComponent({ orgSlug }: { orgSlug: string }) {
  const { isAllowed, isLoading } = usePermissionCheck(orgSlug, PERMISSIONS.ISSUE_EDIT);

  if (isLoading) return <div>Loading...</div>;

  return (
    <button disabled={!isAllowed}>
      {isAllowed ? "Edit Issue" : "No Permission"}
    </button>
  );
}
```

#### Permission-Aware Components

Use pre-built components that handle permissions automatically:

```typescript
import {
  PermissionAwareButton,
  PermissionAwareField,
  PermissionGate
} from "@/components/ui/permission-aware";

// Button that disables when permission is denied
<PermissionAwareButton
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_EDIT}
  onClick={handleEdit}
  fallbackMessage="You need edit permissions"
>
  Edit Issue
</PermissionAwareButton>

// Form field that disables based on permissions
<PermissionAwareField
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_EDIT}
>
  <Input placeholder="Issue title..." />
</PermissionAwareField>

// Conditionally render content
<PermissionGate
  orgSlug={orgSlug}
  permission={PERMISSIONS.ORG_MANAGE_SETTINGS}
  fallback={<div>Access denied</div>}
>
  <AdminPanel />
</PermissionGate>
```

#### Scoped Permissions

For team or project-specific permissions:

```typescript
// Team-scoped permission
const { isAllowed } = usePermissionCheck(
  orgSlug,
  PERMISSIONS.ISSUE_EDIT,
  { orgSlug, teamId: "team123" }
);

// Project-scoped permission
<PermissionAwareButton
  orgSlug={orgSlug}
  permission={PERMISSIONS.PROJECT_EDIT}
  scope={{ orgSlug, projectId: "project456" }}
  onClick={handleEdit}
>
  Edit Project
</PermissionAwareButton>
```

#### Page Protection

Protect entire pages from unauthorized access:

```typescript
import { PageProtection } from "@/components/ui/permission-aware";

<PageProtection
  orgSlug={orgSlug}
  requiredPermissions={[PERMISSIONS.TEAM_VIEW]}
  fallbackPath="/dashboard"
>
  <TeamPage />
</PageProtection>
```

### Backend Usage

#### Basic Permission Check

```typescript
import { hasScopedPermission } from '@/convex/permissions';
import { PERMISSIONS } from '@/convex/permissions';

// Organization-level permission
const canCreateProject = await hasScopedPermission(
  ctx,
  { organizationId: org._id },
  userId,
  PERMISSIONS.PROJECT_CREATE,
);

// Team-scoped permission
const canEditTeam = await hasScopedPermission(
  ctx,
  { organizationId: org._id, teamId: team._id },
  userId,
  PERMISSIONS.TEAM_EDIT,
);
```

#### Require Permission (throws if not granted)

```typescript
import { requirePermission } from '@/convex/permissions';

await requirePermission(ctx, organizationId, PERMISSIONS.TEAM_CREATE);
```

#### Issue-Specific Permission Checks

```typescript
import {
  canViewIssue,
  canEditIssue,
  canAssignIssue,
} from '@/convex/permissions';

const canView = await canViewIssue(ctx, issue, userId);
const canEdit = await canEditIssue(ctx, issue, userId);
const canAssign = await canAssignIssue(ctx, issue, userId);
```
