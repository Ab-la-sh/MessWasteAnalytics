// Notification builders (Phase 8) — the real content behind the top-bar bell,
// which until now was a static dot.
//
// Notifications are DERIVED, not stored. Every one of them is a function of
// data that already exists (waste records, the anomaly z-scores, which
// mess/date/slot combinations have no record yet), so there is no
// notifications table, no background job, and no write path that can fall out
// of sync with the records themselves. Deleting or editing a record makes its
// alert disappear on the next load, which is the behaviour you want.
//
// The trade-off: "seen/unseen" can't live on the server without a table, so
// it's tracked per-browser in localStorage against each notification's
// deterministic id (see NotificationBell). Same id in = same id out, so
// dismissing an alert makes it stay dismissed.
//
// Pure module: no Prisma, no I/O, no clock reads.

import type { DetectedAnomaly } from '@/lib/anomaly';
import { mealSlotLabel, dayOfWeekLabel, round2, sum } from '@/lib/analytics';
import { formatDateOnly } from '@/lib/date-utils';

export type NotificationType = 'high-waste' | 'missing-entry' | 'trend-improvement' | 'trend-regression';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface AppNotification {
  /** Deterministic — derived from the underlying data, never random. */
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** The date the alert is *about* (not when it was generated). */
  date: string;
  messId: string | null;
  messName: string | null;
  /** In-app deep link, or null when there's nothing specific to open. */
  href: string | null;
}

/** A z-score at or above this is a hard spike rather than a mild one. */
const CRITICAL_Z_SCORE = 2.5;

/** Month-over-month style movements smaller than this aren't worth a notification. */
const TREND_MATERIAL_PCT = 8;

// ---------------------------------------------------------------------------
// High-waste alerts
// ---------------------------------------------------------------------------

/**
 * One alert per anomalous record. The anomalies themselves come from
 * `detectAnomalies` — the exact same computation the Analytics page's
 * High-waste alerts table runs on, so the bell and the table never disagree.
 */
