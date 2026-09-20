// High-waste / outlier detection (Phase 5, extracted to a shared pure module
// in Phase 8 so /api/analytics/anomalies and /api/notifications can't drift
// apart — an alert in the bell and a row in the Analytics table must mean
// exactly the same thing.)
//
// A record is an outlier when its wastePercent sits at least
// `thresholdStdDev` standard deviations ABOVE the mean of its own baseline
// group. The baseline is (mess, meal slot): a mess's Breakfast and Lunch run
// at structurally different waste levels, so comparing a Lunch record against
// Breakfast history would flag normal meals and miss real spikes.
//
// Pure — no Prisma, no I/O. Takes plain rows, returns plain rows.

import { groupBy, mean, stddev, round2 } from '@/lib/analytics';
import { formatDateOnly } from '@/lib/date-utils';

/** Fewer than this many records in a baseline group and nothing in it can be called an outlier. */
export const MIN_BASELINE_SAMPLE = 5;

export interface AnomalyCandidate {
  id: string;
  date: Date;
  messId: string;
  mealSlot: string;
  dayOfWeek: string;
  weekType: string;
  totalWasteKg: number;
  wastePerPerson: number;
  wastePercent: number;
  eventType: string;
  scheduleDeviation: boolean;
  mess: { name: string };
}

export interface DetectedAnomaly {
  id: string;
  date: string;
  messId: string;
  messName: string;
  mealSlot: string;
  dayOfWeek: string;
  weekType: string;
  totalWasteKg: number;
  wastePerPerson: number;
  wastePercent: number;
  eventType: string;
  scheduleDeviation: boolean;
  zScore: number;
  baselineAvgWastePercent: number;
}

export interface DetectAnomaliesOptions {
  thresholdStdDev?: number;
  minBaselineSample?: number;
}

/**
 * Returns every record that clears the z-score threshold within its own
 * (mess, meal slot) baseline, sorted most-extreme first.
 *
 * Groups with no variance at all (stddev 0 — e.g. identical seeded values)
 * are skipped rather than dividing by zero: with no spread there is no
 * meaningful notion of "unusually high" in that group.
 */
export function detectAnomalies<T extends AnomalyCandidate>(
  records: T[],
  options: DetectAnomaliesOptions = {}
): DetectedAnomaly[] {
  const thresholdStdDev = options.thresholdStdDev ?? 1.5;
  const minBaselineSample = options.minBaselineSample ?? MIN_BASELINE_SAMPLE;

  const groups = groupBy(records, (r) => `${r.messId}::${r.mealSlot}`);
  const anomalies: DetectedAnomaly[] = [];

  for (const groupRecords of groups.values()) {
    if (groupRecords.length < minBaselineSample) continue;

    const values = groupRecords.map((r) => r.wastePercent);
    const baselineMean = mean(values);
    const baselineStdDev = stddev(values);
    if (baselineStdDev === 0) continue;

    for (const r of groupRecords) {
      const zScore = (r.wastePercent - baselineMean) / baselineStdDev;
      if (zScore < thresholdStdDev) continue;

      anomalies.push({
        id: r.id,
        date: formatDateOnly(r.date),
        messId: r.messId,
        messName: r.mess.name,
        mealSlot: r.mealSlot,
        dayOfWeek: r.dayOfWeek,
        weekType: r.weekType,
        totalWasteKg: r.totalWasteKg,
        wastePerPerson: r.wastePerPerson,
        wastePercent: r.wastePercent,
        eventType: r.eventType,
        scheduleDeviation: r.scheduleDeviation,
        zScore: round2(zScore),
        baselineAvgWastePercent: round2(baselineMean),
      });
    }
  }

  anomalies.sort((a, b) => b.zScore - a.zScore);
  return anomalies;
}

/** The Prisma `select` every caller of detectAnomalies needs. Kept next to the shape it feeds. */
export const ANOMALY_SELECT = {
  id: true,
  date: true,
  messId: true,
  mealSlot: true,
  dayOfWeek: true,
  weekType: true,
  totalWasteKg: true,
  wastePerPerson: true,
  wastePercent: true,
  eventType: true,
  scheduleDeviation: true,
  mess: { select: { name: true } },
} as const;
