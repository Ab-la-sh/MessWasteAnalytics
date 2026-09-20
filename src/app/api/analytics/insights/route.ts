import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { insightsQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import {
  buildAnalyticsWhere,
  groupBy,
  mean,
  sum,
  round2,
  pctChange,
  startOfMonthUTC,
  mealSlotLabel,
  dayOfWeekLabel,
} from '@/lib/analytics';
import { addDaysUTC } from '@/lib/date-utils';

const MIN_RECORDS_FOR_INSIGHTS = 5;
// Minimum gap between the top group and the rest before it's worth calling
// out as a "pattern" rather than noise.
const PATTERN_MARGIN = 1.15; // 15% above the comparison baseline
const MONTH_CHANGE_THRESHOLD_PCT = 5;

interface Insight {
  type: 'day-pattern' | 'month-trend' | 'meal-pattern' | 'deviation-impact';
  message: string;
}

// GET /api/analytics/insights?messId=&dateFrom=&dateTo=
// Auto-generated smart insights for the Dashboard, e.g. "Lunch waste is
// consistently higher on Mondays," "Waste decreased 14% vs last month."
// Each rule only fires when the signal clears a real margin — with a small
// dataset, comparing near-identical averages and calling the larger one a
// "pattern" would be misleading, so weak signals are simply omitted rather
// than always returning a fixed number of insights.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = insightsQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;
  const messId = resolveMessScope(ctx, q.messId ?? null);

  const where = buildAnalyticsWhere(messId, q.dateFrom, q.dateTo);
  const records = await prisma.wasteRecord.findMany({
    where,
    select: {
      date: true,
      mealSlot: true,
      dayOfWeek: true,
      totalWasteKg: true,
      wastePercent: true,
      scheduleDeviation: true,
    },
  });

  if (records.length < MIN_RECORDS_FOR_INSIGHTS) {
    return apiSuccess({ insights: [] as Insight[] });
  }

  const insights: Insight[] = [];

  // 1. Day-of-week with the highest average waste %, if it clearly stands out.
  const byDay = groupBy(records, (r) => r.dayOfWeek);
  if (byDay.size > 1) {
    const dayAverages = [...byDay.entries()]
      .map(([day, recs]) => ({ day, avg: mean(recs.map((r) => r.wastePercent)) }))
      .sort((a, b) => b.avg - a.avg);
    const rest = dayAverages.slice(1).map((d) => d.avg);
    const restAvg = mean(rest);
    if (restAvg > 0 && dayAverages[0].avg >= restAvg * PATTERN_MARGIN) {
      insights.push({
        type: 'day-pattern',
        message: `Waste is consistently higher on ${dayOfWeekLabel(dayAverages[0].day)}s (avg ${round2(
          dayAverages[0].avg
        )}% of quantity prepared, vs ${round2(restAvg)}% on other days).`,
      });
    }
  }

  // 2. This month vs last month, by total waste.
  const latestDate = records.reduce((max, r) => (r.date > max ? r.date : max), records[0].date);
  const thisMonthStart = startOfMonthUTC(latestDate);
  const lastMonthStart = startOfMonthUTC(addDaysUTC(thisMonthStart, -1));
  const lastMonthEnd = addDaysUTC(thisMonthStart, -1);
  const thisMonthRecs = records.filter((r) => r.date >= thisMonthStart);
  const lastMonthRecs = records.filter((r) => r.date >= lastMonthStart && r.date <= lastMonthEnd);
  if (thisMonthRecs.length > 0 && lastMonthRecs.length > 0) {
    const thisTotal = sum(thisMonthRecs.map((r) => r.totalWasteKg));
    const lastTotal = sum(lastMonthRecs.map((r) => r.totalWasteKg));
    const change = pctChange(thisTotal, lastTotal);
    if (change !== null && Math.abs(change) >= MONTH_CHANGE_THRESHOLD_PCT) {
      insights.push({
        type: 'month-trend',
        message: `Waste ${change > 0 ? 'increased' : 'decreased'} ${Math.abs(change)}% vs last month.`,
      });
    }
  }

  // 3. Meal slot generating the most waste on average.
  const byMeal = groupBy(records, (r) => r.mealSlot);
  if (byMeal.size > 1) {
    const mealAverages = [...byMeal.entries()]
      .map(([meal, recs]) => ({ meal, avg: mean(recs.map((r) => r.totalWasteKg)) }))
      .sort((a, b) => b.avg - a.avg);
    insights.push({
      type: 'meal-pattern',
      message: `${mealSlotLabel(mealAverages[0].meal)} generates the most waste on average (${round2(
        mealAverages[0].avg
      )} kg per meal).`,
    });
  }

  // 4. Schedule-deviation impact.
  const deviated = records.filter((r) => r.scheduleDeviation);
  const onSchedule = records.filter((r) => !r.scheduleDeviation);
  if (deviated.length >= 3 && onSchedule.length >= 3) {
    const devAvg = mean(deviated.map((r) => r.wastePercent));
    const normAvg = mean(onSchedule.map((r) => r.wastePercent));
    if (normAvg > 0 && devAvg >= normAvg * PATTERN_MARGIN) {
      const extraPct = round2(((devAvg - normAvg) / normAvg) * 100);
      insights.push({
        type: 'deviation-impact',
        message: `Meals that deviated from the scheduled menu wasted ${extraPct}% more on average than meals that followed it.`,
      });
    }
  }

  return apiSuccess({ insights });
});
