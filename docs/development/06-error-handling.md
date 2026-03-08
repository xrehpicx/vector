# Error Handling Guide

This document outlines the comprehensive error handling system implemented for the Convex application, providing consistent user experience across all mutations and queries.

## Overview

The error handling system provides:

- **Consistent error categorization** (validation, permission, not_found, conflict, network, server, unknown)
- **User-friendly error messages** that don't expose technical details
- **Automatic toast notifications** with appropriate styling based on error type
- **React hooks** for easy integration with components
- **Retry logic** for network and server errors
- **Type-safe error handling** with full TypeScript support

## Core Components

### 1. Error Analysis (`src/lib/error-handling.ts`)

The `analyzeError` function categorizes errors based on message patterns:

```typescript
import { analyzeError } from '@/lib/error-handling';

const errorInfo = analyzeError(error);
// Returns: { category, message, userMessage, retryable }
```

**Error Categories:**

- `validation` - Input validation errors
- `permission` - Authentication/authorization errors
- `not_found` - Resource not found errors
- `conflict` - Duplicate/conflict errors
- `network` - Network connectivity issues
- `server` - Server-side errors
- `unknown` - Unclassified errors

### 2. Toast Notifications

Automatic toast notifications with appropriate styling:

```typescript
import { showErrorToast, showSuccessToast } from '@/lib/error-handling';

showErrorToast(error, 'User invitation');
showSuccessToast('Profile updated successfully', 'Profile update');
```

**Toast Types:**

- `error` - For validation, permission, not_found, network, server errors
- `warning` - For conflict errors (user-friendly)
- `success` - For successful operations

### 3. React Hooks

#### `useConvexMutation`

For simple mutation error handling:

```typescript
import { useConvexMutation } from '@/hooks/use-error-handling';

const { execute, isLoading, error } = useConvexMutation(
  api.organizations.invite,
  {
    context: 'Invite',
    onSuccess: result => console.log('Success:', result),
    onError: errorInfo => console.log('Error:', errorInfo),
  },
);

// Usage
const result = await execute({ orgSlug, email, role });
```

#### `useFormSubmission`

For form submissions with built-in success messages:

```typescript
import { useFormSubmission } from '@/hooks/use-error-handling';

const { submit, isSubmitting, error } = useFormSubmission(
  api.users.updateProfile,
  {
    context: 'Profile update',
    successMessage: 'Profile updated successfully',
    onSuccess: () => router.refresh(),
  },
);

// Usage
await submit({ name: 'John Doe' });
```

#### `useAsyncOperation`

For operations with retry logic:

```typescript
import { useAsyncOperation } from '@/hooks/use-error-handling';

const { execute, isLoading, error, retryCount } = useAsyncOperation(
  api.files.upload,
  {
    context: 'File upload',
    maxRetries: 3,
    retryDelay: 1000,
  },
);
```

## Usage Examples

### 1. Basic Mutation with Error Handling

```typescript
import { useConvexMutation } from "@/hooks/use-error-handling";

function CreateProjectButton() {
  const { execute, isLoading, error } = useConvexMutation(
    api.projects.create,
    {
      context: "Project creation",
      onSuccess: (result) => {
        router.push(`/projects/${result.projectId}`);
      },
    }
  );

  const handleCreate = async () => {
    const result = await execute({
      name: "New Project",
      description: "Project description",
    });

    if (result) {
      // Success - router.push already called in onSuccess
    }
  };

  return (
    <Button onClick={handleCreate} disabled={isLoading}>
      {isLoading ? "Creating..." : "Create Project"}
    </Button>
  );
}
```

### 2. Form with Error Display

```typescript
import { useFormSubmission } from "@/hooks/use-error-handling";

function InviteForm() {
  const { submit, isSubmitting, error } = useFormSubmission(
    api.organizations.invite,
    {
      context: "Invite",
      successMessage: "Invitation sent successfully",
    }
  );

  const handleSubmit = async (data: InviteFormData) => {
    await submit({ email: data.email, role: data.role });
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.userMessage}</AlertDescription>
        </Alert>
      )}

      <Input name="email" type="email" />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send Invite"}
      </Button>
    </form>
  );
}
```

### 3. File Upload with Retry Logic

```typescript
import { useAsyncOperation } from "@/hooks/use-error-handling";

function FileUpload() {
  const { execute, isLoading, error, retryCount } = useAsyncOperation(
    api.files.upload,
    {
      context: "File upload",
      maxRetries: 3,
      retryDelay: 1000,
    }
  );

  const handleUpload = async (file: File) => {
    const result = await execute({ file });

    if (result) {
      console.log("Upload successful:", result.url);
    }
  };

  return (
    <div>
      <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />
      {isLoading && <span>Uploading... {retryCount > 0 && `(Retry ${retryCount})`}</span>}
      {error && <span className="text-red-500">{error.userMessage}</span>}
    </div>
  );
}
```

