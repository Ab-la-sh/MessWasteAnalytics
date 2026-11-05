import { withWasteCost } from '@/lib/waste-cost';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { correlationQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { buildAnalyticsWhere, pearsonCorrelation } from '@/lib/analytics';
import { formatDateOnly } from '@/lib/date-utils';

// GET /api/analytics/correlation?metric=quantityPrepared|estimatedWasteCost&messId=&dateFrom=&dateTo=&limit=
// Powers "quantity prepared vs waste" (Dashboard) and "estimated food waste cost vs
// waste" (Analytics) as a scatter series, plus the Pearson correlation
// coefficient for the pair. Most recent `limit` records, oldest-plotted-last.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = correlationQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;
  const messId = resolveMessScope(ctx, q.messId ?? null);

  const where = buildAnalyticsWhere(messId, q.dateFrom, q.dateTo);
  const rawRecords = await prisma.wasteRecord.findMany({
    where,
    orderBy: { date: 'desc' },
    take: q.limit,
    select: {
      date: true,
      messId: true,
      mealSlot: true,
      totalWasteKg: true,
      quantityPrepared: true,
      plateWasteKg: true,
      counterWasteKg: true,
      mess: { select: { name: true, code: true } },
    },
  });
  const records = rawRecords.map(withWasteCost).filter((r) => q.metric === 'quantityPrepared' || r.estimatedWasteCost !== null);

  const xOf = (r: (typeof records)[number]) =>
    q.metric === 'quantityPrepared' ? r.quantityPrepared : r.estimatedWasteCost!;

  const xs = records.map(xOf);
  const ys = records.map((r) => (q.metric === 'quantityPrepared' ? r.totalWasteKg : r.foodWasteKg));

  const points = records.map((r) => ({
    date: formatDateOnly(r.date),
    messId: r.messId,
    messName: r.mess.name,
    mealSlot: r.mealSlot,
    x: xOf(r),
    y: (q.metric === 'quantityPrepared' ? r.totalWasteKg : r.foodWasteKg),
  }));

  return apiSuccess({
    metric: q.metric,
    xLabel: q.metric === 'quantityPrepared' ? 'Quantity Prepared' : 'Estimated food waste cost (₹)',
    yLabel: q.metric === 'quantityPrepared' ? 'Total Waste (kg)' : 'Food waste (kg)',
    correlation: pearsonCorrelation(xs, ys),
    sampleSize: points.length,
    points,
  });
});
