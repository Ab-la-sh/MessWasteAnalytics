// Parses prisma/seed-data/mess-{n}-menu.csv into per-(weekType, dayOfWeek)
// MenuSlot rows (Breakfast/Lunch/Snacks/Dinner), per the mapping documented
// in prisma/seed-data/README.md. Falls back to deterministic synthetic data
// per mess if the CSV isn't present, so `npm run seed` always runs.

import type { DayOfWeek, MenuTag, WeekType } from '@prisma/client';
import { readCsv, col, toBool, toNum } from './csv';
import { dayOfWeekFromDate, weekTypeFromDate } from '../../src/lib/date-utils';
import { mulberry32, seedFromString, randInt, randRange } from './rng';

export interface MenuSlotSeedRow {
  weekType: WeekType;
  dayOfWeek: DayOfWeek;
  mealSlot: 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';
  itemCount: number;
  pctGravyDishes: number;
  hasBiryani: boolean;
  hasPaneer: boolean;
  hasEggBreakfast: boolean;
  hasDessert: boolean;
  hasDosa: boolean;
  hasParatha: boolean;
  tags: MenuTag[];
}

interface DayAggregate {
  n: number;
  breakfastItems: number;
  lunchItems: number;
  dinnerItems: number;
  pctGravy: number;
  biryaniVotes: number;
  paneerVotes: number;
  eggBfVotes: number;
  dessertVotes: number;
  dosaVotes: number;
  parathaVotes: number;
}

const CYCLE_KEYS: { weekType: WeekType; dayOfWeek: DayOfWeek }[] = (() => {
  const weekTypes: WeekType[] = ['A', 'B'];
  const days: DayOfWeek[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ];
  const out: { weekType: WeekType; dayOfWeek: DayOfWeek }[] = [];
  for (const wt of weekTypes) for (const d of days) out.push({ weekType: wt, dayOfWeek: d });
  return out;
})();

function keyOf(weekType: WeekType, dayOfWeek: DayOfWeek): string {
  return `${weekType}_${dayOfWeek}`;
}

/** Reads mess-{n}-menu.csv (if present) and averages/majority-votes every row onto its
 *  (weekType, dayOfWeek) bucket, so this works whether the file has 14 rows or 365. */
function aggregateFromCsv(rows: Record<string, string>[]): Map<string, DayAggregate> {
  const buckets = new Map<string, DayAggregate>();

  for (const row of rows) {
    const dateStr = col(row, 'date');
    if (!dateStr) continue;

    // Prefer the CSV's own week-type column when present; otherwise derive
    // from the date via our 14-day cycle anchor.
    const csvWeekType = col(row, 'menu_week_type', 'week_type', 'mess_cycle');
    const weekType: WeekType =
      csvWeekType?.trim().toUpperCase() === 'B' ? 'B' : csvWeekType?.trim().toUpperCase() === 'A' ? 'A' : weekTypeFromDate(dateStr);
    const dayOfWeek = dayOfWeekFromDate(dateStr);
    const key = keyOf(weekType, dayOfWeek);

    const existing = buckets.get(key) ?? {
      n: 0,
      breakfastItems: 0,
      lunchItems: 0,
      dinnerItems: 0,
      pctGravy: 0,
      biryaniVotes: 0,
      paneerVotes: 0,
      eggBfVotes: 0,
      dessertVotes: 0,
      dosaVotes: 0,
      parathaVotes: 0,
    };

    existing.n += 1;
    existing.breakfastItems += toNum(col(row, 'n_breakfast_items'), 4);
    existing.lunchItems += toNum(col(row, 'n_lunch_items'), 6);
    existing.dinnerItems += toNum(col(row, 'n_dinner_items'), 5);
    existing.pctGravy += toNum(col(row, 'pct_gravy_dishes'), 40);
    existing.biryaniVotes += toBool(col(row, 'has_biryani')) ? 1 : 0;
    existing.paneerVotes += toBool(col(row, 'has_paneer')) ? 1 : 0;
    existing.eggBfVotes += toBool(col(row, 'has_egg_bf', 'has_egg_breakfast')) ? 1 : 0;
    existing.dessertVotes += toBool(col(row, 'has_desert', 'has_dessert')) ? 1 : 0;
    existing.dosaVotes += toBool(col(row, 'has_dosa')) ? 1 : 0;
    existing.parathaVotes += toBool(col(row, 'has_paratha')) ? 1 : 0;

    buckets.set(key, existing);
  }

  return buckets;
}

function syntheticDay(messCode: string, weekType: WeekType, dayOfWeek: DayOfWeek): DayAggregate {
  const rand = mulberry32(seedFromString(`${messCode}-${weekType}-${dayOfWeek}-menu`));
  const isWeekend = dayOfWeek === 'SATURDAY' || dayOfWeek === 'SUNDAY';
  return {
    n: 1,
    breakfastItems: randInt(rand, 3, 6),
    lunchItems: randInt(rand, 5, 9),
    dinnerItems: randInt(rand, 4, 8),
    pctGravy: randRange(rand, 30, 70),
    biryaniVotes: rand() < (isWeekend ? 0.4 : 0.12) ? 1 : 0,
    paneerVotes: rand() < 0.3 ? 1 : 0,
    eggBfVotes: rand() < 0.35 ? 1 : 0,
    dessertVotes: rand() < (isWeekend ? 0.6 : 0.2) ? 1 : 0,
    dosaVotes: rand() < 0.3 ? 1 : 0,
    parathaVotes: rand() < 0.25 ? 1 : 0,
  };
}

function majority(votes: number, n: number): boolean {
  return n > 0 && votes / n >= 0.5;
}

