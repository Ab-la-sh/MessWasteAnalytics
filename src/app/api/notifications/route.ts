import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, resolveMessScope } from '@/lib/require-auth';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api-response';
import { notificationsQuerySchema } from '@/lib/validation/prediction';
import { searchParamsToObject } from '@/lib/query';
import { addDaysUTC, formatDateOnly, toDateOnly } from '@/lib/date-utils';
import { detectAnomalies, ANOMALY_SELECT } from '@/lib/anomaly';
import {
  buildHighWasteNotifications,
  buildMissingEntryNotifications,
  buildTrendNotification,
  sortNotifications,
  totalWasteOf,
  recordKey,
  type AppNotification,
} from '@/lib/notifications';
import { MEAL_SLOTS } from '@/lib/constants';

/** How far back an alert can be and still be worth showing in the bell. */
const ALERT_WINDOW_DAYS = 14;

/** Missing-entry nagging is limited to the last few days — older gaps are history, not a to-do. */
const MISSING_ENTRY_WINDOW_DAYS = 3;

/** Length of each side of the "waste up/down X%" comparison. */
const TREND_WINDOW_DAYS = 7;

// GET /api/notifications?messId=&limit=
//
// Everything behind the top-bar bell. Derived on read from existing records
// (see src/lib/notifications.ts for why there's no notifications table), and
// mess-scoped exactly like every other route — a Data Collector only ever
// sees alerts for their own mess.
//
// Dates are anchored to the newest record in scope rather than the wall
// clock, the same convention the Dashboard KPIs and Analytics presets use,
// so a seeded historical dataset still produces a meaningful bell.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const ctx = await requireAuth(req);

  const parsed = notificationsQuerySchema.safeParse(searchParamsToObject(req));
  if (!parsed.success) {
    return apiError('Invalid query parameters', 422, parsed.error.flatten());
  }
  const q = parsed.data;

  const messId = resolveMessScope(ctx, q.messId ?? null);
  const scopeWhere = messId ? { messId } : {};

  const latest = await prisma.wasteRecord.findFirst({
    where: scopeWhere,
    orderBy: { date: 'desc' },
    select: { date: true },
  });

  if (!latest) {
    return apiSuccess({ asOfDate: null, count: 0, notifications: [] as AppNotification[] });
  }

  const asOf = toDateOnly(latest.date);
  const alertWindowStart = addDaysUTC(asOf, -(ALERT_WINDOW_DAYS - 1));
  const trendWindowStart = addDaysUTC(asOf, -(TREND_WINDOW_DAYS - 1));
  const previousTrendStart = addDaysUTC(asOf, -(TREND_WINDOW_DAYS * 2 - 1));

  const [anomalyRows, recentRecords, trendRecords, messes] = await Promise.all([
    // Anomaly baselines need the FULL history to be statistically meaningful —
    // only the reporting is then narrowed to the alert window below.
    prisma.wasteRecord.findMany({ where: scopeWhere, select: ANOMALY_SELECT }),
    prisma.wasteRecord.findMany({
      where: { ...scopeWhere, date: { gte: addDaysUTC(asOf, -(MISSING_ENTRY_WINDOW_DAYS - 1)) } },
      select: { messId: true, date: true, mealSlot: true },
    }),
    prisma.wasteRecord.findMany({
      where: { ...scopeWhere, date: { gte: previousTrendStart } },
      select: { date: true, totalWasteKg: true },
    }),
    prisma.mess.findMany({
      where: { ...(messId ? { id: messId } : { isActive: true }) },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  const notifications: AppNotification[] = [];

  // --- High-waste alerts ---------------------------------------------------
  const anomalies = detectAnomalies(anomalyRows).filter(
    (a) => a.date >= formatDateOnly(alertWindowStart)
  );
  notifications.push(...buildHighWasteNotifications(anomalies));

  // --- Missing entries -----------------------------------------------------
  const existingKeys = new Set<string>(
    recentRecords.map((r: { messId: string; date: Date; mealSlot: string }) =>
      recordKey(r.messId, r.date, r.mealSlot)
    )
  );
  const recentDates: string[] = [];
  for (let i = 0; i < MISSING_ENTRY_WINDOW_DAYS; i++) {
    recentDates.push(formatDateOnly(addDaysUTC(asOf, -i)));
  }
  const expectedMealSlots = MEAL_SLOTS.map((m) => m.value);

  for (const mess of messes) {
    notifications.push(
      ...buildMissingEntryNotifications({
        messId: mess.id,
        messName: mess.name,
        dates: recentDates,
        existingKeys,
        expectedMealSlots,
      })
    );
  }

  // --- Trend movement ------------------------------------------------------
  const trendStartIso = formatDateOnly(trendWindowStart);
  const current = trendRecords.filter((r) => formatDateOnly(r.date) >= trendStartIso);
  const previous = trendRecords.filter((r) => formatDateOnly(r.date) < trendStartIso);

  const trend = buildTrendNotification({
    currentKg: totalWasteOf(current),
    previousKg: totalWasteOf(previous),
    windowLabel: `${TREND_WINDOW_DAYS} days`,
    asOfDate: formatDateOnly(asOf),
    messId,
    messName: messId ? (messes.find((m) => m.id === messId)?.name ?? null) : null,
  });
  if (trend) notifications.push(trend);

  const sorted = sortNotifications(notifications).slice(0, q.limit);

  return apiSuccess({
    asOfDate: formatDateOnly(asOf),
    count: sorted.length,
    notifications: sorted,
  });
});