## Error Patterns

The system recognizes these error patterns:

### Validation Errors

- `required`, `cannot be empty` → "Please check your input and try again."
- `must be at least`, `must be less than`, `invalid` → "Please check your input and try again."

### Permission Errors

- `not authenticated`, `unauthorized` → "Please sign in to continue."
- `access denied`, `insufficient permissions`, `not a member` → "You don't have permission to perform this action."

### Not Found Errors

- `not found` → "The requested resource was not found."

### Conflict Errors

- `already exists`, `already a member`, `duplicate` → "This item already exists."

### Network Errors

- `network`, `connection`, `timeout` → "Network error. Please check your connection and try again."

### Server Errors

- `server`, `internal`, `error` → "Something went wrong. Please try again later."

## Best Practices

### 1. Always Use Context

Provide meaningful context for better error messages:

```typescript
// Good
const { submit } = useFormSubmission(mutation, {
  context: 'User invitation',
});

// Avoid
const { submit } = useFormSubmission(mutation);
```

### 2. Handle Success Cases

Use `onSuccess` callbacks for navigation and UI updates:

```typescript
const { submit } = useFormSubmission(mutation, {
  context: 'Project creation',
  onSuccess: result => {
    router.push(`/projects/${result.projectId}`);
    setDialogOpen(false);
  },
});
```

### 3. Display Errors in UI

Show errors inline for better UX:

```typescript
{error && (
  <Alert variant="destructive">
    <AlertDescription>{error.userMessage}</AlertDescription>
  </Alert>
)}
```

### 4. Use Appropriate Hooks

- `useConvexMutation` - For simple mutations
- `useFormSubmission` - For forms with success messages
- `useAsyncOperation` - For operations that might need retry

### 5. Custom Error Messages

For custom error handling, use the utility functions directly:

```typescript
import { analyzeError, showErrorToast } from '@/lib/error-handling';

try {
  await mutation(args);
} catch (error) {
  const errorInfo = analyzeError(error);

  if (errorInfo.category === 'permission') {
    // Handle permission errors specially
    router.push('/login');
  } else {
    showErrorToast(error, 'Operation');
  }
}
```

## Migration Guide

### From Manual Error Handling

**Before:**

```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleSubmit = async data => {
  setIsLoading(true);
  setError(null);

  try {
    await mutation(data);
    toast.success('Success!');
  } catch (error) {
    setError(error.message);
    toast.error(error.message);
  } finally {
    setIsLoading(false);
  }
};
```

**After:**

```typescript
const { submit, isSubmitting, error } = useFormSubmission(mutation, {
  context: 'Operation',
  successMessage: 'Success!',
});

const handleSubmit = async data => {
  await submit(data);
};
```

### From Basic Toast Usage

**Before:**

```typescript
try {
  await mutation(args);
  toast.success('Success');
} catch (error) {
  toast.error(error.message);
}
```

**After:**

```typescript
const { submit } = useFormSubmission(mutation, {
  context: 'Operation',
  successMessage: 'Success',
});

await submit(args);
```

## Testing Error Handling

### Unit Tests

```typescript
import { analyzeError } from '@/lib/error-handling';

describe('Error Analysis', () => {
  it('categorizes validation errors', () => {
    const error = new Error('Name is required');
    const result = analyzeError(error);

    expect(result.category).toBe('validation');
    expect(result.userMessage).toBe('Please check your input and try again.');
  });
});
```

### Integration Tests

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { InviteDialog } from "@/components/organization/invite-dialog";

describe("InviteDialog", () => {
  it("shows error message for duplicate email", async () => {
    render(<InviteDialog orgSlug="test" onClose={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("email@example.com"), {
      target: { value: "existing@example.com" },
    });

    fireEvent.click(screen.getByText("Send Invite"));

    await screen.findByText("This item already exists.");
  });
});
```

## Troubleshooting

### Common Issues

1. **Error not categorized correctly**
   - Check if the error message matches the patterns in `ERROR_PATTERNS`
   - Add new patterns if needed

2. **Toast not showing**
   - Ensure `Toaster` component is mounted in your app
   - Check that `showErrorToast` is being called

3. **TypeScript errors**
   - Make sure you're using the correct hook for your use case
   - Check that mutation types match expected parameters

### Debug Mode

Enable debug logging to see error analysis:

```typescript
// In development
if (process.env.NODE_ENV === 'development') {
  console.log('Error analysis:', analyzeError(error));
}
```

## Future Enhancements

- **Error reporting** - Integration with error tracking services
- **Localization** - Support for multiple languages
- **Custom error codes** - More granular error categorization
- **Error boundaries** - React error boundary integration
- **Offline handling** - Better offline error messages
