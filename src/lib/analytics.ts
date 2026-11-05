// Shared helpers for the analytics/aggregation API layer (Phase 5).
//
// Aggregation is done in application code, not `prisma.wasteRecord.groupBy`,
// because several endpoints need date-bucketing (week/month) that groupBy
// can't express, and the dataset size here (one college's daily records,
// a handful of messes) is small enough that this is simpler and just as
// fast as pushing it into SQL. If this ever needs to scale to many
// campuses, these are the functions to move into raw SQL/materialized views.

import { Prisma } from '@prisma/client';
import { toDateOnly, formatDateOnly } from '@/lib/date-utils';
import { MEAL_SLOTS, DAYS_OF_WEEK } from '@/lib/constants';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/** Sample standard deviation (n-1 denominator). 0 for fewer than 2 values. */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = sum(values.map((v) => (v - m) ** 2)) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Pearson correlation coefficient, or null if undefined (too few points / no variance). */
export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return round2(num / Math.sqrt(dx2 * dy2));
}

/** % change from previous -> current, rounded. null when the baseline is 0 (undefined %). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round2(((current - previous) / previous) * 100);
}

export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = out.get(key);
    if (existing) existing.push(item);
    else out.set(key, [item]);
  }
  return out;
}

export function buildAnalyticsWhere(
  messId: string | null,
  dateFrom?: string,
  dateTo?: string
): Prisma.WasteRecordWhereInput {
  return {
    ...(messId ? { messId } : {}),
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: toDateOnly(dateFrom) } : {}),
            ...(dateTo ? { lte: toDateOnly(dateTo) } : {}),
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Bucketing (daily / weekly / monthly) for trend series
// ---------------------------------------------------------------------------

export function startOfWeekMonday(date: Date): Date {
  const d = toDateOnly(date);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function startOfMonthUTC(date: Date): Date {
  const d = toDateOnly(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type Granularity = 'daily' | 'weekly' | 'monthly';

export function bucketFor(date: Date, granularity: Granularity): { key: string; label: string } {
  if (granularity === 'daily') {
    const key = formatDateOnly(date);
    return { key, label: key };
  }
  if (granularity === 'weekly') {
    const weekStart = startOfWeekMonday(date);
    const key = formatDateOnly(weekStart);
    return { key, label: `Week of ${key}` };
  }
  const monthStart = startOfMonthUTC(date);
  const key = monthStart.toISOString().slice(0, 7); // YYYY-MM
  return { key, label: key };
}

// ---------------------------------------------------------------------------
// Aggregation over a set of waste-record-shaped rows
// ---------------------------------------------------------------------------

export interface AggregatableRecord {
  totalWasteKg: number;
  wastePerPerson: number;
  wastePercent: number;
  totalIngredientCost: number;
  headcount: number;
  quantityPrepared: number;
}

export interface AggregatedMetrics {
  recordCount: number;
  totalWasteKg: number;
  avgWasteKg: number;
  avgWastePerPerson: number;
  avgWastePercent: number;
  totalCost: number;
  totalHeadcount: number;
  totalQuantityPrepared: number;
}

export function aggregateRecords<T extends AggregatableRecord>(records: T[]): AggregatedMetrics {
  const recordCount = records.length;
  const totalWasteKg = round2(sum(records.map((r) => r.totalWasteKg)));
  const totalCost = round2(sum(records.map((r) => r.totalIngredientCost)));
  const totalHeadcount = sum(records.map((r) => r.headcount));
  const totalQuantityPrepared = round2(sum(records.map((r) => r.quantityPrepared)));

  return {
    recordCount,
    totalWasteKg,
    avgWasteKg: recordCount ? round2(totalWasteKg / recordCount) : 0,
    avgWastePerPerson: recordCount ? round2(mean(records.map((r) => r.wastePerPerson))) : 0,
    avgWastePercent: recordCount ? round2(mean(records.map((r) => r.wastePercent))) : 0,
    totalCost,
    totalHeadcount,
    totalQuantityPrepared,
  };
}

export interface TrendPoint extends AggregatedMetrics {
  bucket: string;
  label: string;
}

export function buildTrendSeries<T extends AggregatableRecord & { date: Date }>(
  records: T[],
  granularity: Granularity
): TrendPoint[] {
  const buckets = new Map<string, { label: string; records: T[] }>();
  for (const r of records) {
    const { key, label } = bucketFor(r.date, granularity);
    const existing = buckets.get(key);
    if (existing) existing.records.push(r);
    else buckets.set(key, { label, records: [r] });
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { label, records: bucketRecords }]) => ({
      bucket: key,
      label,
      ...aggregateRecords(bucketRecords),
    }));
}

// ---------------------------------------------------------------------------
// Display labels (used in insight strings / historical-average labels)
// ---------------------------------------------------------------------------

export function mealSlotLabel(value: string): string {
  return MEAL_SLOTS.find((m) => m.value === value)?.label ?? value;
}

export function dayOfWeekLabel(value: string): string {
  return DAYS_OF_WEEK.find((d) => d.value === value)?.label ?? value;
}
