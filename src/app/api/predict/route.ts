import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling, ApiHttpError } from '@/lib/api-response';
import { predictQuerySchema } from '@/lib/validation/prediction';
import { searchParamsToObject } from '@/lib/query';
import { toDateOnly, dayOfWeekFromDate, weekTypeFromDate } from '@/lib/date-utils';
import { getOrFetchWeather } from '@/lib/weather';
import { predictWaste, eventTypeFromCalendar, type PredictionSample } from '@/lib/prediction';

/**
 * How much history the model looks at. Recency weighting already fades old
 * records out, so this is a performance ceiling rather than a modelling
 * choice — 500 records is comfortably more than a year of one mess's meals.
 */
const MAX_SAMPLES = 500;

// GET /api/predict?messId=&date=&mealSlot=[&headcount=&eventType=&scheduleDeviation=]
//
// Predicted waste for a single meal, with the reasoning exposed: which
// historical grouping the base level came from, how many records back it,
// and every adjustment that was applied. The Data Collection form calls this
// live as the coordinator fills the form in, and the Dashboard's prediction
// card calls the forecast variant (./forecast) for the week ahead.
//
// Only records dated strictly BEFORE the target are used, so asking for a
// prediction on a date that already has a record gives the number the model
// would have produced beforehand — that's what makes back-testing it
// meaningful instead of circular.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = predictQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;

  const messId = resolveMessScope(ctx, q.messId);
  if (!messId) throw new ApiHttpError('messId is required', 422);

  const mess = await prisma.mess.findUnique({ where: { id: messId } });
  if (!mess) throw new ApiHttpError('Mess not found', 404);

  const date = toDateOnly(q.date);
  const dayOfWeek = dayOfWeekFromDate(date);
  const weekType = weekTypeFromDate(date);

  // Target context: the scheduled menu for this slot, the cached/fetched
  // weather, and the academic calendar — all things the coordinator
  // shouldn't have to tell us.
  const [rows, menuSlot, calendarDay, weatherResult] = await Promise.all([
    prisma.wasteRecord.findMany({
      where: { messId, date: { lt: date } },
      orderBy: { date: 'desc' },
      take: MAX_SAMPLES,
      select: {
        date: true,
        mealSlot: true,
        dayOfWeek: true,
        weekType: true,
        eventType: true,
        headcount: true,
        totalWasteKg: true,
        wastePerPerson: true,
        temperatureC: true,
        rainfallMm: true,
        scheduleDeviation: true,
        menuSlot: { select: { hasBiryani: true, hasPaneer: true, hasDessert: true } },
      },
    }),
    prisma.menuSlot.findUnique({
      where: {
        messId_weekType_dayOfWeek_mealSlot: { messId, weekType, dayOfWeek, mealSlot: q.mealSlot },
      },
      select: { hasBiryani: true, hasPaneer: true, hasDessert: true, itemCount: true, pctGravyDishes: true },
    }),
    prisma.calendarDay.findUnique({ where: { date } }),
    getOrFetchWeather(mess, date),
  ]);

  const samples: PredictionSample[] = rows.map((r) => ({
    date: r.date,
    mealSlot: r.mealSlot,
    dayOfWeek: r.dayOfWeek,
    weekType: r.weekType,
    eventType: r.eventType,
    headcount: r.headcount,
    totalWasteKg: r.totalWasteKg,
    wastePerPerson: r.wastePerPerson,
    temperatureC: r.temperatureC,
    rainfallMm: r.rainfallMm,
    scheduleDeviation: r.scheduleDeviation,
    menuFlags: r.menuSlot
      ? {
          hasBiryani: r.menuSlot.hasBiryani,
          hasPaneer: r.menuSlot.hasPaneer,
          hasDessert: r.menuSlot.hasDessert,
        }
      : null,
  }));

  // An explicit eventType from the form wins (the coordinator is looking at
  // the day); otherwise fall back to what the academic calendar says.
  const eventType = q.eventType ?? eventTypeFromCalendar(calendarDay);

  const prediction = predictWaste(samples, {
    date,
    mealSlot: q.mealSlot,
    dayOfWeek,
    weekType,
    eventType,
    temperatureC: weatherResult.weather?.temperatureMeanC ?? null,
    rainfallMm: weatherResult.weather?.rainMm ?? null,
    scheduleDeviation: q.scheduleDeviation,
    menuFlags: menuSlot
      ? {
          hasBiryani: menuSlot.hasBiryani,
          hasPaneer: menuSlot.hasPaneer,
          hasDessert: menuSlot.hasDessert,
        }
      : null,
    headcount: q.headcount ?? null,
  });

  return apiSuccess({
    messId,
    date: q.date,
    mealSlot: q.mealSlot,
    dayOfWeek,
    weekType,
    eventType,
    historySize: samples.length,
    scheduledMenu: menuSlot
      ? { itemCount: menuSlot.itemCount, pctGravyDishes: menuSlot.pctGravyDishes }
      : null,
    prediction,
    // Null prediction is a legitimate, expected answer for a brand-new mess —
    // the client shows an empty state rather than treating it as an error.
    message: prediction ? undefined : 'Not enough history at this mess to predict yet.',
  });
});
