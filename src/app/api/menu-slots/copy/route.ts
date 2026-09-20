import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { copyMenuSchema } from '@/lib/validation/menu-slot';

// POST /api/menu-slots/copy — Admin only.
// Copies every scheduled slot of (fromMess, fromWeekType) onto
// (toMess, toWeekType): "Week A → Week B" within a mess, or "use Mess 1's
// menu for Mess 2". Runs in one transaction so a failure can't leave a
// half-copied week. Existing target slots are skipped unless `overwrite` is
// true; slots the source doesn't have are never touched or deleted.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);
  requireRole(ctx, 'ADMIN');

  const body = await req.json().catch(() => null);
  const parsed = copyMenuSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request', 422, parsed.error.flatten());
  }
  const { fromMessId, fromWeekType, toMessId, toWeekType, overwrite } = parsed.data;

  const [fromMess, toMess] = await Promise.all([
    prisma.mess.findUnique({ where: { id: fromMessId } }),
    prisma.mess.findUnique({ where: { id: toMessId } }),
  ]);
  if (!fromMess || !toMess) throw new ApiHttpError('Mess not found', 404);

  const sources = await prisma.menuSlot.findMany({
    where: { messId: fromMessId, weekType: fromWeekType },
  });
  if (sources.length === 0) {
    throw new ApiHttpError('The source schedule has no menu slots to copy', 422);
  }

  const targets = await prisma.menuSlot.findMany({
    where: { messId: toMessId, weekType: toWeekType },
    select: { id: true, dayOfWeek: true, mealSlot: true },
  });
  const targetByKey = new Map(targets.map((t) => [`${t.dayOfWeek}|${t.mealSlot}`, t.id]));

  const toCreate: (typeof sources)[number][] = [];
  const toUpdate: { id: string; source: (typeof sources)[number] }[] = [];
  let skipped = 0;

  for (const src of sources) {
    const existingId = targetByKey.get(`${src.dayOfWeek}|${src.mealSlot}`);
    if (!existingId) toCreate.push(src);
    else if (overwrite) toUpdate.push({ id: existingId, source: src });
    else skipped += 1;
  }

  // The fields that make up a slot's *content* (identity fields are set separately).
  const content = (s: (typeof sources)[number]) => ({
    itemCount: s.itemCount,
    pctGravyDishes: s.pctGravyDishes,
    hasBiryani: s.hasBiryani,
    hasPaneer: s.hasPaneer,
    hasEggBreakfast: s.hasEggBreakfast,
    hasDessert: s.hasDessert,
    hasDosa: s.hasDosa,
    hasParatha: s.hasParatha,
    tags: s.tags,
    notes: s.notes,
  });

  await prisma.$transaction([
    prisma.menuSlot.createMany({
      data: toCreate.map((s) => ({
        messId: toMessId,
        weekType: toWeekType,
        dayOfWeek: s.dayOfWeek,
        mealSlot: s.mealSlot,
        ...content(s),
      })),
    }),
    ...toUpdate.map(({ id, source }) => prisma.menuSlot.update({ where: { id }, data: content(source) })),
  ]);

  return apiSuccess({
    created: toCreate.length,
    updated: toUpdate.length,
    skipped,
    total: sources.length,
  });
});
