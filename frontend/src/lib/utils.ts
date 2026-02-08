/**
 * Safely extract a user-facing error message from caught values.
 * Use in catch blocks instead of assuming error shape (avoids `any`).
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Something went wrong';
}