function inferTags(opts: {
  mealSlot: MenuSlotSeedRow['mealSlot'];
  pctGravy: number;
  hasBiryani: boolean;
  hasPaneer: boolean;
  hasEggBreakfast: boolean;
  hasDessert: boolean;
  hasDosa: boolean;
  hasParatha: boolean;
}): MenuTag[] {
  const tags = new Set<MenuTag>();

  if (opts.mealSlot !== 'SNACKS') {
    tags.add(opts.pctGravy >= 50 ? 'GRAVY' : 'DRY');
  }
  if (opts.hasBiryani) tags.add('RICE_BASED');
  if (opts.hasDosa) tags.add('RICE_BASED');
  if (opts.hasParatha) tags.add('BREAD_BASED');
  if (opts.hasDessert) {
    tags.add('DESSERT');
    tags.add('SWEET');
  }
  // Veg/non-veg is a heuristic: eggs (breakfast) and biryani (assumed to
  // sometimes include meat) push toward non-veg; paneer is a veg signal.
  // Absent stronger data this defaults to Vegetarian — correct per-slot in
  // Menu Management once the real classification is available.
  if (opts.hasEggBreakfast || opts.hasBiryani) {
    tags.add('NON_VEGETARIAN');
  } else {
    tags.add('VEGETARIAN');
  }
  if (opts.hasPaneer) tags.add('VEGETARIAN');

  return Array.from(tags);
}

/** Builds the 4 MenuSlot rows (Breakfast/Lunch/Snacks/Dinner) for one (weekType, dayOfWeek). */
function buildDayMenuSlots(agg: DayAggregate, weekType: WeekType, dayOfWeek: DayOfWeek): MenuSlotSeedRow[] {
  const n = Math.max(agg.n, 1);
  const pctGravy = Math.round((agg.pctGravy / n) * 10) / 10;
  const hasBiryani = majority(agg.biryaniVotes, n);
  const hasPaneer = majority(agg.paneerVotes, n);
  const hasEggBreakfast = majority(agg.eggBfVotes, n);
  const hasDessert = majority(agg.dessertVotes, n);
  const hasDosa = majority(agg.dosaVotes, n);
  const hasParatha = majority(agg.parathaVotes, n);

  const breakfast: MenuSlotSeedRow = {
    weekType,
    dayOfWeek,
    mealSlot: 'BREAKFAST',
    itemCount: Math.max(1, Math.round(agg.breakfastItems / n)),
    pctGravyDishes: 0,
    hasBiryani: false,
    hasPaneer: false,
    hasEggBreakfast,
    hasDessert: false,
    hasDosa,
    hasParatha,
    tags: inferTags({
      mealSlot: 'BREAKFAST',
      pctGravy: 0,
      hasBiryani: false,
      hasPaneer: false,
      hasEggBreakfast,
      hasDessert: false,
      hasDosa,
      hasParatha,
    }),
  };

  const lunch: MenuSlotSeedRow = {
    weekType,
    dayOfWeek,
    mealSlot: 'LUNCH',
    itemCount: Math.max(1, Math.round(agg.lunchItems / n)),
    pctGravyDishes: pctGravy,
    hasBiryani,
    hasPaneer,
    hasEggBreakfast: false,
    hasDessert,
    hasDosa: false,
    hasParatha: false,
    tags: inferTags({
      mealSlot: 'LUNCH',
      pctGravy,
      hasBiryani,
      hasPaneer,
      hasEggBreakfast: false,
      hasDessert,
      hasDosa: false,
      hasParatha: false,
    }),
  };

  const dinner: MenuSlotSeedRow = {
    weekType,
    dayOfWeek,
    mealSlot: 'DINNER',
    itemCount: Math.max(1, Math.round(agg.dinnerItems / n)),
    pctGravyDishes: pctGravy,
    hasBiryani,
    hasPaneer,
    hasEggBreakfast: false,
    hasDessert,
    hasDosa: false,
    hasParatha: false,
    tags: inferTags({
      mealSlot: 'DINNER',
      pctGravy,
      hasBiryani,
      hasPaneer,
      hasEggBreakfast: false,
      hasDessert,
      hasDosa: false,
      hasParatha: false,
    }),
  };

  // Snacks has no source columns (see seed-data/README.md) — a modest,
  // editable default so the form always has something to compare against.
  const snacks: MenuSlotSeedRow = {
    weekType,
    dayOfWeek,
    mealSlot: 'SNACKS',
    itemCount: 2,
    pctGravyDishes: 0,
    hasBiryani: false,
    hasPaneer: false,
    hasEggBreakfast: false,
    hasDessert: false,
    hasDosa: false,
    hasParatha: false,
    tags: ['VEGETARIAN', 'DRY'],
  };

  return [breakfast, lunch, snacks, dinner];
}

/** Public entry point: mess-{n}-menu.csv -> full 56-row (14 days x 4 meals) MenuSlot seed set. */
export function loadMenuSlotSeedRows(messNumber: number, messCode: string): MenuSlotSeedRow[] {
  const filename = `mess-${messNumber}-menu.csv`;
  const rows = readCsv(filename);

  const buckets = rows ? aggregateFromCsv(rows) : new Map<string, DayAggregate>();
  if (!rows) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] ${filename} not found — generating synthetic menu data for ${messCode}.`);
  } else if (buckets.size < CYCLE_KEYS.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[seed] ${filename} only covered ${buckets.size}/${CYCLE_KEYS.length} cycle days — filling the rest synthetically.`
    );
  }

  const out: MenuSlotSeedRow[] = [];
  for (const { weekType, dayOfWeek } of CYCLE_KEYS) {
    const agg = buckets.get(keyOf(weekType, dayOfWeek)) ?? syntheticDay(messCode, weekType, dayOfWeek);
    out.push(...buildDayMenuSlots(agg, weekType, dayOfWeek));
  }
  return out;
}
