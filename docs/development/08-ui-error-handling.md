# UI Error Handling & Permission-Aware Components

This document explains the comprehensive error handling and permission-aware UI system implemented to prevent unauthorized actions, handle errors gracefully, and provide excellent user experience.

## Overview

The system provides:

- **Permission-aware components** that automatically disable based on user permissions
- **Error boundaries** that catch and handle UI crashes gracefully
- **Safe action hooks** for mutation error handling with automatic redirects
- **Comprehensive error feedback** with proper toast notifications
- **403/404 handling** with styled error pages

## Error Boundary System

### Global Error Boundary

All pages are wrapped with a global error boundary in `src/app/layout.tsx`:

```tsx
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function RootLayout({ children }) {
  return (
    <ErrorBoundary>
      <ConvexAuthProvider>
        {children}
        <Toaster />
      </ConvexAuthProvider>
    </ErrorBoundary>
  );
}
```

### Error Boundary Features

- **Automatic error type detection**: Distinguishes between permission, not found, and generic errors
- **Styled error fallbacks**: Consistent design matching the app's UI
- **Recovery options**: Retry, go home, or go back buttons
- **Development details**: Shows error stack traces in development mode
- **Error reporting**: Logs errors for monitoring

### Using Error Boundaries

```tsx
import {
  ErrorBoundary,
  useErrorBoundary,
} from '@/components/ui/error-boundary';

// Wrap components that might throw errors
<ErrorBoundary>
  <SomeComponent />
</ErrorBoundary>;

// Or use the hook to capture errors programmatically
function MyComponent() {
  const captureError = useErrorBoundary();

  const handleAction = () => {
    try {
      // Some risky operation
    } catch (error) {
      captureError(error); // Will trigger error boundary
    }
  };
}
```

## Permission-Aware Components

### Available Components

#### PermissionAwareButton

Automatically disables buttons based on permissions:

```tsx
import { PermissionAwareButton } from '@/components/ui/permission-aware';
import { PERMISSIONS } from '@/convex/_shared/permissions';

<PermissionAwareButton
  orgSlug={orgSlug}
  permission={PERMISSIONS.TEAM_EDIT}
  onClick={handleEdit}
  fallbackMessage="You don't have permission to edit teams"
>
  Edit Team
</PermissionAwareButton>;
```

#### PermissionAwareSelector

Disables selectors and removes event handlers when user lacks permission:

```tsx
<PermissionAwareSelector
  orgSlug={orgSlug}
  permission={PERMISSIONS.PROJECT_EDIT}
  fallbackMessage="You don't have permission to change project settings"
>
  <ProjectSelector
    projects={projects}
    selectedProject={selectedProject}
    onProjectSelect={setSelectedProject}
  />
</PermissionAwareSelector>
```

#### PermissionAwareField

Wraps form fields with permission checking:

```tsx
<PermissionAwareField
  orgSlug={orgSlug}
  permission={PERMISSIONS.TEAM_EDIT}
  fallbackMessage="You don't have permission to edit team information"
>
  <Input value={teamName} onChange={setTeamName} placeholder='Team name' />
</PermissionAwareField>
```

#### PermissionAwareWrapper

Generic wrapper for any interactive element:

```tsx
<PermissionAwareWrapper
  orgSlug={orgSlug}
  permission={PERMISSIONS.ISSUE_DELETE}
  as='button'
  onClick={handleDelete}
  fallbackMessage="You don't have permission to delete issues"
>
  Delete Issue
</PermissionAwareWrapper>
```

#### PermissionStatus

Shows visual permission status indicators:

```tsx
<PermissionStatus
  orgSlug={orgSlug}
  permission={PERMISSIONS.ORG_MANAGE_SETTINGS}
  showIcon={true}
  showText={true}
/>
```

### Permission-Aware Component Features

- **Automatic disabling**: Components become non-interactive when permission is denied
- **Visual indicators**: Lock icons and tooltips indicate restricted access
- **Loading states**: Shows loading while permission is being checked
- **Tooltips**: Explanatory messages on hover for disabled components
- **Event handler removal**: Prevents accidental action execution

## Safe Action Hooks

### useSafeAction

Comprehensive hook for handling actions with permission checking and error handling:

```tsx
import { useSafeAction } from '@/hooks/use-safe-action';

function MyComponent({ orgSlug }) {
  const deleteTeam = useMutation(api.teams.delete);

  const { execute, isLoading, canExecute } = useSafeAction(deleteTeam, {
    orgSlug,
    permission: PERMISSIONS.TEAM_DELETE,
    loadingMessage: 'Deleting team...',
    successMessage: 'Team deleted successfully',
    errorMessage: 'Failed to delete team',
    requireConfirmation: true,
    confirmationMessage: 'Are you sure you want to delete this team?',
    redirectTo: '/teams',
  });

  return (
    <Button
      onClick={() => execute(teamId)}
      disabled={!canExecute}
      loading={isLoading}
    >
      Delete Team
    </Button>
  );
}
```

### useSafeSubmit

Specialized hook for form submissions:

```tsx
import { useSafeSubmit } from '@/hooks/use-safe-action';

function TeamForm({ orgSlug }) {
  const createTeam = useMutation(api.teams.create);

  const { submit, isLoading } = useSafeSubmit(createTeam, {
    orgSlug,
    permission: PERMISSIONS.TEAM_CREATE,
    validateData: data => {
      if (!data.name) return 'Team name is required';
      return null;
    },
    resetForm: () => setFormData({}),
    successMessage: 'Team created successfully',
  });

  const handleSubmit = e => {
    e.preventDefault();
    submit(formData);
  };
}
```

### useSafeDelete

Specialized hook for delete operations with confirmation:

