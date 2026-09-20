// Generates a handful of realistic demo WasteRecord entries per mess, so
// the Dashboard/Analytics/Records pages look complete immediately after
// seeding — not a full year of data (that's what real daily collection is
// for), just enough recent history for KPIs, trend charts and the
// historical-average comparison to have something to show.
//
// Deterministic per (messCode, date, mealSlot) via mulberry32, so re-running
// the seed produces the same demo numbers rather than a new random set.

import type { EventType, MealSlot, MenuTag, WeekType } from '@prisma/client';
import { mulberry32, seedFromString, randInt, randRange } from './rng';
import { computeWasteDerivedFields } from '../../src/lib/calculations';
import { dayOfWeekFromDate, weekTypeFromDate, addDaysUTC, toDateOnly } from '../../src/lib/date-utils';

const MEAL_SLOTS: MealSlot[] = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
const DEMO_WINDOW_DAYS = 21; // trailing 3 weeks of 2024-12
const DEMO_WINDOW_END = '2024-12-31';

// Rough per-meal baselines (headcount, prepared qty, waste %) — enough to
// produce plausible KPI numbers without pretending to be real measurements.
const MEAL_BASELINE: Record<MealSlot, { headcount: [number, number]; prepPerHead: number; costPerKg: number; wastePct: [number, number] }> = {
  BREAKFAST: { headcount: [350, 550], prepPerHead: 0.35, costPerKg: 55, wastePct: [4, 10] },
  LUNCH: { headcount: [500, 800], prepPerHead: 0.5, costPerKg: 70, wastePct: [6, 16] },
  SNACKS: { headcount: [250, 450], prepPerHead: 0.15, costPerKg: 60, wastePct: [3, 9] },
  DINNER: { headcount: [450, 700], prepPerHead: 0.45, costPerKg: 65, wastePct: [5, 14] },
};

export interface DemoRecordSeed {
  date: Date;
  mealSlot: MealSlot;
  weekType: WeekType;
  dayOfWeek: ReturnType<typeof dayOfWeekFromDate>;
  plateWasteKg: number;
  counterWasteKg: number;
  packagingWasteKg: number;
  totalWasteKg: number;
  headcount: number;
  quantityPrepared: number;
  totalIngredientCost: number;
  wastePerPerson: number;
  wastePercent: number;
  eventType: EventType;
  scheduleDeviation: boolean;
  tags: MenuTag[];
}

export function buildDemoRecords(
  messCode: string,
  calendarByDate: Map<string, { isHoliday: boolean; isExamWeek: boolean; isMajorEvent: boolean; isQuizWeek: boolean }>,
  tagsBySlot: Map<string, MenuTag[]> // key: `${weekType}_${dayOfWeek}_${mealSlot}`
): DemoRecordSeed[] {
  const out: DemoRecordSeed[] = [];
  const end = toDateOnly(DEMO_WINDOW_END);
  const start = addDaysUTC(end, -(DEMO_WINDOW_DAYS - 1));

  for (let i = 0; i < DEMO_WINDOW_DAYS; i++) {
    const date = addDaysUTC(start, i);
    const dayOfWeek = dayOfWeekFromDate(date);
    const weekType = weekTypeFromDate(date);
    const dateKey = date.toISOString().slice(0, 10);
    const cal = calendarByDate.get(dateKey);

    for (const mealSlot of MEAL_SLOTS) {
      const rand = mulberry32(seedFromString(`${messCode}-${dateKey}-${mealSlot}`));
      const baseline = MEAL_BASELINE[mealSlot];

      const headcount = randInt(rand, baseline.headcount[0], baseline.headcount[1]);
      const quantityPrepared = Math.round(headcount * baseline.prepPerHead * randRange(rand, 0.95, 1.1) * 10) / 10;
      const wastePctTarget = randRange(rand, baseline.wastePct[0], baseline.wastePct[1]);
      const totalWasteTarget = Math.round(((quantityPrepared * wastePctTarget) / 100) * 10) / 10;

      // Split total waste across plate/counter/packaging in a plausible ratio.
      const plateShare = randRange(rand, 0.55, 0.7);
      const counterShare = randRange(rand, 0.2, 0.35);
      const plateWasteKg = Math.round(totalWasteTarget * plateShare * 10) / 10;
      const counterWasteKg = Math.round(totalWasteTarget * counterShare * 10) / 10;
      const packagingWasteKg = Math.max(0, Math.round((totalWasteTarget - plateWasteKg - counterWasteKg) * 10) / 10);

      const derived = computeWasteDerivedFields({
        plateWasteKg,
        counterWasteKg,
        packagingWasteKg,
        headcount,
        quantityPrepared,
      });

      const totalIngredientCost = Math.round(quantityPrepared * baseline.costPerKg * randRange(rand, 0.9, 1.1));

      let eventType: EventType = 'NORMAL';
      if (cal?.isHoliday) eventType = 'HOLIDAY';
      else if (cal?.isMajorEvent) eventType = 'COLLEGE_EVENT';
      else if (cal?.isExamWeek) eventType = 'EXAM_PERIOD';

      const tagKey = `${weekType}_${dayOfWeek}_${mealSlot}`;
      const tags = tagsBySlot.get(tagKey) ?? [];

      out.push({
        date,
        mealSlot,
        weekType,
        dayOfWeek,
        plateWasteKg,
        counterWasteKg,
        packagingWasteKg,
        totalWasteKg: derived.totalWasteKg,
        headcount,
        quantityPrepared,
        totalIngredientCost,
        wastePerPerson: derived.wastePerPerson,
        wastePercent: derived.wastePercent,
        eventType,
        scheduleDeviation: rand() < 0.08,
        tags,
      });
    }
  }

  return out;
}
