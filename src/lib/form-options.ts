// Client-safe mirror of src/lib/constants.ts. The server-side file imports
// @prisma/client for its enum types, which must never end up in a browser
// bundle — so the same fixed value/label lists are duplicated here using the
// plain string-union types from src/types/models.ts. If you change the
// MenuTag/MealSlot/etc. list, update BOTH files together (same rule as the
// server-side file's own header comment).

import type { MenuTag, MealSlot, WeekType, DayOfWeek, EventType, QuantityUnit } from '@/types/models';

export const MENU_TAGS: { value: MenuTag; label: string }[] = [
  { value: 'VEGETARIAN', label: 'Vegetarian' },
  { value: 'NON_VEGETARIAN', label: 'Non-Vegetarian' },
  { value: 'FRIED', label: 'Fried' },
  { value: 'GRAVY', label: 'Gravy' },
  { value: 'DRY', label: 'Dry' },
  { value: 'RICE_BASED', label: 'Rice-Based' },
  { value: 'BREAD_BASED', label: 'Bread-Based' },
  { value: 'SPICY', label: 'Spicy' },
  { value: 'SWEET', label: 'Sweet' },
  { value: 'DESSERT', label: 'Dessert' },
];

export const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'SNACKS', label: 'Snacks' },
  { value: 'DINNER', label: 'Dinner' },
];

export const WEEK_TYPES: { value: WeekType; label: string }[] = [
  { value: 'A', label: 'Week A' },
  { value: 'B', label: 'Week B' },
];

export const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
];

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'FESTIVAL', label: 'Festival' },
  { value: 'COLLEGE_EVENT', label: 'College Event' },
  { value: 'EXAM_PERIOD', label: 'Exam Period' },
];

export const QUANTITY_UNITS: { value: QuantityUnit; label: string }[] = [
  { value: 'KG', label: 'kg' },
  { value: 'LITRES', label: 'litres' },
];

// JS Date#getDay() (0=Sunday..6=Saturday) -> DayOfWeek. Mirrors
// src/lib/constants.ts's JS_DAY_TO_DAY_OF_WEEK exactly.
export const JS_DAY_TO_DAY_OF_WEEK: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

// Mirrors CYCLE_ANCHOR_DATE / CYCLE_LENGTH_DAYS in src/lib/constants.ts —
// used client-side only to *display* the expected week type as the date
// field changes, before the server confirms it on submit.
export const CYCLE_ANCHOR_DATE = '2024-01-01';
export const CYCLE_LENGTH_DAYS = 14;

export function weekTypeFromDateClient(dateStr: string): WeekType {
  const anchor = new Date(`${CYCLE_ANCHOR_DATE}T00:00:00Z`);
  const date = new Date(`${dateStr}T00:00:00Z`);
  const diffDays = Math.floor((date.getTime() - anchor.getTime()) / 86400000);
  const cycleDay = ((diffDays % CYCLE_LENGTH_DAYS) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS;
  return cycleDay < 7 ? 'A' : 'B';
}

export function dayOfWeekFromDateClient(dateStr: string): DayOfWeek {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return JS_DAY_TO_DAY_OF_WEEK[date.getUTCDay()];
}
