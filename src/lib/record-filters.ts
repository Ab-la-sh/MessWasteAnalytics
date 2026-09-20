// Pure helpers for the Records page filter bar: state shape, URL/query-string
// mapping, and export-URL building. No React and no browser APIs, so it can be
// unit-tested directly and reused by the Reports page in the next batch.

import { MEAL_SLOTS, WEEK_TYPES, DAYS_OF_WEEK, EVENT_TYPES, MENU_TAGS } from '@/lib/form-options';
import type { MealSlot, WeekType, DayOfWeek, EventType, MenuTag } from '@/types/models';

export interface RecordFilterState {
  search: string;
  dateFrom: string; // YYYY-MM-DD or ''
  dateTo: string; // YYYY-MM-DD or ''
  mealSlot: MealSlot | '';
  weekType: WeekType | '';
  dayOfWeek: DayOfWeek | '';
  eventType: EventType | '';
  /** '' = any, 'true' = deviated from schedule, 'false' = followed schedule */
  deviation: '' | 'true' | 'false';
  tags: MenuTag[];
}

export const EMPTY_RECORD_FILTERS: RecordFilterState = {
  search: '',
  dateFrom: '',
  dateTo: '',
  mealSlot: '',
  weekType: '',
  dayOfWeek: '',
  eventType: '',
  deviation: '',
  tags: [],
};

// Keys accepted by GET /api/waste-records `sortBy` that the table exposes.
export type RecordSortKey =
  | 'date'
  | 'headcount'
  | 'quantityPrepared'
  | 'totalWasteKg'
  | 'wastePerPerson'
  | 'wastePercent'
  | 'totalIngredientCost';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filters that live in the collapsible "More filters" panel (everything except search, dates, meal). */
export function countAdvancedFilters(f: RecordFilterState): number {
  return [f.weekType, f.dayOfWeek, f.eventType, f.deviation].filter(Boolean).length + (f.tags.length > 0 ? 1 : 0);
}

export function hasActiveFilters(f: RecordFilterState): boolean {
  return Boolean(f.search.trim() || f.dateFrom || f.dateTo || f.mealSlot) || countAdvancedFilters(f) > 0;
}

/**
 * Query-string params for GET /api/waste-records (and the export endpoint).
 * Empty values are omitted; `tags` is sent as repeated keys by the API client.
 * `messId` is the top-bar selection (undefined = all messes, admins only).
 */
export function buildRecordQuery(
  f: RecordFilterState,
  messId?: string
): Record<string, string | string[] | undefined> {
  return {
    messId,
    search: f.search.trim() || undefined,
    dateFrom: f.dateFrom || undefined,
    dateTo: f.dateTo || undefined,
    mealSlot: f.mealSlot || undefined,
    weekType: f.weekType || undefined,
    dayOfWeek: f.dayOfWeek || undefined,
    eventType: f.eventType || undefined,
    scheduleDeviation: f.deviation || undefined,
    tags: f.tags.length > 0 ? f.tags : undefined,
  };
}

/** Same filters as the table, as a download URL for Admin CSV/Excel export. */
export function buildExportUrl(f: RecordFilterState, messId: string | undefined, format: 'csv' | 'xlsx'): string {
  const params = new URLSearchParams();
  const query = buildRecordQuery(f, messId);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, value);
  }
  params.set('format', format);
  return `/api/export/waste-records?${params.toString()}`;
}

function pick<T extends string>(raw: string | null, allowed: { value: T }[]): T | '' {
  return allowed.find((o) => o.value === raw)?.value ?? '';
}

/**
 * Reads initial filters from URL params (used by the top-bar search and the
 * "view this record" links on the Analytics anomaly table). Unknown or
 * malformed values are ignored rather than trusted.
 */
export function filtersFromSearchParams(get: (key: string) => string | null): Partial<RecordFilterState> {
  const out: Partial<RecordFilterState> = {};

  const search = get('search');
  if (search && search.trim()) out.search = search.trim();

  const dateFrom = get('dateFrom');
  if (dateFrom && ISO_DATE.test(dateFrom)) out.dateFrom = dateFrom;
  const dateTo = get('dateTo');
  if (dateTo && ISO_DATE.test(dateTo)) out.dateTo = dateTo;

  const mealSlot = pick<MealSlot>(get('mealSlot'), MEAL_SLOTS);
  if (mealSlot) out.mealSlot = mealSlot;
  const weekType = pick<WeekType>(get('weekType'), WEEK_TYPES);
  if (weekType) out.weekType = weekType;
  const dayOfWeek = pick<DayOfWeek>(get('dayOfWeek'), DAYS_OF_WEEK);
  if (dayOfWeek) out.dayOfWeek = dayOfWeek;
  const eventType = pick<EventType>(get('eventType'), EVENT_TYPES);
  if (eventType) out.eventType = eventType;

  const deviation = get('scheduleDeviation');
  if (deviation === 'true' || deviation === 'false') out.deviation = deviation;

  return out;
}

// Re-exported so callers validating tag input have one import.
export const KNOWN_MENU_TAGS = MENU_TAGS.map((t) => t.value);
