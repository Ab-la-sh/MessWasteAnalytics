// Pure helpers for the Analytics page: date-range presets, period comparison
// maths, metric formatting, and reshaping API responses into chart rows.
// No React and no browser APIs — unit-testable directly.

import { addDaysIso } from '@/lib/format';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { BreakdownResponse, BreakdownRow, TrendPoint } from '@/types/models';

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type RangePreset = '14d' | '30d' | '90d' | 'all' | 'custom';

export interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

const PRESET_DAYS: Record<'14d' | '30d' | '90d', number> = { '14d': 14, '30d': 30, '90d': 90 };

/**
 * Resolves a preset to concrete dates. Presets are anchored to `asOf` (the
 * newest record's date) rather than today's date, so a dataset that ends in
 * the past still fills the window — same convention as the Dashboard KPIs.
 */
export function resolveRange(
  preset: RangePreset,
  asOf: string | null,
  custom: { from: string; to: string }
): DateRange {
  if (preset === 'all') return {};
  if (preset === 'custom') {
    return { dateFrom: custom.from || undefined, dateTo: custom.to || undefined };
  }
  if (!asOf) return {};
  const days = PRESET_DAYS[preset];
  return { dateFrom: addDaysIso(asOf, -(days - 1)), dateTo: asOf };
}

/** Inclusive number of days between two YYYY-MM-DD dates. */
export function daysInclusive(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** The equally long window immediately before `range`, or null if the range isn't fully bounded. */
export function previousRange(range: DateRange): Required<DateRange> | null {
  if (!range.dateFrom || !range.dateTo || range.dateTo < range.dateFrom) return null;
  const length = daysInclusive(range.dateFrom, range.dateTo);
  const prevTo = addDaysIso(range.dateFrom, -1);
  return { dateFrom: addDaysIso(prevTo, -(length - 1)), dateTo: prevTo };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type TrendMetric = 'totalWasteKg' | 'avgWastePerPerson' | 'avgWastePercent' | 'totalCost';

export const TREND_METRICS: { value: TrendMetric; label: string }[] = [
  { value: 'totalWasteKg', label: 'Total waste (kg)' },
  { value: 'avgWastePerPerson', label: 'Waste per person (kg)' },
  { value: 'avgWastePercent', label: 'Waste of prepared (%)' },
  { value: 'totalCost', label: 'Ingredient cost (₹)' },
];

export function formatMetric(metric: TrendMetric | BreakdownMetric, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  switch (metric) {
    case 'totalWasteKg':
    case 'avgWasteKg':
      return `${formatNumber(value, 1)} kg`;
    case 'avgWastePerPerson':
      return `${formatNumber(value, 3)} kg`;
    case 'avgWastePercent':
      return `${formatNumber(value, 1)}%`;
    case 'totalCost':
      return formatCurrency(value);
  }
}

export type BreakdownMetric = 'totalWasteKg' | 'avgWasteKg' | 'avgWastePerPerson' | 'avgWastePercent';

export const BREAKDOWN_METRICS: { value: BreakdownMetric; label: string }[] = [
  { value: 'avgWasteKg', label: 'Average per meal (kg)' },
  { value: 'totalWasteKg', label: 'Total waste (kg)' },
  { value: 'avgWastePerPerson', label: 'Waste per person (kg)' },
  { value: 'avgWastePercent', label: 'Waste of prepared (%)' },
];

// ---------------------------------------------------------------------------
// Period comparison
// ---------------------------------------------------------------------------

export interface PeriodTotals {
  recordCount: number;
  totalWasteKg: number;
  avgWastePerPerson: number;
  avgWastePercent: number;
  totalCost: number;
}

/**
 * Collapses a series of buckets into one set of totals. Each point's averages
 * are means over its own records, so weighting by recordCount gives the exact
 * overall mean.
 */
export function summarizeSeries(points: TrendPoint[]): PeriodTotals {
  let recordCount = 0;
  let totalWasteKg = 0;
  let totalCost = 0;
  let perPersonSum = 0;
  let percentSum = 0;
  for (const p of points) {
    recordCount += p.recordCount;
    totalWasteKg += p.totalWasteKg;
    totalCost += p.totalCost;
    perPersonSum += p.avgWastePerPerson * p.recordCount;
    percentSum += p.avgWastePercent * p.recordCount;
  }
  return {
    recordCount,
    totalWasteKg,
    totalCost,
    avgWastePerPerson: recordCount ? perPersonSum / recordCount : 0,
    avgWastePercent: recordCount ? percentSum / recordCount : 0,
  };
}

/** % change previous -> current; null when the baseline is 0 and the % is undefined. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// ---------------------------------------------------------------------------
// Trend chart rows
// ---------------------------------------------------------------------------

export type TrendRow = Record<string, string | number | null> & { bucket: string; label: string };

/**
 * Turns one series (or a combined series plus per-mess series) into flat rows
 * for a multi-line chart: one row per bucket, one key per line. Buckets a
 * series has no data for become null so the line simply skips them.
 */
export function buildTrendRows(
  combined: TrendPoint[],
  byMess: { messName: string; series: TrendPoint[] }[] | undefined,
  metric: TrendMetric,
  primaryLabel: string
): { rows: TrendRow[]; seriesKeys: string[] } {
  const lines: { key: string; series: TrendPoint[] }[] = [{ key: primaryLabel, series: combined }];
  if (byMess) {
    for (const m of [...byMess].sort((a, b) => a.messName.localeCompare(b.messName))) {
      lines.push({ key: m.messName, series: m.series });
    }
  }

  const rowsByBucket = new Map<string, TrendRow>();
  for (const { key, series } of lines) {
    for (const point of series) {
      let row = rowsByBucket.get(point.bucket);
      if (!row) {
        row = { bucket: point.bucket, label: point.label } as TrendRow;
        // Pre-fill every line with null so a missing bucket is explicit.
        for (const l of lines) row[l.key] = null;
        rowsByBucket.set(point.bucket, row);
      }
      row[key] = point[metric];
    }
  }

  const rows = [...rowsByBucket.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));
  return { rows, seriesKeys: lines.map((l) => l.key) };
}

// ---------------------------------------------------------------------------
// Breakdown ordering
// ---------------------------------------------------------------------------

const NATURAL_ORDER: Record<BreakdownResponse['by'], string[]> = {
  mealSlot: ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'],
  dayOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
  weekType: ['A', 'B'],
  eventType: ['NORMAL', 'HOLIDAY', 'FESTIVAL', 'COLLEGE_EVENT', 'EXAM_PERIOD'],
};

/** The API sorts by total waste; charts read better in each dimension's natural order. */
export function sortBreakdown(by: BreakdownResponse['by'], rows: BreakdownRow[]): BreakdownRow[] {
  const order = NATURAL_ORDER[by];
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return [...rows].sort((a, b) => rank(a.key) - rank(b.key));
}
