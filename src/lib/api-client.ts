// Thin client-side fetch wrapper for calling this app's own /api routes.
// The auth cookie is httpOnly and same-origin, so no token handling is
// needed here — `credentials: 'include'` (the default for same-origin
// requests) is enough. This just normalizes the { data } / { error } shape
// that every route in src/app/api returns (see src/lib/api-response.ts).

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
}

function buildQueryString(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;

  const res = await fetch(`${path}${buildQueryString(query)}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const errBody = json as { error?: string; details?: unknown } | null;
    throw new ApiError(errBody?.error ?? `Request failed (${res.status})`, res.status, errBody?.details);
  }

  return (json as { data: T }).data;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
