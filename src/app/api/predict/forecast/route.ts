import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { forecastQuerySchema } from '@/lib/validation/prediction';
import { searchParamsToObject } from '@/lib/query';
import {
  toDateOnly,
  addDaysUTC,
  formatDateOnly,
  dayOfWeekFromDate,
  weekTypeFromDate,
} from '@/lib/date-utils';
import { round2, dayOfWeekLabel } from '@/lib/analytics';
import { MEAL_SLOTS } from '@/lib/constants';
import {
  predictWaste,
  seasonalWeather,
  eventTypeFromCalendar,
  type PredictionSample,
  type PredictionConfidence,
  type CalendarContext,
  type MenuFlags,
} from '@/lib/prediction';

/** The calendar fields the forecast needs, beyond what CalendarContext covers. */
type ForecastCalendarDay = CalendarContext & { holidayName: string | null; eventName: string | null };

/** A MenuSlot row reduced to the flags the model uses, plus its grid position. */
type MenuFlagRow = MenuFlags & { weekType: string; dayOfWeek: string; mealSlot: string };

const MAX_SAMPLES_PER_MESS = 500;

// GET /api/predict/forecast?messId=&days=7
//
// The week ahead, per day and per meal slot. Backs the Dashboard's
// "AI Waste Prediction" card (which replaced the Coming Soon placeholder in
// Phase 8).
//
// Two deliberate choices worth knowing about:
//
//   - The forecast starts the day AFTER the newest record in scope, not
//     after today's real date. This dataset is a fixed historical year, so
//     anchoring to the wall clock would forecast a window nine months past
//     the last thing we know about and produce a flat, useless chart. Same
//     convention the Dashboard KPIs and Analytics presets already use.
//
//   - Weather for forecast days comes from the SEASONAL NORMAL of cached
//     WeatherDaily rows, not from a live Open-Meteo call. Fetching would mean
//     up to days x messes API calls on every dashboard load for dates the
//     forecast endpoint often can't serve anyway; the month-of-year average
//     is both free and, for a monsoon climate, a better default.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = forecastQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;

  const messId = resolveMessScope(ctx, q.messId ?? null);

  const messes = await prisma.mess.findMany({
    where: { ...(messId ? { id: messId } : { isActive: true }) },
    select: { id: true, name: true },
    orderBy: { code: 'asc' },
  });

  if (messes.length === 0) {
    return apiSuccess({ ...emptyForecast(q.days), message: 'No mess selected.' });
  }

  // Anchor: the newest record anywhere in scope.
  const latest = await prisma.wasteRecord.findFirst({
    where: { ...(messId ? { messId } : {}) },
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  if (!latest) {
    return apiSuccess({
      ...emptyForecast(q.days),
      message: 'No records yet — submit some entries before the forecast can run.',
    });
  }

  const startDate = addDaysUTC(latest.date, 1);
  const dates: Date[] = [];
  for (let i = 0; i < q.days; i++) dates.push(addDaysUTC(startDate, i));

  // Calendar is institution-wide, so one lookup covers every mess.
  const calendarDays = await prisma.calendarDay.findMany({
    where: { date: { in: dates } },
    select: { date: true, isHoliday: true, isExamWeek: true, isQuizWeek: true, isMajorEvent: true, holidayName: true, eventName: true },
  });
  const calendarByDate = new Map<string, ForecastCalendarDay>(
    calendarDays.map((d: ForecastCalendarDay & { date: Date }) => [formatDateOnly(d.date), d] as const)
  );

  // Per-mess history + cached weather, fetched in parallel across messes.
  const perMess = await Promise.all(
    messes.map(async (mess) => {
      const [rows, weatherRows] = await Promise.all([
        prisma.wasteRecord.findMany({
          where: { messId: mess.id },
          orderBy: { date: 'desc' },
          take: MAX_SAMPLES_PER_MESS,
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
        prisma.weatherDaily.findMany({
          where: { messId: mess.id },
          select: { date: true, temperatureMeanC: true, rainMm: true },
        }),
      ]);

      const menuSlots = await prisma.menuSlot.findMany({
        where: { messId: mess.id },
        select: {
          weekType: true,
          dayOfWeek: true,
          mealSlot: true,
          hasBiryani: true,
          hasPaneer: true,
          hasDessert: true,
        },
      });

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
          ? { hasBiryani: r.menuSlot.hasBiryani, hasPaneer: r.menuSlot.hasPaneer, hasDessert: r.menuSlot.hasDessert }
          : null,
      }));

      const menuByKey = new Map<string, MenuFlags>(
        menuSlots.map((m: MenuFlagRow) => [
          `${m.weekType}|${m.dayOfWeek}|${m.mealSlot}`,
          { hasBiryani: m.hasBiryani, hasPaneer: m.hasPaneer, hasDessert: m.hasDessert },
        ] as const)
      );

      return { mess, samples, weatherRows, menuByKey };
    })
  );

  // ---------------------------------------------------------------------
  // Predict every (mess, date, meal slot), then roll up.
  // ---------------------------------------------------------------------

  const dailyTotals = new Map<string, { kg: number; low: number; high: number; byMeal: Map<string, number> }>();
  const messTotals = new Map<string, number>();
  const confidences: PredictionConfidence[] = [];

  for (const { mess, samples, weatherRows, menuByKey } of perMess) {
    if (samples.length === 0) continue;

    for (const date of dates) {
      const iso = formatDateOnly(date);
      const dayOfWeek = dayOfWeekFromDate(date);
      const weekType = weekTypeFromDate(date);
      const weather = seasonalWeather(weatherRows, date);
      const eventType = eventTypeFromCalendar(calendarByDate.get(iso));

      for (const slot of MEAL_SLOTS) {
        const prediction = predictWaste(samples, {
          date,
          mealSlot: slot.value,
          dayOfWeek,
          weekType,
          eventType,
          temperatureC: weather.temperatureC,
          rainfallMm: weather.rainfallMm,
          scheduleDeviation: false,
          menuFlags: menuByKey.get(`${weekType}|${dayOfWeek}|${slot.value}`) ?? null,
          headcount: null,
        });
        if (!prediction) continue;

        confidences.push(prediction.confidence);

        const bucket =
          dailyTotals.get(iso) ?? { kg: 0, low: 0, high: 0, byMeal: new Map<string, number>() };
        bucket.kg += prediction.predictedTotalWasteKg;
        bucket.low += prediction.rangeLowKg;
        bucket.high += prediction.rangeHighKg;
        bucket.byMeal.set(slot.value, (bucket.byMeal.get(slot.value) ?? 0) + prediction.predictedTotalWasteKg);
        dailyTotals.set(iso, bucket);

        messTotals.set(mess.id, (messTotals.get(mess.id) ?? 0) + prediction.predictedTotalWasteKg);
      }
    }
  }

  const daily = dates.map((date) => {
    const iso = formatDateOnly(date);
    const bucket = dailyTotals.get(iso);
    const cal = calendarByDate.get(iso);
    return {
      date: iso,
      dayOfWeek: dayOfWeekFromDate(date),
      label: dayOfWeekLabel(dayOfWeekFromDate(date)).slice(0, 3),
      predictedKg: round2(bucket?.kg ?? 0),
      rangeLowKg: round2(bucket?.low ?? 0),
      rangeHighKg: round2(bucket?.high ?? 0),
      eventType: eventTypeFromCalendar(cal),
      eventName: cal?.holidayName ?? cal?.eventName ?? null,
      byMeal: MEAL_SLOTS.map((slot) => ({
        mealSlot: slot.value,
        label: slot.label,
        predictedKg: round2(bucket?.byMeal.get(slot.value) ?? 0),
      })),
    };
  });

  const totalPredictedKg = round2(daily.reduce((acc, d) => acc + d.predictedKg, 0));

  return apiSuccess({
    startDate: formatDateOnly(startDate),
    anchorDate: formatDateOnly(latest.date),
    days: q.days,
    totalPredictedKg,
    avgPerDayKg: daily.length ? round2(totalPredictedKg / daily.length) : 0,
    confidence: overallConfidence(confidences),
    daily,
    byMess: messes
      .map((m) => ({ messId: m.id, messName: m.name, predictedKg: round2(messTotals.get(m.id) ?? 0) }))
      .filter((m) => m.predictedKg > 0),
    message: totalPredictedKg > 0 ? undefined : 'Not enough history to forecast yet.',
  });
});

/**
 * The whole forecast is only as trustworthy as its weakest parts, so this
 * takes the modal confidence and caps it at "medium" if any meaningful share
 * of the individual predictions fell back to a thin baseline.
 */
function overallConfidence(all: PredictionConfidence[]): PredictionConfidence {
  if (all.length === 0) return 'low';
  const lowShare = all.filter((c) => c === 'low').length / all.length;
  if (lowShare > 0.3) return 'low';
  const highShare = all.filter((c) => c === 'high').length / all.length;
  return highShare > 0.5 ? 'high' : 'medium';
}

function emptyForecast(days: number) {
  return {
    startDate: null,
    anchorDate: null,
    days,
    totalPredictedKg: 0,
    avgPerDayKg: 0,
    confidence: 'low' as const,
    daily: [] as unknown[],
    byMess: [] as unknown[],
  };
}
