import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { weatherQuerySchema } from '@/lib/validation/weather';
import { searchParamsToObject } from '@/lib/query';
import { toDateOnly } from '@/lib/date-utils';
import { getOrFetchWeather } from '@/lib/weather';

// GET /api/weather?messId=&date=YYYY-MM-DD
// Backs the Data Collection form's read-only, auto-filled temperature and
// rainfall fields. Always returns 200 — a failed upstream fetch is reported
// via `fetchFailed: true` (not an HTTP error) so the form can show its
// fallback state instead of blocking the coordinator from submitting.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = weatherQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const { messId: requestedMessId, date: dateStr } = parsed.data;

  const messId = resolveMessScope(ctx, requestedMessId);
  if (!messId) throw new ApiHttpError('messId is required', 422);

  const mess = await prisma.mess.findUnique({ where: { id: messId } });
  if (!mess) throw new ApiHttpError('Mess not found', 404);

  const date = toDateOnly(dateStr);
  const { weather, fromCache, fetchFailed } = await getOrFetchWeather(mess, date);

  return apiSuccess({
    weather: weather
      ? {
          temperatureC: weather.temperatureMeanC,
          temperatureMaxC: weather.temperatureMaxC,
          temperatureMinC: weather.temperatureMinC,
          rainfallMm: weather.rainMm,
          precipitationMm: weather.precipitationMm,
          humidityPercent: weather.humidityPercent,
          source: weather.source,
        }
      : null,
    fromCache,
    fetchFailed,
  });
});
