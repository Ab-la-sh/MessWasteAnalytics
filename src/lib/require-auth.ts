import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { AUTH_COOKIE_NAME, verifyAuthToken } from './auth';
import { prisma } from './prisma';
import { ApiHttpError } from './api-response';

export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  /** null for Admins (unscoped); a mess id for Data Collectors. */
  messId: string | null;
}

/**
 * Reads and verifies the auth cookie, then confirms the user still exists
 * and is active (catches revoked/deactivated accounts even though their
 * JWT hasn't expired yet). Throws ApiHttpError(401) if not authenticated.
 */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) throw new ApiHttpError('Not authenticated', 401);

  const payload = await verifyAuthToken(token);
  if (!payload) throw new ApiHttpError('Invalid or expired session', 401);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw new ApiHttpError('Account not found or deactivated', 401);

  return { userId: user.id, email: user.email, role: user.role, messId: user.messId };
}

/** Throws ApiHttpError(403) unless the authenticated user has one of the allowed roles. */
export function requireRole(ctx: AuthContext, ...allowed: Role[]): void {
  if (!allowed.includes(ctx.role)) {
    throw new ApiHttpError('You do not have permission to perform this action', 403);
  }
}

/**
 * Resolves which mess a request is allowed to act on:
 * - Admins may pass any messId (or none, for combined/all-mess views).
 * - Data Collectors are locked to their own mess; passing a different
 *   messId (or none, where one is required) is a 403.
 */
export function resolveMessScope(ctx: AuthContext, requestedMessId?: string | null): string | null {
  if (ctx.role === 'ADMIN') return requestedMessId ?? null;

  // Data Collector
  if (!ctx.messId) throw new ApiHttpError('Your account is not assigned to a mess', 403);
  if (requestedMessId && requestedMessId !== ctx.messId) {
    throw new ApiHttpError('You can only access your own mess', 403);
  }
  return ctx.messId;
}
