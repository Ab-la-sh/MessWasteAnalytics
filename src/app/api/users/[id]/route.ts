import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { requireAuth, requireRole } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { updateUserSchema } from '@/lib/validation/user';
import { USER_PUBLIC_SELECT } from '@/lib/user-select';

interface Params {
  params: { id: string };
}

/** How many *other* active Admins exist — used to stop the last one being removed. */
async function otherActiveAdmins(excludeUserId: string): Promise<number> {
  return prisma.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: excludeUserId } } });
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const user = await prisma.user.findUnique({ where: { id: params.id }, select: USER_PUBLIC_SELECT });
  if (!user) throw new ApiHttpError('User not found', 404);
  return apiSuccess({ user });
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const input = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('User not found', 404);

  const isSelf = existing.id === ctx.userId;
  const nextRole = input.role ?? existing.role;
  const nextActive = input.isActive ?? existing.isActive;

  // Self-lockout guards: an Admin can't demote or deactivate their own account.
  if (isSelf && nextRole !== existing.role) {
    throw new ApiHttpError("You can't change your own role", 409);
  }
  if (isSelf && nextActive === false) {
    throw new ApiHttpError("You can't deactivate your own account", 409);
  }

  // Never leave the system without an active Admin.
  const losesAdminAccess =
    existing.role === 'ADMIN' && existing.isActive && (nextRole !== 'ADMIN' || nextActive === false);
  if (losesAdminAccess && (await otherActiveAdmins(existing.id)) === 0) {
    throw new ApiHttpError('At least one active Admin must remain', 409);
  }

  // Mess assignment: Admins are never scoped; Data Collectors always are.
  let nextMessId: string | null;
  if (nextRole === 'ADMIN') {
    nextMessId = null;
  } else {
    nextMessId = input.messId !== undefined ? input.messId : existing.messId;
    if (!nextMessId) throw new ApiHttpError('A Data Collector must be assigned to a mess', 422);
    if (nextMessId !== existing.messId) {
      const mess = await prisma.mess.findUnique({ where: { id: nextMessId } });
      if (!mess) throw new ApiHttpError('Mess not found', 404);
    }
  }

  if (input.email && input.email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: input.email } });
    if (emailTaken) throw new ApiHttpError('An account with this email already exists', 409);
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      role: nextRole,
      messId: nextMessId,
      isActive: nextActive,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    select: USER_PUBLIC_SELECT,
  });

  return apiSuccess({ user });
});

// Hard delete is only allowed for accounts that never touched any data —
// WasteRecord.createdById/updatedById point at users, so removing a
// collector with history would either fail or erase the audit trail.
// Everything else should be deactivated (PATCH { isActive: false }).
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('User not found', 404);

  if (existing.id === ctx.userId) {
    throw new ApiHttpError("You can't delete your own account", 409);
  }
  if (existing.role === 'ADMIN' && existing.isActive && (await otherActiveAdmins(existing.id)) === 0) {
    throw new ApiHttpError('At least one active Admin must remain', 409);
  }

  const touched = await prisma.wasteRecord.count({
    where: { OR: [{ createdById: existing.id }, { updatedById: existing.id }] },
  });
  if (touched > 0) {
    throw new ApiHttpError(
      `This user has created or edited ${touched} record${touched === 1 ? '' : 's'} — deactivate the account instead of deleting it`,
      409
    );
  }

  await prisma.user.delete({ where: { id: params.id } });
  return apiSuccess({ deleted: true });
});
