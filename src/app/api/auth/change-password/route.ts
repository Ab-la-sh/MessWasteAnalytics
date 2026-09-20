import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { requireAuth } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { changePasswordSchema } from '@/lib/validation/auth';

// POST /api/auth/change-password { currentPassword, newPassword }
// The current session stays valid (JWTs are stateless); other devices' tokens
// expire on their normal schedule.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  // 400, not 401 — a 401 would make the client think the *session* expired.
  if (!ok) throw new ApiHttpError('Current password is incorrect', 400);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  return apiSuccess({ changed: true });
});
