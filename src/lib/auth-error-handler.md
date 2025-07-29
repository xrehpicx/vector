# Auth Error Handler

This utility provides proper error handling for Convex Auth errors, extracting user-friendly messages from complex error objects.

## Usage

```typescript
import { extractAuthErrorMessage } from "@/lib/auth-error-handler";

try {
  await signIn("password", formData);
} catch (error) {
  const userFriendlyMessage = extractAuthErrorMessage(error);
  setError(userFriendlyMessage);
}
```

## Features

### 1. **User-Friendly Error Messages**

Instead of showing technical error messages like:

```
"[Request ID: 45e69ddcd5f38ffe] Server Error Uncaught Error: InvalidAccountId at retrieveAccount"
```

The utility provides clear, actionable messages like:

```
"Invalid email or password"
```

### 2. **Comprehensive Error Coverage**

Handles various error types:

- **Authentication Errors**: Invalid credentials, user not found
- **Validation Errors**: Invalid email, password too short
- **Network Errors**: Connection issues, fetch failures
- **Server Errors**: 500 errors, internal server errors
- **Long Stack Traces**: Extracts meaningful first line
- **Very Long Messages**: Truncates to reasonable length

### 3. **Error Type Detection**

```typescript
import {
  isNetworkError,
  isServerError,
  isAuthError,
} from "@/lib/auth-error-handler";

if (isNetworkError(error)) {
  // Handle network-specific UI
}

if (isServerError(error)) {
  // Handle server-specific UI
}

if (isAuthError(error)) {
  // Handle auth-specific UI
}
```

## Error Patterns Handled

| Error Pattern        | User Message                                                |
| -------------------- | ----------------------------------------------------------- |
| `InvalidAccountId`   | "Invalid email or password"                                 |
| `InvalidCredentials` | "Invalid email or password"                                 |
| `UserNotFound`       | "Account not found. Please check your email or sign up"     |
| `EmailAlreadyExists` | "An account with this email already exists"                 |
| `PasswordTooShort`   | "Password must be at least 8 characters long"               |
| `InvalidEmail`       | "Please enter a valid email address"                        |
| `NetworkError`       | "Network error. Please check your connection and try again" |
| `Server Error`       | "Server error. Please try again later"                      |
| `Unauthorized`       | "Invalid email or password"                                 |
| `Forbidden`          | "Access denied"                                             |
| `Not Found`          | "Service not found. Please try again later"                 |

## Implementation

The utility is used in:

- `src/app/auth/login/page.tsx`
- `src/app/auth/signup/page.tsx`
- `src/app/test-auth/page.tsx`
- `src/app/setup-admin/page.tsx`

## Benefits

1. **Better UX**: Users see clear, actionable error messages
2. **Security**: No exposure of internal error details
3. **Consistency**: Standardized error handling across the app
4. **Maintainability**: Centralized error message logic
5. **Type Safety**: Proper TypeScript typing for error handling
