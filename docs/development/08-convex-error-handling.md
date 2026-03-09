# Convex Error Handling Best Practices

This document outlines the proper error handling patterns for Convex functions based on the official Convex documentation.

## Error Types in Convex

Convex distinguishes between four types of errors:

1. **Application Errors**: Expected business logic errors that should use `ConvexError`
2. **Developer Errors**: Bugs in function code (e.g., calling `db.get(null)`)
3. **Read/Write Limit Errors**: Functions exceeding data limits
4. **Internal Convex Errors**: Infrastructure issues (handled automatically by Convex)

## Using ConvexError for Application Errors

### Import Pattern

```typescript
import { v, ConvexError } from 'convex/values';
```

### Basic Usage

```typescript
export const getUser = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError('USER_NOT_FOUND');
    }
    return user;
  },
});
```

## Common Error Patterns

### Authentication Errors

```typescript
const userId = await getAuthUserId(ctx);
if (!userId) {
  throw new ConvexError('UNAUTHORIZED');
}
```

### Authorization Errors

```typescript
if (!hasPermission) {
  throw new ConvexError('FORBIDDEN');
}
```

### Not Found Errors

```typescript
if (!resource) {
  throw new ConvexError('RESOURCE_NOT_FOUND');
}
```

### Validation Errors

```typescript
if (!isValidInput) {
  throw new ConvexError('INVALID_INPUT');
}
```

## Error Messages

Use descriptive, consistent error codes in UPPER_SNAKE_CASE:

- `UNAUTHORIZED` - User not authenticated
- `FORBIDDEN` - User lacks permission
- `ORGANIZATION_NOT_FOUND` - Organization doesn't exist
- `USER_NOT_FOUND` - User doesn't exist
- `INVALID_INPUT` - Input validation failed
- `RESOURCE_ALREADY_EXISTS` - Duplicate resource creation

## Client-Side Error Handling

### In Queries (React)

Use error boundaries to catch query errors:

```tsx
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

### In Mutations (React)

Handle mutation errors with try/catch:

```tsx
const createUser = useMutation(api.users.create);

const handleSubmit = async () => {
  try {
    await createUser({ name: 'John' });
  } catch (error) {
    // Handle ConvexError here
    console.error('User creation failed:', error);
  }
};
```

## Error Behavior Differences

### Development vs Production

- **Development**: Full error messages and stack traces
- **Production**: Generic "Server Error" message for non-ConvexError exceptions
- **ConvexError**: Custom error data preserved in both environments

### Function Types

- **Queries**: Errors sent to client and thrown from `useQuery`
- **Mutations**: Promise rejection, optimistic updates rolled back
- **Actions**: No automatic retry (may have side effects)

## Best Practices

1. **Always use ConvexError for expected failures**
2. **Use consistent error codes across your application**
3. **Import ConvexError from "convex/values"**
4. **Handle authentication/authorization consistently**
5. **Use error boundaries for query error handling**
6. **Handle mutation errors explicitly with try/catch**
7. **Log errors appropriately for debugging**

## Migration from Generic Error

If migrating from generic `Error` to `ConvexError`:

1. Add `ConvexError` to imports
2. Replace `throw new Error(message)` with `throw new ConvexError(message)`
3. Standardize error message format to UPPER_SNAKE_CASE
4. Test error handling on both client and server

## Notes

Backend code has since been reorganized into domain directories such as `convex/issues/*`, `convex/projects/*`, `convex/teams/*`, `convex/organizations/*`, and `convex/roles/index.ts`.

Use this document for the error-handling pattern itself, not as an exact inventory of touched files.
