import { DayOfWeek, WeekType } from '@prisma/client';
import { CYCLE_ANCHOR_DATE, CYCLE_LENGTH_DAYS, JS_DAY_TO_DAY_OF_WEEK } from './constants';

/** Normalize a Date or 'YYYY-MM-DD' string to a UTC midnight Date (date-only semantics). */
export function toDateOnly(input: string | Date): Date {
  const d = typeof input === 'string' ? new Date(input + 'T00:00:00.000Z') : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Derive the DayOfWeek enum value from a date. */
export function dayOfWeekFromDate(date: string | Date): DayOfWeek {
  const d = toDateOnly(date);
  return JS_DAY_TO_DAY_OF_WEEK[d.getUTCDay()];
}

/**
 * Derive the A/B week type from a date using the fixed 14-day cycle anchor.
 * Days 0-6 since the anchor (mod 14) = Week A, days 7-13 = Week B.
 * This is a sensible default; per-mess cycle offsets can be added later by
 * storing an anchor per Mess if a mess's cycle doesn't align with others.
 */
export function weekTypeFromDate(date: string | Date): WeekType {
  const target = toDateOnly(date);
  const anchor = toDateOnly(CYCLE_ANCHOR_DATE);
  const diffDays = Math.floor((target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  const mod = ((diffDays % CYCLE_LENGTH_DAYS) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS;
  return mod < CYCLE_LENGTH_DAYS / 2 ? 'A' : 'B';
}

/** Which day (0-13) of the 14-day cycle a date falls on. Useful for seed expansion. */
export function cycleDayIndex(date: string | Date): number {
  const target = toDateOnly(date);
  const anchor = toDateOnly(CYCLE_ANCHOR_DATE);
  const diffDays = Math.floor((target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
  return ((diffDays % CYCLE_LENGTH_DAYS) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Add (or subtract, with a negative n) whole days to a date, UTC date-only semantics. */
export function addDaysUTC(date: string | Date, days: number): Date {
  const d = toDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
