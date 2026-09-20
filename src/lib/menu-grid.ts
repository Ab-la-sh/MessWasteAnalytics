// Pure helpers for the Menu Management grid and slot editor. No React, no
// browser APIs — unit-testable directly.

import { DAYS_OF_WEEK, MEAL_SLOTS } from '@/lib/form-options';
import type { DayOfWeek, MealSlot, MenuSlot, MenuTag, WeekType } from '@/types/models';

/** The six boolean flags on a scheduled meal, in display order. */
export const FLAG_DEFS = [
  { key: 'hasBiryani', label: 'Biryani', short: 'Biryani' },
  { key: 'hasPaneer', label: 'Paneer', short: 'Paneer' },
  { key: 'hasEggBreakfast', label: 'Egg breakfast', short: 'Egg' },
  { key: 'hasDessert', label: 'Dessert', short: 'Dessert' },
  { key: 'hasDosa', label: 'Dosa', short: 'Dosa' },
  { key: 'hasParatha', label: 'Paratha', short: 'Paratha' },
] as const;

export type FlagKey = (typeof FLAG_DEFS)[number]['key'];

/** Slots per week: 7 days x 4 meal slots. */
export const SLOTS_PER_WEEK = DAYS_OF_WEEK.length * MEAL_SLOTS.length;

export function slotKey(weekType: WeekType, day: DayOfWeek, meal: MealSlot): string {
  return `${weekType}|${day}|${meal}`;
}

export function indexSlots(slots: MenuSlot[]): Map<string, MenuSlot> {
  const map = new Map<string, MenuSlot>();
  for (const s of slots) map.set(slotKey(s.weekType, s.dayOfWeek, s.mealSlot), s);
  return map;
}

/** How many of a week's 28 slots have a scheduled meal defined. */
export function countDefined(slots: MenuSlot[], weekType: WeekType): number {
  return slots.filter((s) => s.weekType === weekType).length;
}

export function activeFlags(slot: Pick<MenuSlot, FlagKey>): (typeof FLAG_DEFS)[number][] {
  return FLAG_DEFS.filter((f) => slot[f.key]);
}

// ---------------------------------------------------------------------------
// Editor draft <-> API payload
// ---------------------------------------------------------------------------

export interface SlotDraft {
  /** Kept as strings so the inputs can be empty mid-edit. */
  itemCount: string;
  pctGravyDishes: string;
  flags: Record<FlagKey, boolean>;
  tags: MenuTag[];
  notes: string;
}

export interface SlotPayload {
  itemCount: number;
  pctGravyDishes: number;
  hasBiryani: boolean;
  hasPaneer: boolean;
  hasEggBreakfast: boolean;
  hasDessert: boolean;
  hasDosa: boolean;
  hasParatha: boolean;
  tags: MenuTag[];
  notes: string | null;
}

export function draftFromSlot(slot: MenuSlot | null): SlotDraft {
  return {
    itemCount: slot ? String(slot.itemCount) : '',
    pctGravyDishes: slot ? String(round1(slot.pctGravyDishes)) : '0',
    flags: {
      hasBiryani: slot?.hasBiryani ?? false,
      hasPaneer: slot?.hasPaneer ?? false,
      hasEggBreakfast: slot?.hasEggBreakfast ?? false,
      hasDessert: slot?.hasDessert ?? false,
      hasDosa: slot?.hasDosa ?? false,
      hasParatha: slot?.hasParatha ?? false,
    },
    tags: slot ? [...slot.tags] : [],
    notes: slot?.notes ?? '',
  };
}

export type SlotDraftErrors = Partial<Record<'itemCount' | 'pctGravyDishes', string>>;

export function validateSlotDraft(
  draft: SlotDraft
): { ok: true; value: SlotPayload } | { ok: false; errors: SlotDraftErrors } {
  const errors: SlotDraftErrors = {};

  const itemRaw = draft.itemCount.trim();
  const items = Number(itemRaw);
  if (itemRaw === '' || !Number.isInteger(items) || items < 0) {
    errors.itemCount = 'Enter a whole number, 0 or more';
  }

  const pctRaw = draft.pctGravyDishes.trim();
  const pct = Number(pctRaw);
  if (pctRaw === '' || Number.isNaN(pct) || pct < 0 || pct > 100) {
    errors.pctGravyDishes = 'Enter a percentage between 0 and 100';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      itemCount: items,
      pctGravyDishes: pct,
      ...draft.flags,
      tags: draft.tags,
      notes: draft.notes.trim() || null,
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
