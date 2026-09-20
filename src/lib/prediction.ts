// Waste prediction — the baseline model behind "AI Waste Prediction"
// (Phase 8), replacing the Coming Soon placeholder.
//
// Deliberately NOT a black box. This is a recency-weighted historical
// baseline with explainable multiplicative adjustments, which is the right
// first model here: the dataset is one college's daily records, every
// prediction has to be defensible to a mess coordinator standing at a
// counter, and a gradient-boosted model trained on a few hundred rows would
// mostly be memorising noise. The schema and the CSV export are already
// ML-ready, so swapping this for a trained model later means replacing this
// one file's `predictWaste` — nothing else changes.
//
// How it works:
//   1. BASE LEVEL — average waste *per person* over past records matching the
//      target as tightly as possible: mess x meal slot x day of week x week
//      type, falling back to progressively looser groupings when that exact
//      combination has too little history.
//   2. RECENCY — each past record is weighted by exponential decay on its
//      age, so a menu or portioning change from three months ago fades out
//      instead of anchoring the forecast forever.
//   3. ADJUSTMENTS — multiplicative factors for rain, temperature, event
//      type, schedule deviation and menu flags. Each factor is measured
//      against the mess's *whole* history (not the small base group, which
//      would be far too thin to estimate an effect from) and is shrunk
//      toward 1.0 in proportion to how little data supports it.
//   4. SCALE — multiply by expected headcount to get kilograms.
//
// Pure module: no Prisma, no fetch, no dates-from-now. Everything it needs
// is passed in, which is what makes it unit-testable.

import { mean, stddev, round2 } from '@/lib/analytics';
import { mealSlotLabel, dayOfWeekLabel } from '@/lib/analytics';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** A record this many days old carries half the weight of a record from today. */
export const RECENCY_HALF_LIFE_DAYS = 60;

/**
 * Shrinkage constant. A factor estimated from `n` records is pulled toward
 * 1.0 by n/(n+K): 1 supporting record moves the prediction barely at all,
 * 30 records move it almost the full measured amount. Prevents a single
 * freak rainy Tuesday from becoming "rain doubles waste".
 */
export const SHRINKAGE_K = 6;

/** Adjustment factors are clamped here so no single driver can run away. */
export const MIN_FACTOR = 0.6;
export const MAX_FACTOR = 1.7;

/** Daily rainfall at or above this counts as "a wet day" for the rain factor. */
export const RAIN_THRESHOLD_MM = 2.5;

/** Drivers whose effect is smaller than this are not worth showing to a human. */
const MATERIAL_EFFECT = 0.03;

/** The prediction interval never claims to be tighter than this fraction of the estimate. */
const MIN_RELATIVE_SPREAD = 0.12;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface MenuFlags {
  hasBiryani: boolean;
  hasPaneer: boolean;
  hasDessert: boolean;
}

/** A past record the model learns from. */
export interface PredictionSample {
  date: Date;
  mealSlot: string;
  dayOfWeek: string;
  weekType: string;
  eventType: string;
  headcount: number;
  totalWasteKg: number;
  wastePerPerson: number;
  temperatureC: number | null;
  rainfallMm: number | null;
  scheduleDeviation: boolean;
  menuFlags: MenuFlags | null;
}

/** The meal being predicted. */
export interface PredictionTarget {
  date: Date;
  mealSlot: string;
  dayOfWeek: string;
  weekType: string;
  eventType: string;
  temperatureC: number | null;
  rainfallMm: number | null;
  scheduleDeviation: boolean;
  menuFlags: MenuFlags | null;
  /** Known headcount (the coordinator typed one). Omit to have it predicted too. */
  headcount?: number | null;
}

export interface PredictionDriver {
  key: string;
  label: string;
  /** Multiplicative factor applied to the base, after shrinkage (1.0 = no effect). */
  factor: number;
  /** The same thing as a signed percentage, for display: 1.12 -> +12. */
  impactPct: number;
  /** How many past records this factor was estimated from. */
  sampleSize: number;
}

export type BaselineTier =
  | 'meal-day-week'
  | 'meal-day'
  | 'meal'
  | 'mess'
  | 'none';

