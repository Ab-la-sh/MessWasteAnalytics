import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { trendsQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { buildAnalyticsWhere, buildTrendSeries, groupBy } from '@/lib/analytics';

// GET /api/analytics/trends?messId=&granularity=daily|weekly|monthly&dateFrom=&dateTo=&splitByMess=true
// Powers the Dashboard's "waste trend over time" chart and the Analytics
// page's daily/weekly/monthly trend view.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = trendsQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;
  const messId = resolveMessScope(ctx, q.messId ?? null);

  const where = buildAnalyticsWhere(messId, q.dateFrom, q.dateTo);
  const records = await prisma.wasteRecord.findMany({
    where,
    orderBy: { date: 'asc' },
    select: {
      date: true,
      messId: true,
      totalWasteKg: true,
      wastePerPerson: true,
      wastePercent: true,
      totalIngredientCost: true,
      headcount: true,
      quantityPrepared: true,
      mess: { select: { name: true } },
    },
  });

  const series = buildTrendSeries(records, q.granularity);

  // splitByMess only makes sense (and is only honoured) for the combined
  // view — a Data Collector or a request already scoped to one mess has
  // nothing to split.
  let byMess: { messId: string; messName: string; series: ReturnType<typeof buildTrendSeries> }[] | undefined;
  if (q.splitByMess && !messId) {
    const grouped = groupBy(records, (r) => r.messId);
    byMess = [...grouped.entries()].map(([mId, messRecords]) => ({
      messId: mId,
      messName: messRecords[0].mess.name,
      series: buildTrendSeries(messRecords, q.granularity),
    }));
  }

  return apiSuccess({ granularity: q.granularity, series, ...(byMess ? { byMess } : {}) });
});
