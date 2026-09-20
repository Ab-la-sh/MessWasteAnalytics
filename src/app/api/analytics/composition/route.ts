import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { analyticsBaseQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { buildAnalyticsWhere, round2, sum } from '@/lib/analytics';

// GET /api/analytics/composition?messId=&dateFrom=&dateTo=
// Powers the Dashboard's "waste composition (plate/counter/packaging)" chart.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = analyticsBaseQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;
  const messId = resolveMessScope(ctx, q.messId ?? null);

  const where = buildAnalyticsWhere(messId, q.dateFrom, q.dateTo);
  const records = await prisma.wasteRecord.findMany({
    where,
    select: { plateWasteKg: true, counterWasteKg: true, packagingWasteKg: true },
  });

  const plate = round2(sum(records.map((r) => r.plateWasteKg)));
  const counter = round2(sum(records.map((r) => r.counterWasteKg)));
  const packaging = round2(sum(records.map((r) => r.packagingWasteKg)));
  const total = round2(plate + counter + packaging);
  const pct = (v: number) => (total > 0 ? round2((v / total) * 100) : 0);

  return apiSuccess({
    recordCount: records.length,
    totalWasteKg: total,
    composition: [
      { key: 'plate', label: 'Plate Waste', valueKg: plate, percent: pct(plate) },
      { key: 'counter', label: 'Counter/Serving Waste', valueKg: counter, percent: pct(counter) },
      { key: 'packaging', label: 'Packaging Waste', valueKg: packaging, percent: pct(packaging) },
    ],
  });
});
