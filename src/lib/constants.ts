// Fixed constants — the single source of truth for values that must stay
// consistent across Menu Management, Data Collection, and Analytics/filters.
// These are NOT editable through the UI or any API; they mirror the Prisma
// enums of the same name exactly. If you ever need to change this list, you
// must update the Prisma enum, run a migration, and update this file together.

import { MenuTag, MealSlot, WeekType, DayOfWeek, EventType, QuantityUnit, Role } from '@prisma/client';

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

export const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'DATA_COLLECTOR', label: 'Data Collector' },
];

// JS Date#getDay() (0=Sunday..6=Saturday) -> Prisma DayOfWeek enum
export const JS_DAY_TO_DAY_OF_WEEK: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

// The 14-day A/B mess cycle used across all messes: day 0-6 of the cycle is
// Week A, day 7-13 is Week B. Anchor date is the cycle's day-0 (a Monday),
// configurable per deployment via CYCLE_ANCHOR_DATE below if a mess's cycle
// doesn't start on the same date as the others.
export const CYCLE_ANCHOR_DATE = '2024-01-01'; // must be a Monday in your dataset
export const CYCLE_LENGTH_DAYS = 14;

// Every mess in this deployment is a hall on the IIT Madras campus, so the
// weather integration (Phase 4) keys off this single location by default.
// Individual messes can still be given a different lat/lon at creation time
// (see createMessSchema) if that ever changes, but this is the default used
// whenever a mess is created without explicit coordinates.
export const IIT_MADRAS_LOCATION = {
  latitude: 12.99151,
  longitude: 80.23362,
  timezone: 'Asia/Kolkata',
} as const;
