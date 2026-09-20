import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { requireAuth, requireRole } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { signupSchema } from '@/lib/validation/auth';

// User creation is Admin-only ("Admin: manage users..."). The one exception
// is bootstrapping: if the users table is completely empty (fresh DB, before
// the seed script has run), the very first signup is allowed through
// unauthenticated so there's a way to create the first Admin account at all.
// Every signup after that requires a valid Admin session.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const { email, password, name, role, messId } = parsed.data;

  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0) {
    const ctx = await requireAuth(req);
    requireRole(ctx, 'ADMIN');
  } else if (role !== 'ADMIN') {
    throw new ApiHttpError('The first account created must be an Admin', 422);
  }

  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    throw new ApiHttpError('An account with this email already exists', 409);
  }

  if (role === 'DATA_COLLECTOR' && messId) {
    const mess = await prisma.mess.findUnique({ where: { id: messId } });
    if (!mess) throw new ApiHttpError('Mess not found', 404);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
      messId: role === 'ADMIN' ? null : messId,
    },
    select: { id: true, email: true, name: true, role: true, messId: true, createdAt: true },
  });

  return apiSuccess({ user }, 201);
});