export function buildHighWasteNotifications(
  anomalies: DetectedAnomaly[],
  limit = 10
): AppNotification[] {
  return anomalies.slice(0, limit).map((a) => {
    const meal = mealSlotLabel(a.mealSlot);
    const day = dayOfWeekLabel(a.dayOfWeek);
    const overBaseline = round2(a.wastePercent - a.baselineAvgWastePercent);

    const context: string[] = [];
    if (a.scheduleDeviation) context.push('the menu deviated from schedule');
    if (a.eventType !== 'NORMAL') context.push(`it was logged as ${a.eventType.replace('_', ' ').toLowerCase()}`);

    return {
      // Keyed on the record and the fact it's a high-waste alert — stable
      // across reloads, and it changes if the record is edited into or out
      // of being an outlier.
      id: `high-waste:${a.id}`,
      type: 'high-waste' as const,
      severity: a.zScore >= CRITICAL_Z_SCORE ? ('critical' as const) : ('warning' as const),
      title: `High waste — ${a.messName} ${meal}`,
      body:
        `${day}'s ${meal} wasted ${a.totalWasteKg} kg (${a.wastePercent}% of what was prepared), ` +
        `${overBaseline} points above this slot's usual ${a.baselineAvgWastePercent}%` +
        (context.length ? `. Note that ${context.join(' and ')}.` : '.'),
      date: a.date,
      messId: a.messId,
      messName: a.messName,
      href: `/records?search=&dateFrom=${a.date}&dateTo=${a.date}&mealSlot=${a.mealSlot}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Missing entries
// ---------------------------------------------------------------------------

export interface MissingEntryInput {
  messId: string;
  messName: string;
  /** Dates to check, newest first. */
  dates: string[];
  /** Keys that DO exist, as `${messId}|${YYYY-MM-DD}|${mealSlot}`. */
  existingKeys: Set<string>;
  /** Which slots are expected on a given day. */
  expectedMealSlots: string[];
}

/**
 * Flags days where a mess logged some meals but not all of them, or nothing
 * at all.
 *
 * Deliberately one notification per mess-day rather than per missing slot —
 * a mess that skipped a whole day should produce one line in the bell, not
 * four. Days with a complete set of records produce nothing.
 */
export function buildMissingEntryNotifications(input: MissingEntryInput): AppNotification[] {
  const out: AppNotification[] = [];

  for (const date of input.dates) {
    const missing = input.expectedMealSlots.filter(
      (slot) => !input.existingKeys.has(`${input.messId}|${date}|${slot}`)
    );
    if (missing.length === 0) continue;

    const allMissing = missing.length === input.expectedMealSlots.length;
    const missingLabels = missing.map(mealSlotLabel).join(', ');

    out.push({
      id: `missing-entry:${input.messId}:${date}`,
      type: 'missing-entry',
      severity: 'info',
      title: allMissing
        ? `No entries for ${input.messName}`
        : `${missing.length} meal${missing.length === 1 ? '' : 's'} not logged — ${input.messName}`,
      body: allMissing
        ? `Nothing was logged for ${date}. Waste data for that day is missing entirely.`
        : `${missingLabels} ${missing.length === 1 ? 'has' : 'have'} no record for ${date}.`,
      date,
      messId: input.messId,
      messName: input.messName,
      href: '/data-collection',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Trend movement
// ---------------------------------------------------------------------------

export interface TrendWindow {
  /** Total waste in the most recent window. */
  currentKg: number;
  /** Total waste in the equally long window immediately before it. */
  previousKg: number;
  /** Label for the window length, e.g. "7 days". */
  windowLabel: string;
  /** Newest date covered — used for the notification's id and date. */
  asOfDate: string;
  messId: string | null;
  messName: string | null;
}

/**
 * A single notification when waste moved materially between two equal,
 * adjacent windows. Both directions are reported: a sustained drop is
 * exactly the kind of thing a mess team should be told about, not just bad
 * news.
 */
export function buildTrendNotification(window: TrendWindow): AppNotification | null {
  if (window.previousKg <= 0) return null;

  const changePct = round2(((window.currentKg - window.previousKg) / window.previousKg) * 100);
  if (Math.abs(changePct) < TREND_MATERIAL_PCT) return null;

  const improved = changePct < 0;
  const scope = window.messName ?? 'all messes';
  const magnitude = Math.abs(changePct);

  return {
    id: `trend:${window.messId ?? 'all'}:${window.asOfDate}:${improved ? 'down' : 'up'}`,
    type: improved ? 'trend-improvement' : 'trend-regression',
    severity: improved ? 'info' : 'warning',
    title: improved
      ? `Waste down ${magnitude}% at ${scope}`
      : `Waste up ${magnitude}% at ${scope}`,
    body:
      `The last ${window.windowLabel} produced ${window.currentKg} kg of waste, against ` +
      `${window.previousKg} kg in the ${window.windowLabel} before it.`,
    date: window.asOfDate,
    messId: window.messId,
    messName: window.messName,
    href: '/analytics',
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Orders the finished list: most severe first, then most recent. A critical
 * spike from three days ago outranks an informational note from this morning,
 * because the bell is a queue of things to act on, not a feed.
 */
export function sortNotifications(notifications: AppNotification[]): AppNotification[] {
  return [...notifications].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
}

/** Total waste across a set of records — small helper so routes don't re-implement it. */
export function totalWasteOf(records: { totalWasteKg: number }[]): number {
  return round2(sum(records.map((r) => r.totalWasteKg)));
}

/** `${messId}|${YYYY-MM-DD}|${mealSlot}` — the key shape buildMissingEntryNotifications expects. */
export function recordKey(messId: string, date: Date, mealSlot: string): string {
  return `${messId}|${formatDateOnly(date)}|${mealSlot}`;
}
