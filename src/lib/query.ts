import { NextRequest } from 'next/server';

/**
 * Converts URLSearchParams into a plain object suitable for zod parsing.
 * Repeated keys (e.g. ?tags=A&tags=B) collapse into an array; single keys
 * stay as strings. zod schemas that expect an array should account for the
 * single-value case (see z.union([...]).transform in the query schemas).
 */
export function searchParamsToObject(req: NextRequest): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of req.nextUrl.searchParams.keys()) {
    const values = req.nextUrl.searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}
