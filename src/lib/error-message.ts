import { ApiError } from '@/lib/api-client';

/**
 * Turns anything thrown by the API client into one readable line for a toast
 * or inline error. Validation failures (422) carry zod's flattened
 * `{ fieldErrors, formErrors }` in `details`; surface the first concrete
 * message instead of the generic "Invalid request".
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    const d = err.details as
      | { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] }
      | null
      | undefined;
    if (d?.fieldErrors) {
      for (const messages of Object.values(d.fieldErrors)) {
        if (messages && messages.length > 0) return messages[0];
      }
    }
    if (d?.formErrors && d.formErrors.length > 0) return d.formErrors[0];
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}
