import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { updateProfileSchema } from '@/lib/validation/auth';

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  messId: true,
  mess: { select: { id: true, name: true, code: true } },
  createdAt: true,
} as const;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: ME_SELECT,
  });

  return apiSuccess({ user });
});

// PATCH /api/auth/me — a user editing their own display name. Email, role and
// mess assignment are Admin-only (PATCH /api/users/:id).
export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const body = await req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }

  const user = await prisma.user.update({
    where: { id: ctx.userId },
    data: { name: parsed.data.name },
    select: ME_SELECT,
  });

  return apiSuccess({ user });
});
