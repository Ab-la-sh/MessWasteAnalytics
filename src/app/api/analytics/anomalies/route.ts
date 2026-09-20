import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { anomaliesQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { buildAnalyticsWhere } from '@/lib/analytics';
import { detectAnomalies, ANOMALY_SELECT } from '@/lib/anomaly';

// GET /api/analytics/anomalies?messId=&dateFrom=&dateTo=&thresholdStdDev=&limit=
//
// High-waste pattern detection. The detection itself lives in
// src/lib/anomaly.ts (extracted in Phase 8) so this route and the
// notifications bell run the identical computation — see that file for how
// the (mess, meal slot) baseline and z-score threshold work.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = anomaliesQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;
  const messId = resolveMessScope(ctx, q.messId ?? null);

  const records = await prisma.wasteRecord.findMany({
    where: buildAnalyticsWhere(messId, q.dateFrom, q.dateTo),
    select: ANOMALY_SELECT,
  });

  const anomalies = detectAnomalies(records, { thresholdStdDev: q.thresholdStdDev });

  return apiSuccess({
    thresholdStdDev: q.thresholdStdDev,
    count: anomalies.length,
    anomalies: anomalies.slice(0, q.limit),
  });
});
