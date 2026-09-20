// Display helpers shared by the Records and Analytics pages. Pure functions —
// safe to import from both client components and unit tests.

import { MEAL_SLOTS, DAYS_OF_WEEK, EVENT_TYPES, WEEK_TYPES, MENU_TAGS } from '@/lib/form-options';
import { formatNumber } from '@/lib/utils';
import type { QuantityUnit } from '@/types/models';

type Option = { value: string; label: string };

function labelFrom(list: Option[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

export const mealSlotLabel = (v: string) => labelFrom(MEAL_SLOTS, v);
export const dayOfWeekLabel = (v: string) => labelFrom(DAYS_OF_WEEK, v);
export const eventTypeLabel = (v: string) => labelFrom(EVENT_TYPES, v);
export const weekTypeLabel = (v: string) => labelFrom(WEEK_TYPES, v);
export const menuTagLabel = (v: string) => labelFrom(MENU_TAGS, v);

/** '2024-12-09T00:00:00.000Z' -> '2024-12-09' (records store date-only values in UTC). */
export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** '2024-12-09T…' or '2024-12-09' -> '09 Dec 2024'. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${dateOnly(iso)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Full timestamp (audit fields), shown in the viewer's local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatQuantity(quantity: number, unit: QuantityUnit): string {
  return `${formatNumber(quantity, 1)} ${unit === 'KG' ? 'kg' : 'L'}`;
}

/** Add whole days to a 'YYYY-MM-DD' string (UTC date-only arithmetic). */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
