import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { breakdownQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { buildAnalyticsWhere, aggregateRecords, groupBy } from '@/lib/analytics';
import { MEAL_SLOTS, DAYS_OF_WEEK, WEEK_TYPES, EVENT_TYPES } from '@/lib/constants';

type Dimension = 'mealSlot' | 'dayOfWeek' | 'weekType' | 'eventType';

const DIMENSION_LABEL_LISTS: Record<Dimension, { value: string; label: string }[]> = {
  mealSlot: MEAL_SLOTS,
  dayOfWeek: DAYS_OF_WEEK,
  weekType: WEEK_TYPES,
  eventType: EVENT_TYPES,
};

function labelFor(by: Dimension, value: string): string {
  return DIMENSION_LABEL_LISTS[by].find((o) => o.value === value)?.label ?? value;
}

function dimensionValue(
  r: { mealSlot: string; dayOfWeek: string; weekType: string; eventType: string },
  by: Dimension
): string {
  return r[by];
}

// GET /api/analytics/breakdown?by=mealSlot|dayOfWeek|weekType|eventType&messId=&dateFrom=&dateTo=
// One endpoint for "waste by meal slot" and "waste by day of week" (and, as
// a bonus given the same shape, by week type and by calendar event type) —
// pick the dimension with `by`. Sorted by total waste, highest first.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = breakdownQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;
  const messId = resolveMessScope(ctx, q.messId ?? null);

  const where = buildAnalyticsWhere(messId, q.dateFrom, q.dateTo);
  const records = await prisma.wasteRecord.findMany({
    where,
    select: {
      mealSlot: true,
      dayOfWeek: true,
      weekType: true,
      eventType: true,
      totalWasteKg: true,
      wastePerPerson: true,
      wastePercent: true,
      totalIngredientCost: true,
      headcount: true,
      quantityPrepared: true,
    },
  });

  const groups = groupBy(records, (r) => dimensionValue(r, q.by));
  const breakdown = [...groups.entries()]
    .map(([key, groupRecords]) => ({
      key,
      label: labelFor(q.by, key),
      ...aggregateRecords(groupRecords),
    }))
    .sort((a, b) => b.totalWasteKg - a.totalWasteKg);

  return apiSuccess({ by: q.by, breakdown });
});