```tsx
import { useSafeDelete } from '@/hooks/use-safe-action';

function TeamActions({ teamId, orgSlug }) {
  const deleteTeam = useMutation(api.teams.delete);

  const { execute, isLoading, canExecute } = useSafeDelete(deleteTeam, {
    orgSlug,
    permission: PERMISSIONS.TEAM_DELETE,
    itemName: 'team',
  });

  return (
    <Button
      onClick={() => execute(teamId)}
      disabled={!canExecute}
      loading={isLoading}
      variant='destructive'
    >
      Delete Team
    </Button>
  );
}
```

## Error Types and Handling

### Permission Errors (403)

- **Detection**: Error message contains "FORBIDDEN" or "Unauthorized"
- **Handling**: Automatic redirect to styled 403 page
- **Prevention**: Permission-aware components prevent these errors

### Not Found Errors (404)

- **Detection**: Error message contains "not found"
- **Handling**: Automatic redirect to 404 page
- **Recovery**: Retry and navigation options

### Network Errors

- **Detection**: Error message contains "fetch" or "network"
- **Handling**: User-friendly error message with retry suggestion
- **Recovery**: Automatic retry mechanisms

### Validation Errors

- **Detection**: Error message contains "validation" or "invalid"
- **Handling**: Form-specific error messages
- **Prevention**: Client-side validation before submission

### Critical Errors

- **Detection**: Error message contains "CRITICAL" or "CRASH"
- **Handling**: Captured by error boundary for graceful fallback
- **Recovery**: Full page error boundary with recovery options

## Toast Notification System

Integrated toast notifications provide immediate feedback:

```tsx
import { toast } from 'sonner';

// Automatic toasts from safe action hooks
const { execute } = useSafeAction(mutation, {
  loadingMessage: 'Processing...',
  successMessage: 'Action completed',
  errorMessage: 'Action failed',
});

// Manual toast notifications
toast.success('Settings saved');
toast.error('Failed to save settings');
toast.loading('Saving...');
```

## Page-Level Protection

### Using PermissionBoundary

```tsx
import { PermissionBoundary } from '@/hooks/use-permission-boundary';

export default function RolesPage() {
  return (
    <PermissionBoundary
      orgSlug={orgSlug}
      permission={PERMISSIONS.ORG_MANAGE_ROLES}
    >
      <RolesManagement />
    </PermissionBoundary>
  );
}
```

### Using useRequirePermission

```tsx
import { useRequirePermission } from '@/hooks/use-permission-boundary';

export default function MembersPage() {
  const { isLoading } = useRequirePermission(
    orgSlug,
    PERMISSIONS.ORG_MANAGE_MEMBERS,
  );

  if (isLoading) return <LoadingSpinner />;

  return <MembersManagement />;
}
```

## Best Practices

### 1. Component-Level Protection

```tsx
// ✅ Good: Wrap interactive elements
<PermissionAwareButton permission={PERMISSIONS.TEAM_EDIT} onClick={handleEdit}>
  Edit
</PermissionAwareButton>;

// ❌ Bad: Manual permission checks everywhere
{
  hasEditPermission && <Button onClick={handleEdit}>Edit</Button>;
}
```

### 2. Action-Level Safety

```tsx
// ✅ Good: Use safe action hooks
const { execute } = useSafeAction(mutation, {
  permission: PERMISSIONS.TEAM_DELETE,
  requireConfirmation: true,
});

// ❌ Bad: Manual error handling
const handleDelete = async () => {
  try {
    await mutation();
  } catch (error) {
    console.error(error); // Poor error handling
  }
};
```

### 3. Form Validation

```tsx
// ✅ Good: Comprehensive validation
const { submit } = useSafeSubmit(createTeam, {
  validateData: data => {
    if (!data.name?.trim()) return 'Name is required';
    if (data.name.length < 2) return 'Name must be at least 2 characters';
    return null;
  },
});

// ❌ Bad: No validation or error handling
const handleSubmit = () => {
  createTeam(formData); // No validation
};
```

### 4. Error Boundaries

```tsx
// ✅ Good: Wrap risky components
<ErrorBoundary>
  <ComplexDataVisualization />
</ErrorBoundary>

// ❌ Bad: No error boundary protection
<ComplexDataVisualization /> // Could crash the whole page
```

## Migration from Old System

### Replace Manual Permission Checks

**Before:**

```tsx
const { hasPermission } = usePermission(orgSlug, PERMISSIONS.TEAM_EDIT);

return (
  <Button
    disabled={!hasPermission}
    onClick={hasPermission ? handleEdit : undefined}
  >
    Edit
  </Button>
);
```

**After:**

```tsx
return (
  <PermissionAwareButton
    orgSlug={orgSlug}
    permission={PERMISSIONS.TEAM_EDIT}
    onClick={handleEdit}
  >
    Edit
  </PermissionAwareButton>
);
```

### Replace Manual Error Handling

**Before:**

```tsx
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState(null);

const handleAction = async () => {
  setIsLoading(true);
  try {
    await mutation();
    toast.success('Success');
  } catch (err) {
    setError(err);
    toast.error('Failed');
  } finally {
    setIsLoading(false);
  }
};
```

**After:**

```tsx
const { execute, isLoading } = useSafeAction(mutation, {
  successMessage: 'Success',
  errorMessage: 'Failed',
});
```

### Replace Basic Error Boundaries

**Before:**

```tsx
class ErrorBoundary extends React.Component {
  // Basic error boundary implementation
}
```

**After:**

```tsx
import { ErrorBoundary } from '@/components/ui/error-boundary';

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>;
```

This comprehensive system ensures that users never encounter unhandled errors, are prevented from attempting unauthorized actions, and receive clear feedback about what they can and cannot do within the application.
