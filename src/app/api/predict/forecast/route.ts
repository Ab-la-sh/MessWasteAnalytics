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
import { isModelMess, predictDailyBatch, type ModelDayInput } from '@/lib/model-client';
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

/** The model works in whole-day crates; the app stores kilograms. */
const KG_PER_CRATE = 30;

/** Day-level menu facts the model needs, derived from the A/B menu grid. */
interface DayMenu {
  hasBiryani: boolean; // lunch or dinner
  hasDosa: boolean; // breakfast
  nDishes: number; // breakfast + lunch + dinner item counts
}

/** Map the model's top-class probability onto the app's low/medium/high scale. */
function modelConfidence(topProb: number): PredictionConfidence {
  if (topProb >= 0.45) return 'high';
  if (topProb >= 0.3) return 'medium';
  return 'low';
}

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
    select: { id: true, name: true, code: true },
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
          hasDosa: true,
          itemCount: true,
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

      // Day-level menu view for the ML model (it predicts whole days, not meals).
      const dayMenuByKey = new Map<string, DayMenu>();
      for (const m of menuSlots) {
        if (m.mealSlot === 'SNACKS') continue; // model's dish counts exclude snacks
        const key = `${m.weekType}|${m.dayOfWeek}`;
        const cur = dayMenuByKey.get(key) ?? { hasBiryani: false, hasDosa: false, nDishes: 0 };
        cur.nDishes += m.itemCount;
        if ((m.mealSlot === 'LUNCH' || m.mealSlot === 'DINNER') && m.hasBiryani) cur.hasBiryani = true;
        if (m.mealSlot === 'BREAKFAST' && m.hasDosa) cur.hasDosa = true;
        dayMenuByKey.set(key, cur);
      }

      return { mess, samples, weatherRows, menuByKey, dayMenuByKey };
    })
  );

  // ---------------------------------------------------------------------
  // Predict every (mess, date, meal slot), then roll up.
  // ---------------------------------------------------------------------

  const dailyTotals = new Map<string, { kg: number; low: number; high: number; byMeal: Map<string, number> }>();
  const messTotals = new Map<string, number>();
  const confidences: PredictionConfidence[] = [];

  const modelDays = new Set<string>(); // ISO dates whose figure came from the ML model

  for (const { mess, samples, weatherRows, menuByKey, dayMenuByKey } of perMess) {
    if (samples.length === 0) continue;

    // Trailing 7-day waste (in crates) from the last 7 fully-recorded days.
    const dayKg = new Map<string, { kg: number; slots: number }>();
    for (const r of samples) {
      const k = formatDateOnly(r.date);
      const cur = dayKg.get(k) ?? { kg: 0, slots: 0 };
      cur.kg += r.totalWasteKg;
      cur.slots += 1;
      dayKg.set(k, cur);
    }
    const lastFull = [...dayKg.entries()]
      .filter(([, v]) => v.slots >= 3)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 7);
    const cratesRollmean7 = lastFull.length
      ? lastFull.reduce((acc, [, v]) => acc + v.kg, 0) / lastFull.length / KG_PER_CRATE
      : undefined;

    // Ask the model for every forecast day in a single round-trip (null = use baseline).
    let modelOut: Awaited<ReturnType<typeof predictDailyBatch>> = null;
    if (isModelMess(mess.code)) {
      const items: ModelDayInput[] = dates.map((date) => {
        const menu = dayMenuByKey.get(`${weekTypeFromDate(date)}|${dayOfWeekFromDate(date)}`);
        const temp = seasonalWeather(weatherRows, date).temperatureC;
        const prior = weatherRows
          .filter((w) => {
            const diff = (date.getTime() - w.date.getTime()) / 86_400_000;
            return diff >= 1 && diff <= 7 && w.temperatureMeanC != null;
          })
          .map((w) => w.temperatureMeanC as number);
        return {
          date: formatDateOnly(date),
          has_biryani: menu?.hasBiryani ?? false,
          has_dosa: menu?.hasDosa ?? false,
          n_dishes: menu && menu.nDishes > 0 ? menu.nDishes : undefined,
          temp_mean_c: temp ?? undefined,
          temp_anomaly:
            temp != null && prior.length >= 3 ? temp - prior.reduce((a, b) => a + b, 0) / prior.length : undefined,
          crates_rollmean7: cratesRollmean7,
        };
      });
      modelOut = await predictDailyBatch(items);
    }

    for (let di = 0; di < dates.length; di++) {
      const date = dates[di];
      const iso = formatDateOnly(date);
      const dayOfWeek = dayOfWeekFromDate(date);
      const weekType = weekTypeFromDate(date);
      const weather = seasonalWeather(weatherRows, date);
      const eventType = eventTypeFromCalendar(calendarByDate.get(iso));

      // 1. Baseline per meal slot (always computed: it supplies the meal split and the fallback).
      const slotPreds: { slot: (typeof MEAL_SLOTS)[number]; p: NonNullable<ReturnType<typeof predictWaste>> }[] = [];
      for (const slot of MEAL_SLOTS) {
        const p = predictWaste(samples, {
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
        if (p) slotPreds.push({ slot, p });
      }
      if (slotPreds.length === 0) continue;
      const baseKg = slotPreds.reduce((acc, x) => acc + x.p.predictedTotalWasteKg, 0);

      // 2. If the model answered, its whole-day figure replaces the baseline's day total;
      //    the baseline's meal-slot proportions are kept so the per-meal breakdown still works.
      const m = modelOut?.[di];
      const useModel = Boolean(m) && baseKg > 0;
      const kgScale = useModel ? m!.expected_kg / baseKg : 1;
      const lowScale = useModel ? m!.range_low_kg / baseKg : 1;
      const highScale = useModel ? m!.range_high_kg / baseKg : 1;
      if (useModel) modelDays.add(iso);

      const bucket =
        dailyTotals.get(iso) ?? { kg: 0, low: 0, high: 0, byMeal: new Map<string, number>() };

      for (const { slot, p } of slotPreds) {
        const kg = p.predictedTotalWasteKg * kgScale;
        confidences.push(useModel ? modelConfidence(m!.confidence) : p.confidence);
        bucket.kg += kg;
        bucket.low += useModel ? p.predictedTotalWasteKg * lowScale : p.rangeLowKg;
        bucket.high += useModel ? p.predictedTotalWasteKg * highScale : p.rangeHighKg;
        bucket.byMeal.set(slot.value, (bucket.byMeal.get(slot.value) ?? 0) + kg);
        messTotals.set(mess.id, (messTotals.get(mess.id) ?? 0) + kg);
      }
      dailyTotals.set(iso, bucket);
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
      // 'ml-model' when at least one mess's figure for this day came from the local model.
      source: modelDays.has(iso) ? 'ml-model' : 'baseline',
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
    modelDays: modelDays.size,
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
