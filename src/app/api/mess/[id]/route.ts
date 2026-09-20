import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { updateMessSchema } from '@/lib/validation/mess';

interface Params {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  await requireAuth(req);

  const mess = await prisma.mess.findUnique({ where: { id: params.id } });
  if (!mess) throw new ApiHttpError('Mess not found', 404);

  return apiSuccess({ mess });
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = updateMessSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }

  const existing = await prisma.mess.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('Mess not found', 404);

  if (parsed.data.code && parsed.data.code !== existing.code) {
    const codeTaken = await prisma.mess.findUnique({ where: { code: parsed.data.code } });
    if (codeTaken) throw new ApiHttpError('A mess with this code already exists', 409);
  }

  const mess = await prisma.mess.update({ where: { id: params.id }, data: parsed.data });
  return apiSuccess({ mess });
});

// Deleting a mess cascades to its MenuSlots and WasteRecords (schema
// `onDelete: Cascade`) — that is destructive, so prefer deactivating
// (`PATCH { isActive: false }`) unless the mess truly has no history to
// preserve. We still expose hard delete for completeness/admin cleanup.
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const existing = await prisma.mess.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('Mess not found', 404);

  await prisma.mess.delete({ where: { id: params.id } });
  return apiSuccess({ deleted: true });
});