export interface PredictionBaseline {
  tier: BaselineTier;
  label: string;
  sampleSize: number;
  avgWastePerPerson: number;
}

export type PredictionConfidence = 'low' | 'medium' | 'high';

export interface PredictionResult {
  predictedWastePerPerson: number;
  predictedTotalWasteKg: number;
  /** ~1 standard deviation either side of the estimate, floored at a sane minimum. */
  rangeLowKg: number;
  rangeHighKg: number;
  expectedHeadcount: number;
  headcountSource: 'provided' | 'historical';
  baseline: PredictionBaseline;
  drivers: PredictionDriver[];
  confidence: PredictionConfidence;
  method: string;
}

// ---------------------------------------------------------------------------
// Weighting helpers
// ---------------------------------------------------------------------------

/** Exponential decay on age in days. Never negative-age-boosts future records. */
export function recencyWeight(sampleDate: Date, asOf: Date, halfLifeDays = RECENCY_HALF_LIFE_DAYS): number {
  const ageDays = Math.max(0, (asOf.getTime() - sampleDate.getTime()) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    num += values[i] * weights[i];
    den += weights[i];
  }
  // All weights vanishing (every sample far older than the half-life) would
  // otherwise divide by ~0 — fall back to the plain mean rather than NaN.
  if (den <= 1e-9) return mean(values);
  return num / den;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Estimate the effect of a condition (rain, a festival, biryani on the menu)
 * as a multiplicative factor on waste per person.
 *
 * Measured as (weighted mean of records meeting the condition) / (weighted
 * mean of all records), then shrunk toward 1.0 by how many records met it.
 * Returns exactly 1.0 — no effect — when nothing supports the estimate.
 */
export function conditionFactor(
  samples: PredictionSample[],
  weights: number[],
  matches: (s: PredictionSample) => boolean,
  shrinkageK = SHRINKAGE_K
): { factor: number; sampleSize: number } {
  const groupValues: number[] = [];
  const groupWeights: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (matches(samples[i])) {
      groupValues.push(samples[i].wastePerPerson);
      groupWeights.push(weights[i]);
    }
  }

  const n = groupValues.length;
  if (n === 0) return { factor: 1, sampleSize: 0 };

  const overall = weightedMean(
    samples.map((s) => s.wastePerPerson),
    weights
  );
  if (overall <= 0) return { factor: 1, sampleSize: n };

  const raw = weightedMean(groupValues, groupWeights) / overall;
  const shrunk = 1 + (raw - 1) * (n / (n + shrinkageK));
  return { factor: round2(clamp(shrunk, MIN_FACTOR, MAX_FACTOR)), sampleSize: n };
}

// ---------------------------------------------------------------------------
// Baseline selection
// ---------------------------------------------------------------------------

interface Tier {
  tier: BaselineTier;
  label: string;
  matches: (s: PredictionSample) => boolean;
  /** Minimum records before this tier is considered good enough to use. */
  minSamples: number;
}

function tiersFor(target: PredictionTarget): Tier[] {
  const meal = mealSlotLabel(target.mealSlot);
  const day = dayOfWeekLabel(target.dayOfWeek);

  return [
    {
      tier: 'meal-day-week',
      label: `${day} ${meal}, Week ${target.weekType}`,
      minSamples: 3,
      matches: (s) =>
        s.mealSlot === target.mealSlot &&
        s.dayOfWeek === target.dayOfWeek &&
        s.weekType === target.weekType,
    },
    {
      tier: 'meal-day',
      label: `${day} ${meal} (both week types)`,
      minSamples: 3,
      matches: (s) => s.mealSlot === target.mealSlot && s.dayOfWeek === target.dayOfWeek,
    },
    {
      tier: 'meal',
      label: `all ${meal} meals`,
      minSamples: 3,
      matches: (s) => s.mealSlot === target.mealSlot,
    },
    {
      tier: 'mess',
      label: 'all meals at this mess',
      minSamples: 1,
      matches: () => true,
    },
  ];
}

/** Picks the tightest grouping that still has enough history behind it. */
export function selectBaseline(
  samples: PredictionSample[],
  target: PredictionTarget
): { tier: Tier; samples: PredictionSample[] } | null {
  for (const tier of tiersFor(target)) {
    const matched = samples.filter(tier.matches);
    if (matched.length >= tier.minSamples) return { tier, samples: matched };
  }
  return null;
}

