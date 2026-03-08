# UI-Level Permission Handling Guide

This document explains how to properly handle permissions in the UI and prevent unauthorized actions using our comprehensive permission system.

## Overview

Our permission system provides several utilities to check and enforce permissions at the UI level:

- `usePermissionCheck()` - Simple boolean permission check (recommended for most use cases)
- `PermissionAwareButton` - Buttons that disable based on permissions
- `PermissionAwareField` - Form fields that disable based on permissions
- `PermissionAwareWrapper` - Wrap any element with permission-aware behavior
- `PermissionGate` - Conditionally render content based on permissions
- `PageProtection` - Protect entire pages from unauthorized access

## Quick Start - Simple Permission Checks

For most use cases, use the `usePermissionCheck` hook to get a simple boolean:

```tsx
import { usePermissionCheck } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';

function MyComponent({ orgSlug }: { orgSlug: string }) {
  // Simple permission check - returns boolean
  const { isAllowed, isLoading } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_EDIT,
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <button disabled={!isAllowed}>
      {isAllowed ? 'Edit Issue' : 'No Permission'}
    </button>
  );
}
```

## Permission-Aware Components

### 1. Permission-Aware Buttons

Automatically disable buttons and show tooltips when users lack permissions:

```tsx
import { PermissionAwareButton } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';

<PermissionAwareButton
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_EDIT}
  onClick={() => editIssue()}
  fallbackMessage='You need edit permissions to modify issues'
>
  Edit Issue
</PermissionAwareButton>;
```

### 2. Permission-Aware Form Fields

Disable form inputs based on permissions:

```tsx
import { PermissionAwareField } from '@/components/ui/permission-aware';

<PermissionAwareField
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_EDIT}
  fallbackMessage='You cannot edit issue titles'
>
  <Input placeholder='Issue title...' />
</PermissionAwareField>;
```

### 3. Permission Gates

Conditionally show/hide entire sections:

```tsx
import { PermissionGate } from '@/components/ui/permission-aware';

<PermissionGate
  orgSlug={orgSlug}
  permission={PERMISSIONS.ORG_MANAGE_SETTINGS}
  fallback={<div>Access denied - Admins only</div>}
>
  <AdminSettingsPanel />
</PermissionGate>;
```

### 4. Page Protection

Protect entire pages from unauthorized access:

```tsx
import { PageProtection } from '@/components/ui/permission-aware';

<PageProtection
  orgSlug={orgSlug}
  requiredPermissions={[PERMISSIONS.TEAM_VIEW]}
  fallbackPath='/dashboard'
>
  <TeamPage />
</PageProtection>;
```

## Scoped Permissions

For team or project-specific permissions, use the `scope` parameter:

```tsx
// Team-scoped permission
const { isAllowed } = usePermissionCheck(orgSlug, PERMISSIONS.ISSUE_EDIT, {
  orgSlug,
  teamId: 'team123',
});

// Project-scoped permission
<PermissionAwareButton
  orgSlug={orgSlug}
  permission={PERMISSIONS.PROJECT_EDIT}
  scope={{ orgSlug, projectId: 'project456' }}
  onClick={() => editProject()}
>
  Edit Project
</PermissionAwareButton>;
```

## Advanced Usage

### Wrapping Existing Components

Use `PermissionAwareWrapper` to add permission behavior to any component:

```tsx
<PermissionAwareWrapper
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_STATE_UPDATE}
  fallbackMessage="You don't have permission to change issue states"
  showPermissionIndicator={true}
>
  <StateSelector
    states={states}
    selectedState={currentState}
    onStateSelect={canUpdate ? handleStateChange : () => {}}
  />
</PermissionAwareWrapper>
```

### Multiple Permission Checks

Check multiple permissions efficiently:

