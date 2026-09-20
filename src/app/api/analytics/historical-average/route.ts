import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { historicalAverageQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { mean, round2, mealSlotLabel, dayOfWeekLabel } from '@/lib/analytics';
import { dayOfWeekFromDate, weekTypeFromDate, toDateOnly } from '@/lib/date-utils';

// GET /api/analytics/historical-average?messId=&mealSlot=&date=  (or &dayOfWeek=&weekType=)&tags=
// This is the endpoint the Data Collection form calls for its
// "Historical average: similar Monday Lunch meals typically generate
// 18.4 kg of waste" line. Averages past WasteRecords matching the same
// mess × day-of-week × meal-slot × week-type (and, if given, overlapping
// menu tags) — day-of-week × meal slot × week type × mess is exactly the
// historical-average grouping the spec calls for.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = historicalAverageQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;

  const messId = resolveMessScope(ctx, q.messId);
  if (!messId) throw new ApiHttpError('messId is required', 422);

  const dayOfWeek = q.dayOfWeek ?? dayOfWeekFromDate(q.date!);
  const weekType = q.weekType ?? weekTypeFromDate(q.date!);

  const where: Prisma.WasteRecordWhereInput = {
    messId,
    mealSlot: q.mealSlot,
    dayOfWeek,
    weekType,
    ...(q.tags && q.tags.length > 0 ? { tags: { hasSome: q.tags } } : {}),
    // Exclude the day itself when the form is being used to look up the
    // insight for a date that may already have its own record (editing).
    ...(q.date ? { date: { not: toDateOnly(q.date) } } : {}),
  };

  const records = await prisma.wasteRecord.findMany({
    where,
    select: { totalWasteKg: true, wastePerPerson: true, wastePercent: true },
  });

  const dayLabel = dayOfWeekLabel(dayOfWeek);
  const mealLabel = mealSlotLabel(q.mealSlot);

  if (records.length === 0) {
    return apiSuccess({
      messId,
      mealSlot: q.mealSlot,
      dayOfWeek,
      weekType,
      sampleSize: 0,
      averageTotalWasteKg: null,
      averageWastePerPerson: null,
      averageWastePercent: null,
      label: `No historical data yet for similar ${dayLabel} ${mealLabel} meals.`,
    });
  }

  const averageTotalWasteKg = round2(mean(records.map((r) => r.totalWasteKg)));
  const averageWastePerPerson = round2(mean(records.map((r) => r.wastePerPerson)));
  const averageWastePercent = round2(mean(records.map((r) => r.wastePercent)));

  return apiSuccess({
    messId,
    mealSlot: q.mealSlot,
    dayOfWeek,
    weekType,
    sampleSize: records.length,
    averageTotalWasteKg,
    averageWastePerPerson,
    averageWastePercent,
    label: `Historical average: similar ${dayLabel} ${mealLabel} meals typically generate ${averageTotalWasteKg} kg of waste.`,
  });
});
