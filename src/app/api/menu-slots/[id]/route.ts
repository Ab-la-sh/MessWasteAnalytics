import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { updateMenuSlotSchema } from '@/lib/validation/menu-slot';

interface Params {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);

  const menuSlot = await prisma.menuSlot.findUnique({
    where: { id: params.id },
    include: { mess: { select: { id: true, name: true, code: true } } },
  });
  if (!menuSlot) throw new ApiHttpError('Menu slot not found', 404);

  resolveMessScope(ctx, menuSlot.messId); // 403s a Data Collector viewing another mess

  return apiSuccess({ menuSlot });
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = updateMenuSlotSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const data = parsed.data;

  const existing = await prisma.menuSlot.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('Menu slot not found', 404);

  const nextMessId = data.messId ?? existing.messId;
  const nextWeekType = data.weekType ?? existing.weekType;
  const nextDayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;
  const nextMealSlot = data.mealSlot ?? existing.mealSlot;

  const identityChanged =
    nextMessId !== existing.messId ||
    nextWeekType !== existing.weekType ||
    nextDayOfWeek !== existing.dayOfWeek ||
    nextMealSlot !== existing.mealSlot;

  if (identityChanged) {
    const conflict = await prisma.menuSlot.findUnique({
      where: {
        messId_weekType_dayOfWeek_mealSlot: {
          messId: nextMessId,
          weekType: nextWeekType,
          dayOfWeek: nextDayOfWeek,
          mealSlot: nextMealSlot,
        },
      },
    });
    if (conflict && conflict.id !== existing.id) {
      throw new ApiHttpError('A menu slot already exists for this mess/week type/day/meal', 409);
    }
  }

  const menuSlot = await prisma.menuSlot.update({ where: { id: params.id }, data });
  return apiSuccess({ menuSlot });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const existing = await prisma.menuSlot.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiHttpError('Menu slot not found', 404);

  // WasteRecord.menuSlotId is a nullable, non-cascading relation, so
  // existing records simply lose the reference rather than being deleted.
  await prisma.menuSlot.delete({ where: { id: params.id } });
  return apiSuccess({ deleted: true });
});
