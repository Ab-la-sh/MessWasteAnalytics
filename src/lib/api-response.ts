import { NextResponse } from 'next/server';

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/** Wraps a route handler so unexpected throws become clean 500s instead of crashing. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiHttpError) {
        return apiError(err.message, err.status, err.details);
      }
      // eslint-disable-next-line no-console
      console.error('[api] unhandled error:', err);
      return apiError('Internal server error', 500);
    }
  };
}

/** Throw this from anywhere in a route/service to short-circuit with a specific status. */
export class ApiHttpError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
