import { toast } from "@/hooks/use-toast";

type ToastSeverity = "success" | "error" | "warning";

interface ShowToastOptions {
  title: string;
  description?: string;
  severity?: ToastSeverity;
  duration?: number;
}

/**
 * Centralized toast helper for consistent user-facing feedback
 * Replaces console.error/warn with visible toast notifications
 */
export function showToast({
  title,
  description,
  severity = "success",
  duration,
}: ShowToastOptions) {
  const variant = severity === "error" ? "destructive" : "default";
  
  // Add emoji prefix based on severity for quick visual recognition
  const prefix = severity === "success" ? "✓" : severity === "error" ? "✗" : "⚠";
  
  toast({
    title: `${prefix} ${title}`,
    description,
    variant,
    duration,
  });
}

/**
 * Show success toast
 */
export function showSuccess(title: string, description?: string) {
  showToast({ title, description, severity: "success" });
}

/**
 * Show error toast - use for operation failures
 */
export function showError(title: string, description?: string) {
  showToast({ title, description, severity: "error" });
}

/**
 * Show warning toast - use for non-blocking issues
 */
export function showWarning(title: string, description?: string) {
  showToast({ title, description, severity: "warning" });
}

/**
 * Handle and display Supabase/network errors with user-friendly messages
 * @param error - The error object from a catch block
 * @param context - What operation failed (e.g., "loading vault", "saving publication")
 * @param silent - If true, only log to console, don't show toast (for background operations)
 */
export function handleError(
  error: unknown,
  context: string,
  silent = false
): string {
  let message = "An unexpected error occurred";
  
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "message" in error) {
    message = String((error as { message: unknown }).message);
  }
  
  // Map common Supabase error codes to user-friendly messages
  const friendlyMessages: Record<string, string> = {
    "PGRST116": "The requested data was not found.",
    "PGRST301": "You don't have permission to access this resource.",
    "23505": "This item already exists.",
    "23503": "Cannot delete - this item is referenced elsewhere.",
    "JWT expired": "Your session has expired. Please sign in again.",
    "Failed to fetch": "Network error. Please check your connection.",
    "NetworkError": "Network error. Please check your connection.",
  };
  
  // Check if any known error code/message is in the error
  for (const [key, friendly] of Object.entries(friendlyMessages)) {
    if (message.includes(key)) {
      message = friendly;
      break;
    }
  }
  
  // Log to console for debugging
  console.error(`[${context}]`, error);
  
  // Show toast unless silent
  if (!silent) {
    showError(`Error ${context}`, message);
  }
  
  return message;
}

/**
 * Wrap an async operation with automatic error handling
 * @param operation - The async function to execute
 * @param context - What operation this is (for error messages)
 * @param options - Additional options
 * @returns The result of the operation, or undefined on error
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  options: { silent?: boolean; onSuccess?: string } = {}
): Promise<T | undefined> {
  try {
    const result = await operation();
    if (options.onSuccess) {
      showSuccess(options.onSuccess);
    }
    return result;
  } catch (error) {
    handleError(error, context, options.silent);
    return undefined;
  }
}
