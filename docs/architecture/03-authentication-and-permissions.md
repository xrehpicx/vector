# Authentication and Permissions

This document outlines the comprehensive permissions system with scoped roles for organizations, teams, and projects.

## Permission System Overview

The permission system supports three levels of scoping:

1. **Organization-level**: Global permissions within an organization
2. **Team-level**: Permissions specific to a team and its issues
3. **Project-level**: Permissions specific to a project and its issues

## Permission Resolution Order

When checking permissions, the system evaluates in this order:

1. **Built-in roles**: Owner/Admin get all permissions
2. **Default member permissions**: All org members get basic permissions
3. **Organization custom roles**: Custom roles assigned at org level
4. **Team-scoped roles**: Roles specific to a team (if applicable)
5. **Project-scoped roles**: Roles specific to a project (if applicable)

## How to Add a New Permission

1. **Define the Constant**: Add your new permission to `PERMISSIONS` in `src/lib/permissions.ts` and `convex/permissions.ts`
2. **Assign to Roles**: Add the permission to appropriate role assignments
3. **Implement the Check**: Use `hasScopedPermission()` in backend or `useScopedPermission()` in frontend
4. **Update this Document**: Add the new permission to the matrix below

---

## Permission Matrix

### Organization Permissions

| Permission            | Owner | Admin | Member | Notes                            |
| --------------------- | ----- | ----- | ------ | -------------------------------- |
| `org:view`            | ✅    | ✅    | ✅     | Required for organization access |
| `org:manage:settings` | ✅    | ✅    | ❌     | Organization settings            |
| `org:manage:billing`  | ✅    | ✅    | ❌     | Billing management               |
| `org:manage:members`  | ✅    | ✅    | ❌     | Member management                |
| `org:manage:roles`    | ✅    | ✅    | ❌     | Role management                  |

### Issue Permissions

| Permission                | Owner | Admin | Member | Notes                              |
| ------------------------- | ----- | ----- | ------ | ---------------------------------- |
| `issue:create`            | ✅    | ✅    | ✅     | Default permission for all members |
| `issue:view`              | ✅    | ✅    | ✅     | Default permission for all members |
| `issue:edit`              | ✅    | ✅    | ❌     | Edit issue details                 |
| `issue:delete`            | ✅    | ✅    | ❌     | Delete issues                      |
| `issue:assign`            | ✅    | ✅    | ❌     | Assign users to issues             |
| `issue:assignment:update` | ✅    | ✅    | ❌     | Update assignment states           |
| `issue:relation:update`   | ✅    | ✅    | ❌     | Change team/project assignments    |
| `issue:state:update`      | ✅    | ✅    | ❌     | Update issue state                 |
| `issue:priority:update`   | ✅    | ✅    | ❌     | Update issue priority              |

### Team Permissions

| Permission           | Owner | Admin | Member | Notes                    |
| -------------------- | ----- | ----- | ------ | ------------------------ |
| `team:create`        | ✅    | ✅    | ❌     | Create new teams         |
| `team:view`          | ✅    | ✅    | ❌     | View team details        |
| `team:edit`          | ✅    | ✅    | ❌     | Edit team details        |
| `team:delete`        | ✅    | ✅    | ❌     | Delete teams             |
| `team:member:add`    | ✅    | ✅    | ❌     | Add team members         |
| `team:member:remove` | ✅    | ✅    | ❌     | Remove team members      |
| `team:member:update` | ✅    | ✅    | ❌     | Update team member roles |
| `team:lead:update`   | ✅    | ✅    | ❌     | Update team lead         |

### Project Permissions

| Permission              | Owner | Admin | Member | Notes                       |
| ----------------------- | ----- | ----- | ------ | --------------------------- |
| `project:create`        | ✅    | ✅    | ❌     | Create new projects         |
| `project:view`          | ✅    | ✅    | ❌     | View project details        |
| `project:edit`          | ✅    | ✅    | ❌     | Edit project details        |
| `project:delete`        | ✅    | ✅    | ❌     | Delete projects             |
| `project:member:add`    | ✅    | ✅    | ❌     | Add project members         |
| `project:member:remove` | ✅    | ✅    | ❌     | Remove project members      |
| `project:member:update` | ✅    | ✅    | ❌     | Update project member roles |
| `project:lead:update`   | ✅    | ✅    | ❌     | Update project lead         |

### Wildcard Permissions

| Permission          | Owner | Admin | Member | Notes                                                      |
| ------------------- | ----- | ----- | ------ | ---------------------------------------------------------- |
| `*`                 | ✅    | ✅    | ❌     | All permissions                                            |
| `issue:*`           | ✅    | ✅    | ❌     | All issue permissions                                      |
| `team:*`            | ✅    | ✅    | ❌     | All team permissions                                       |
| `project:*`         | ✅    | ✅    | ❌     | All project permissions                                    |
| `project:view`      | ✅    | ✅    | ✅     | View accessible projects                                   |
| `project:create`    | ✅    | ✅    | ❌     | Create new projects                                        |
| `project:update`    | ✅    | ✅    | ❌     | Update project details                                     |
| `project:delete`    | ✅    | ✅    | ❌     | Delete projects                                            |
| `team:view`         | ✅    | ✅    | ✅     | View accessible teams                                      |
| `team:create`       | ✅    | ✅    | ❌     | Create new teams                                           |
| `team:update`       | ✅    | ✅    | ❌     | Update team details                                        |
| `team:delete`       | ✅    | ✅    | ❌     | Delete teams                                               |
| `issue:view`        | ✅    | ✅    | ✅     | View accessible issues                                     |
| `issue:create`      | ✅    | ✅    | ✅     | Create new issues                                          |
| `issue:update`      | ✅    | ✅    | ✅\*   | Update issues (_limited to own/assigned by policy engine_) |
| `issue:delete`      | ✅    | ✅    | ❌     | Delete issues                                              |
| `assignment:manage` | ✅    | ✅    | ❌     | Manage issue assignments                                   |

---

## Permission Policy Engine

The centralized policy engine (`src/auth/policy-engine.ts`) handles all permission checks with the following fallback logic:

1.  **Platform Admin**: Always allowed.
2.  **Lead Status**: Project/team leads get automatic permissions for their resources. Project and team creators automatically become members with "lead" role.
3.  **Owner Wildcard**: Organization owners have all permissions.
4.  **Built-in Role**: Checks static permission sets (`owner`, `admin`, `member`).
5.  **Custom Roles**: Checks permissions granted by assigned custom roles.

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
import { hasScopedPermission } from "@/convex/permissions";
import { PERMISSIONS } from "@/convex/permissions";

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
import { requirePermission } from "@/convex/permissions";

await requirePermission(ctx, organizationId, PERMISSIONS.TEAM_CREATE);
```

#### Issue-Specific Permission Checks

```typescript
import {
  canViewIssue,
  canEditIssue,
  canAssignIssue,
} from "@/convex/permissions";

const canView = await canViewIssue(ctx, issue, userId);
const canEdit = await canEditIssue(ctx, issue, userId);
const canAssign = await canAssignIssue(ctx, issue, userId);
```
