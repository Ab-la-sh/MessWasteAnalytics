import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { summaryQuerySchema } from '@/lib/validation/analytics';
import { searchParamsToObject } from '@/lib/query';
import { buildAnalyticsWhere, aggregateRecords, pctChange, round2 } from '@/lib/analytics';
import { addDaysUTC, formatDateOnly } from '@/lib/date-utils';

// GET /api/analytics/summary?messId= — backs the Dashboard's four KPI cards
// (Total Waste Today, Waste per Person, Estimated Cost Wasted, Average
// Weekly Waste), each with a trend vs. the previous period.
//
// "Today" is defined as the most recent date that has a matching waste
// record, not the literal server date — this is seeded, mostly-historical
// data (all of 2024), so anchoring to real-world "today" would show an
// empty dashboard. Once live daily entry catches up to the present, the
// most recent record date IS today, so this keeps working unchanged.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = summaryQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const messId = resolveMessScope(ctx, parsed.data.messId ?? null);
  const baseWhere = buildAnalyticsWhere(messId);

  const latest = await prisma.wasteRecord.findFirst({
    where: baseWhere,
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  if (!latest) {
    return apiSuccess({
      asOfDate: null,
      totalWasteToday: null,
      wastePerPersonToday: null,
      costWastedToday: null,
      avgWeeklyWaste: null,
      message: 'No waste records yet for this scope.',
    });
  }

  const asOfDate = latest.date;
  const prevDate = addDaysUTC(asOfDate, -1);
  const weekStart = addDaysUTC(asOfDate, -6);
  const prevWeekStart = addDaysUTC(asOfDate, -13);
  const prevWeekEnd = addDaysUTC(asOfDate, -7);

  const [todayRecords, prevDayRecords, weekRecords, prevWeekRecords] = await Promise.all([
    prisma.wasteRecord.findMany({ where: { ...baseWhere, date: asOfDate } }),
    prisma.wasteRecord.findMany({ where: { ...baseWhere, date: prevDate } }),
    prisma.wasteRecord.findMany({ where: { ...baseWhere, date: { gte: weekStart, lte: asOfDate } } }),
    prisma.wasteRecord.findMany({
      where: { ...baseWhere, date: { gte: prevWeekStart, lte: prevWeekEnd } },
    }),
  ]);

  const today = aggregateRecords(todayRecords);
  const prevDay = aggregateRecords(prevDayRecords);
  const week = aggregateRecords(weekRecords);
  const prevWeek = aggregateRecords(prevWeekRecords);

  // "Average weekly waste" = total waste over the trailing week, averaged
  // over the days in that window that actually have records (a mess might
  // not serve/log every day, e.g. Sundays) — not a flat /7.
  const weekDayCount = new Set(weekRecords.map((r) => formatDateOnly(r.date))).size || 1;
  const prevWeekDayCount = new Set(prevWeekRecords.map((r) => formatDateOnly(r.date))).size || 1;
  const avgWeeklyWaste = round2(week.totalWasteKg / weekDayCount);
  const prevAvgWeeklyWaste = round2(prevWeek.totalWasteKg / prevWeekDayCount);

  return apiSuccess({
    asOfDate: formatDateOnly(asOfDate),
    totalWasteToday: {
      valueKg: today.totalWasteKg,
      trendPct: pctChange(today.totalWasteKg, prevDay.totalWasteKg),
      comparedTo: 'previous day',
    },
    wastePerPersonToday: {
      valueKg: today.avgWastePerPerson,
      trendPct: pctChange(today.avgWastePerPerson, prevDay.avgWastePerPerson),
      comparedTo: 'previous day',
    },
    costWastedToday: {
      valueRupees: today.totalCost,
      trendPct: pctChange(today.totalCost, prevDay.totalCost),
      comparedTo: 'previous day',
    },
    avgWeeklyWaste: {
      valueKg: avgWeeklyWaste,
      trendPct: pctChange(avgWeeklyWaste, prevAvgWeeklyWaste),
      comparedTo: 'previous week',
    },
  });
});
