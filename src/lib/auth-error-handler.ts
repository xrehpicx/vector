/**
 * Utility for handling Convex Auth errors and extracting user-friendly messages
 */

export interface AuthError {
  message: string;
  code?: string;
  status?: number;
}

/**
 * Extract user-friendly error message from Convex Auth errors
 */
export function extractAuthErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (!error) {
    return "An unexpected error occurred";
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;

    // Common Convex Auth error patterns
    if (message.includes("InvalidAccountId")) {
      return "Invalid email or password";
    }

    if (message.includes("InvalidCredentials")) {
      return "Invalid email or password";
    }

    if (message.includes("UserNotFound")) {
      return "Account not found. Please check your email or sign up";
    }

    if (message.includes("EmailAlreadyExists")) {
      return "An account with this email already exists";
    }

    if (message.includes("PasswordTooShort")) {
      return "Password must be at least 8 characters long";
    }

    if (message.includes("InvalidEmail")) {
      return "Please enter a valid email address";
    }

    if (message.includes("NetworkError") || message.includes("fetch")) {
      return "Network error. Please check your connection and try again";
    }

    if (message.includes("Request failed") || message.includes("500")) {
      return "Server error. Please try again later";
    }

    if (message.includes("Unauthorized") || message.includes("401")) {
      return "Invalid email or password";
    }

    if (message.includes("Forbidden") || message.includes("403")) {
      return "Access denied";
    }

    if (message.includes("Not Found") || message.includes("404")) {
      return "Service not found. Please try again later";
    }

    // Handle generic server errors
    if (
      message.includes("Server Error") ||
      message.includes("Internal Server Error")
    ) {
      return "Server error. Please try again later";
    }

    // Handle stack traces - extract just the first meaningful line
    if (message.includes("at ")) {
      const lines = message.split("\n");
      const firstLine = lines[0].trim();
      if (firstLine && !firstLine.includes("at ")) {
        return firstLine;
      }
    }

    // Return the error message if it's reasonable length
    if (message.length < 200) {
      return message;
    }

    // Fallback for very long error messages
    return "Authentication failed. Please try again";
  }

  // Handle string errors
  if (typeof error === "string") {
    return extractAuthErrorMessage(new Error(error));
  }

  // Handle objects with message property
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") {
      return extractAuthErrorMessage(new Error(obj.message));
    }
    if (typeof obj.error === "string") {
      return extractAuthErrorMessage(new Error(obj.error));
    }
  }

  // Fallback
  return "An unexpected error occurred";
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("NetworkError") ||
    message.includes("fetch") ||
    message.includes("Failed to fetch") ||
    message.includes("Network request failed")
  );
}

/**
 * Check if error is a server error
 */
export function isServerError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Server Error") ||
    message.includes("Internal Server Error") ||
    message.includes("500") ||
    message.includes("Request failed")
  );
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("InvalidAccountId") ||
    message.includes("InvalidCredentials") ||
    message.includes("UserNotFound") ||
    message.includes("Unauthorized") ||
    message.includes("401")
  );
}