```tsx
function Dashboard({ orgSlug }: { orgSlug: string }) {
  const { isAllowed: canCreateProjects } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.PROJECT_CREATE,
  );
  const { isAllowed: canCreateTeams } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.TEAM_CREATE,
  );
  const { isAllowed: canManageMembers } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ORG_MANAGE_MEMBERS,
  );

  return (
    <div>
      {canCreateProjects && <CreateProjectButton />}
      {canCreateTeams && <CreateTeamButton />}
      {canManageMembers && <ManageMembersButton />}
    </div>
  );
}
```

## Error Handling

The system automatically handles various error states:

- **Loading states**: Shows appropriate loading indicators
- **Unauthorized access**: Shows user-friendly error messages with fallback actions
- **Network errors**: Graceful degradation with retry options
- **Permission changes**: Real-time updates when permissions change

## Best Practices

### ✅ DO

- Use `usePermissionCheck` for simple boolean checks
- Use permission-aware components for interactive elements
- Provide clear fallback messages explaining why access is denied
- Use scoped permissions for team/project-specific checks
- Combine client-side checks with server-side validation

### ❌ DON'T

- Rely only on client-side permission checks for security
- Show UI elements that will always be disabled without explanation
- Use permission checks for decorative purposes only
- Assume permissions are static - they can change during a session

## Common Patterns

### Status Change Button (Example Implementation)

```tsx
// Implementation example from the issue page
function IssueStatusButton({ orgSlug, currentUserAssignment, states }) {
  const { isAllowed: canUpdateState } = usePermissionCheck(
    orgSlug,
    PERMISSIONS.ISSUE_STATE_UPDATE,
  );

  return (
    <PermissionAwareWrapper
      orgSlug={orgSlug}
      permission={PERMISSIONS.ISSUE_STATE_UPDATE}
      fallbackMessage="You don't have permission to change issue states"
      showPermissionIndicator={true}
    >
      <StateSelector
        states={states}
        selectedState={currentUserAssignment.stateId}
        onStateSelect={
          canUpdateState
            ? handleStateChange
            : () => {
                // No-op when permission is denied
              }
        }
      />
    </PermissionAwareWrapper>
  );
}
```

### Conditional Form Sections

```tsx
function IssueForm({ orgSlug, issue }) {
  return (
    <form>
      {/* Always visible fields */}
      <Input name='title' value={issue.title} />

      {/* Permission-gated sections */}
      <PermissionGate
        orgSlug={orgSlug}
        permission={PERMISSIONS.ISSUE_ASSIGN}
        fallback={<p>Contact an admin to change assignees</p>}
      >
        <AssigneeSelector />
      </PermissionGate>

      <PermissionAwareField
        orgSlug={orgSlug}
        permission={PERMISSIONS.ISSUE_PRIORITY_UPDATE}
      >
        <PrioritySelector />
      </PermissionAwareField>
    </form>
  );
}
```

## Available Permissions

See the full list of permissions in `convex/_shared/permissions.ts`:

- **Organization**: `ORG_VIEW`, `ORG_MANAGE_SETTINGS`, `ORG_MANAGE_MEMBERS`, etc.
- **Projects**: `PROJECT_CREATE`, `PROJECT_VIEW`, `PROJECT_EDIT`, `PROJECT_DELETE`, etc.
- **Teams**: `TEAM_CREATE`, `TEAM_VIEW`, `TEAM_EDIT`, `TEAM_DELETE`, etc.
- **Issues**: `ISSUE_CREATE`, `ISSUE_VIEW`, `ISSUE_EDIT`, `ISSUE_DELETE`, `ISSUE_STATE_UPDATE`, etc.

## Migration from Legacy System

If updating existing components, replace legacy permission checks:

```tsx
// ❌ Old way (if it existed)
const hasPermission = checkSomePermission();
<button disabled={!hasPermission}>Edit</button>

// ✅ New way
<PermissionAwareButton
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_EDIT}
  onClick={handleEdit}
>
  Edit
</PermissionAwareButton>
```
