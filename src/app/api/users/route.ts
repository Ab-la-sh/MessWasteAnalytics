import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { requireAuth, requireRole } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { createUserSchema, userQuerySchema } from '@/lib/validation/user';
import { searchParamsToObject } from '@/lib/query';
import { USER_PUBLIC_SELECT } from '@/lib/user-select';

// GET /api/users?role=&messId=&search= — Admin only. Includes deactivated
// accounts (the Settings screen needs to show and reactivate them).
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const parsed = userQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;

  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.messId ? { messId: q.messId } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    select: USER_PUBLIC_SELECT,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  return apiSuccess({ users });
});

// POST /api/users — Admin only. (POST /api/auth/signup still exists for the
// very first bootstrap Admin; this is the everyday path.)
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const { name, email, password, role, messId } = parsed.data;

  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) throw new ApiHttpError('An account with this email already exists', 409);

  if (role === 'DATA_COLLECTOR') {
    const mess = await prisma.mess.findUnique({ where: { id: messId as string } });
    if (!mess) throw new ApiHttpError('Mess not found', 404);
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      messId: role === 'ADMIN' ? null : (messId as string),
    },
    select: USER_PUBLIC_SELECT,
  });

  return apiSuccess({ user }, 201);
});
