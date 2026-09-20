'use client';

// Small data-fetching hook for GET endpoints. Re-fetches whenever `path` or
// the (serialised) `query` changes, ignores out-of-order responses, and keeps
// the previous `data` on screen while a new request is in flight so tables and
// charts can dim instead of flashing back to a skeleton on every filter change.
//
// Pass `query = null` to disable the request (e.g. while waiting on another
// value the query depends on).

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

export type ApiQuery = Record<string, string | number | boolean | string[] | undefined | null>;

export interface UseApiResult<T> {
  data: T | null;
  /** True while a request is in flight (data may still hold the previous result). */
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useApi<T>(path: string, query: ApiQuery | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(query !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // JSON.stringify drops `undefined` values, so { messId: undefined } and {}
  // produce the same key and never trigger a redundant refetch.
  const key = query === null ? null : JSON.stringify(query);

  useEffect(() => {
    if (key === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<T>(path, JSON.parse(key) as ApiQuery)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Request failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