function confidenceFor(tier: BaselineTier, sampleSize: number): PredictionConfidence {
  if (sampleSize >= 12 && (tier === 'meal-day-week' || tier === 'meal-day')) return 'high';
  if (sampleSize >= 6) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * Predict total waste (kg) for a single meal.
 *
 * `samples` should already be scoped to the target's mess and contain only
 * records dated strictly before the target (the caller owns that filtering —
 * it's what keeps this honest when back-testing a historical date).
 *
 * Returns null when there is no usable history at all; callers show an
 * empty state rather than inventing a number.
 */
export function predictWaste(
  samples: PredictionSample[],
  target: PredictionTarget
): PredictionResult | null {
  if (samples.length === 0) return null;

  const selected = selectBaseline(samples, target);
  if (!selected) return null;

  const baseWeights = selected.samples.map((s) => recencyWeight(s.date, target.date));
  const baseWastePerPerson = weightedMean(
    selected.samples.map((s) => s.wastePerPerson),
    baseWeights
  );
  if (baseWastePerPerson <= 0) return null;

  // Adjustment factors come from the full sample pool, not the (small) base
  // group — estimating "what does rain do" from 4 rainy Tuesdays would be
  // meaningless, while the mess's whole history has real signal in it.
  const allWeights = samples.map((s) => recencyWeight(s.date, target.date));
  const drivers: PredictionDriver[] = [];

  const addDriver = (
    key: string,
    label: string,
    result: { factor: number; sampleSize: number }
  ) => {
    if (Math.abs(result.factor - 1) < MATERIAL_EFFECT) return;
    drivers.push({
      key,
      label,
      factor: result.factor,
      impactPct: round2((result.factor - 1) * 100),
      sampleSize: result.sampleSize,
    });
  };

  // --- Weather -------------------------------------------------------------
  const targetIsWet = (target.rainfallMm ?? 0) >= RAIN_THRESHOLD_MM;
  if (targetIsWet) {
    addDriver(
      'rain',
      'Rain expected',
      conditionFactor(samples, allWeights, (s) => (s.rainfallMm ?? 0) >= RAIN_THRESHOLD_MM)
    );
  }

  if (target.temperatureC != null) {
    const temps = samples.map((s) => s.temperatureC).filter((t): t is number => t != null);
    if (temps.length >= 8) {
      const avgTemp = mean(temps);
      const hotter = target.temperatureC > avgTemp;
      addDriver(
        'temperature',
        hotter ? 'Warmer than usual' : 'Cooler than usual',
        conditionFactor(samples, allWeights, (s) =>
          s.temperatureC == null ? false : hotter ? s.temperatureC > avgTemp : s.temperatureC <= avgTemp
        )
      );
    }
  }

  // --- Calendar / event ----------------------------------------------------
  if (target.eventType !== 'NORMAL') {
    addDriver(
      'eventType',
      eventDriverLabel(target.eventType),
      conditionFactor(samples, allWeights, (s) => s.eventType === target.eventType)
    );
  }

  // --- Schedule deviation --------------------------------------------------
  if (target.scheduleDeviation) {
    addDriver(
      'scheduleDeviation',
      'Menu deviates from schedule',
      conditionFactor(samples, allWeights, (s) => s.scheduleDeviation)
    );
  }

  // --- Menu composition ----------------------------------------------------
  // Only the flags actually present on the scheduled menu are considered —
  // "no biryani today" isn't a driver worth reporting.
  if (target.menuFlags) {
    const flags: { key: keyof MenuFlags; label: string }[] = [
      { key: 'hasBiryani', label: 'Biryani on the menu' },
      { key: 'hasPaneer', label: 'Paneer on the menu' },
      { key: 'hasDessert', label: 'Dessert on the menu' },
    ];
    for (const flag of flags) {
      if (!target.menuFlags[flag.key]) continue;
      addDriver(
        flag.key,
        flag.label,
        conditionFactor(samples, allWeights, (s) => s.menuFlags?.[flag.key] === true)
      );
    }
  }

  // --- Combine -------------------------------------------------------------
  const combinedFactor = drivers.reduce((acc, d) => acc * d.factor, 1);
  const predictedWastePerPerson = baseWastePerPerson * combinedFactor;

  const providedHeadcount = target.headcount && target.headcount > 0 ? target.headcount : null;
  const expectedHeadcount =
    providedHeadcount ??
    Math.round(
      weightedMean(
        selected.samples.map((s) => s.headcount),
        baseWeights
      )
    );

  const predictedTotalWasteKg = predictedWastePerPerson * expectedHeadcount;

  // Spread comes from how much the base group itself varies, not from the
  // model's own confidence in the adjustments — honest about the fact that
  // "similar meals" have never all landed on the same number.
  const perPersonSpread = stddev(selected.samples.map((s) => s.wastePerPerson));
  const spreadKg = Math.max(
    perPersonSpread * expectedHeadcount,
    predictedTotalWasteKg * MIN_RELATIVE_SPREAD
  );

  return {
    predictedWastePerPerson: round2(predictedWastePerPerson),
    predictedTotalWasteKg: round2(predictedTotalWasteKg),
    rangeLowKg: round2(Math.max(0, predictedTotalWasteKg - spreadKg)),
    rangeHighKg: round2(predictedTotalWasteKg + spreadKg),
    expectedHeadcount,
    headcountSource: providedHeadcount ? 'provided' : 'historical',
    baseline: {
      tier: selected.tier.tier,
      label: selected.tier.label,
      sampleSize: selected.samples.length,
      avgWastePerPerson: round2(baseWastePerPerson),
    },
    drivers,
    confidence: confidenceFor(selected.tier.tier, selected.samples.length),
    method: 'recency-weighted historical baseline with shrunk multiplicative adjustments',
  };
}

function eventDriverLabel(eventType: string): string {
  switch (eventType) {
    case 'HOLIDAY':
      return 'Holiday';
    case 'FESTIVAL':
      return 'Festival';
    case 'COLLEGE_EVENT':
      return 'College event';
    case 'EXAM_PERIOD':
      return 'Exam period';
    default:
      return 'Calendar event';
  }
}

// ---------------------------------------------------------------------------
// Forecast support
// ---------------------------------------------------------------------------

export interface SeasonalWeatherRow {
  date: Date;
  temperatureMeanC: number | null;
  rainMm: number | null;
}

/**
 * Weather for a date we have no cached reading for (a future forecast day).
 *
 * Uses the seasonal normal: the average of every cached reading from the same
 * calendar month, in any year. Chennai's monsoon is strongly seasonal, so a
 * month-of-year average is a far better guess for "a day in November" than
 * the annual mean — and it costs no API calls, which matters when a dashboard
 * would otherwise fire dozens of requests on every load.
 */
export function seasonalWeather(
  rows: SeasonalWeatherRow[],
  targetDate: Date
): { temperatureC: number | null; rainfallMm: number | null } {
  const month = targetDate.getUTCMonth();
  const sameMonth = rows.filter((r) => r.date.getUTCMonth() === month);
  const pool = sameMonth.length > 0 ? sameMonth : rows;

  const temps = pool.map((r) => r.temperatureMeanC).filter((v): v is number => v != null);
  const rains = pool.map((r) => r.rainMm).filter((v): v is number => v != null);

  return {
    temperatureC: temps.length ? round2(mean(temps)) : null,
    rainfallMm: rains.length ? round2(mean(rains)) : null,
  };
}

export interface CalendarContext {
  isHoliday: boolean;
  isExamWeek: boolean;
  isQuizWeek: boolean;
  isMajorEvent: boolean;
}

/**
 * Maps a seeded CalendarDay onto the EventType a coordinator would have
 * picked by hand. Ordered by how strongly each one changes attendance:
 * a holiday empties the mess regardless of what else the day is.
 */
export function eventTypeFromCalendar(day: CalendarContext | null | undefined): string {
  if (!day) return 'NORMAL';
  if (day.isHoliday) return 'HOLIDAY';
  if (day.isMajorEvent) return 'COLLEGE_EVENT';
  if (day.isExamWeek || day.isQuizWeek) return 'EXAM_PERIOD';
  return 'NORMAL';
}
