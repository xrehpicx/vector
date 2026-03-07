/**
 * Utility for handling Convex Auth errors and extracting user-friendly messages
 */

export interface AuthError {
  message: string;
  code?: string;
  status?: number;
}

function getErrorFields(error: unknown): AuthError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const record = error as Record<string, unknown>;
  const message =
    typeof record.message === 'string' ? record.message : undefined;
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;

  if (!message && !code && status === undefined) {
    return null;
  }

  return {
    message: message ?? 'Authentication failed',
    code,
    status,
  };
}

/**
 * Extract user-friendly error message from Convex Auth errors
 */
export function extractAuthErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (!error) {
    return 'An unexpected error occurred';
  }

  const authError = getErrorFields(error);
  if (authError) {
    if (
      authError.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ||
      authError.message.includes('already exists')
    ) {
      return 'An account with this email already exists. Please sign in instead';
    }

    if (
      authError.code === 'INVALID_EMAIL_OR_PASSWORD' ||
      authError.code === 'INVALID_USERNAME_OR_PASSWORD'
    ) {
      return 'Invalid email, username, or password';
    }

    if (authError.code === 'PASSWORD_TOO_SHORT') {
      return 'Password must be at least 6 characters long';
    }

    if (authError.code === 'INVALID_USERNAME') {
      return 'Username can only contain letters, numbers, periods, hyphens, and underscores';
    }

    if (authError.code === 'USERNAME_TOO_SHORT') {
      return 'Username must be at least 3 characters long';
    }

    if (authError.code === 'USERNAME_TOO_LONG') {
      return 'Username must be less than 20 characters';
    }

    if (
      authError.status === 401 ||
      authError.status === 403 ||
      authError.status === 422
    ) {
      return authError.message;
    }
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;

    // Common Convex Auth error patterns
    if (message.includes('InvalidAccountId')) {
      return 'Invalid email or password';
    }

    if (message.includes('InvalidCredentials')) {
      return 'Invalid email or password';
    }

    if (message.includes('UserNotFound')) {
      return 'Account not found. Please check your email or sign up';
    }

    if (message.includes('EmailAlreadyExists')) {
      return 'An account with this email already exists. Please try signing in instead';
    }

    if (message.includes('UsernameAlreadyExists')) {
      return 'This username is already taken. Please choose a different one';
    }

    if (message.includes('PasswordTooShort')) {
      return 'Password must be at least 8 characters long';
    }

    if (message.includes('PasswordTooWeak')) {
      return 'Password is too weak. Please include letters and numbers';
    }

    if (message.includes('InvalidEmail')) {
      return 'Please enter a valid email address';
    }

    if (message.includes('InvalidUsername')) {
      return 'Username can only contain letters, numbers, hyphens, and underscores';
    }

    if (message.includes('UsernameTooShort')) {
      return 'Username must be at least 3 characters long';
    }

    if (message.includes('UsernameTooLong')) {
      return 'Username must be less than 20 characters';
    }

    if (message.includes('NetworkError') || message.includes('fetch')) {
      return 'Network error. Please check your connection and try again';
    }

    if (message.includes('Request failed') || message.includes('500')) {
      return 'Server error. Please try again later';
    }

    if (message.includes('Unauthorized') || message.includes('401')) {
      return 'Invalid email or password';
    }

    if (message.includes('Forbidden') || message.includes('403')) {
      return 'Access denied';
    }

    if (message.includes('Not Found') || message.includes('404')) {
      return 'Service not found. Please try again later';
    }

    if (message.includes('Too Many Requests') || message.includes('429')) {
      return 'Too many attempts. Please wait a moment and try again';
    }

    if (message.includes('Rate Limited')) {
      return 'Too many signup attempts. Please wait a few minutes before trying again';
    }

    // Handle generic server errors
    if (
      message.includes('Server Error') ||
      message.includes('Internal Server Error')
    ) {
      return 'Server error. Please try again later';
    }

    // Handle validation errors
    if (
      message.includes('Validation failed') ||
      message.includes('Invalid input')
    ) {
      return 'Please check your input and try again';
    }

    // Handle stack traces - extract just the first meaningful line
    if (message.includes('at ')) {
      const lines = message.split('\n');
      const firstLine = lines[0].trim();
      if (firstLine && !firstLine.includes('at ')) {
        return firstLine;
      }
    }

    // Return the error message if it's reasonable length
    if (message.length < 200) {
      return message;
    }

    // Fallback for very long error messages
    return 'Authentication failed. Please try again';
  }

  // Handle string errors
  if (typeof error === 'string') {
    return extractAuthErrorMessage(new Error(error));
  }

  // Handle objects with message property
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return extractAuthErrorMessage(new Error(obj.message));
    }
    if (typeof obj.error === 'string') {
      return extractAuthErrorMessage(new Error(obj.error));
    }
  }

  // Fallback
  return 'An unexpected error occurred';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('NetworkError') ||
    message.includes('fetch') ||
    message.includes('Failed to fetch') ||
    message.includes('Network request failed')
  );
}

/**
 * Check if error is a server error
 */
export function isServerError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Server Error') ||
    message.includes('Internal Server Error') ||
    message.includes('500') ||
    message.includes('Request failed')
  );
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('InvalidAccountId') ||
    message.includes('InvalidCredentials') ||
    message.includes('UserNotFound') ||
    message.includes('Unauthorized') ||
    message.includes('401')
  );
}

/**
 * Check if error is a signup-specific error
 */
export function isSignupError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('EmailAlreadyExists') ||
    message.includes('UsernameAlreadyExists') ||
    message.includes('InvalidUsername') ||
    message.includes('UsernameTooShort') ||
    message.includes('UsernameTooLong') ||
    message.includes('PasswordTooWeak')
  );
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Validation failed') ||
    message.includes('Invalid input') ||
    message.includes('InvalidEmail') ||
    message.includes('InvalidUsername') ||
    message.includes('PasswordTooShort') ||
    message.includes('PasswordTooWeak')
  );
}
