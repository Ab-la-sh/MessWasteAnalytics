// Parses prisma/seed-data/academic-calendar.csv into CalendarDay rows.
// Any field not present in the CSV (or the file itself missing) is derived
// from the date where possible (day-of-week, weekend, week type via the
// 14-day cycle anchor) — only holiday/exam/event flags have no sensible
// derived default, so they simply stay false/null when absent.

import type { WeekType } from '@prisma/client';
import { readCsv, col, toBool, seedFileExists } from './csv';
import { toDateOnly, formatDateOnly, dayOfWeekFromDate, weekTypeFromDate, addDaysUTC } from '../../src/lib/date-utils';

export interface CalendarDaySeedRow {
  date: Date;
  dayOfWeek: ReturnType<typeof dayOfWeekFromDate>;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isQuizWeek: boolean;
  isExamWeek: boolean;
  isMajorEvent: boolean;
  eventName: string | null;
  weekType: WeekType;
}

const YEAR_START = '2024-01-01';
const YEAR_END = '2024-12-31';

function daysInRange(startStr: string, endStr: string): Date[] {
  const out: Date[] = [];
  let d = toDateOnly(startStr);
  const end = toDateOnly(endStr);
  while (d.getTime() <= end.getTime()) {
    out.push(d);
    d = addDaysUTC(d, 1);
  }
  return out;
}

function defaultRowFor(date: Date): CalendarDaySeedRow {
  const dayOfWeek = dayOfWeekFromDate(date);
  return {
    date,
    dayOfWeek,
    isWeekend: dayOfWeek === 'SATURDAY' || dayOfWeek === 'SUNDAY',
    isHoliday: false,
    holidayName: null,
    isQuizWeek: false,
    isExamWeek: false,
    isMajorEvent: false,
    eventName: null,
    weekType: weekTypeFromDate(date),
  };
}

export function loadCalendarSeedRows(): CalendarDaySeedRow[] {
  const filename = 'academic-calendar.csv';
  const rows = readCsv(filename);
  const all = daysInRange(YEAR_START, YEAR_END);

  if (!rows) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] ${filename} not found — deriving a default calendar (weekday/weekend only, no holidays/exams) for 2024.`);
    return all.map(defaultRowFor);
  }

  const byDate = new Map<string, CalendarDaySeedRow>();
  for (const row of rows) {
    const dateStr = col(row, 'date');
    if (!dateStr) continue;
    const date = toDateOnly(dateStr);
    const base = defaultRowFor(date);

    const weekTypeRaw = col(row, 'mess_cycle', 'week_type', 'menu_week_type');
    byDate.set(formatDateOnly(date), {
      date,
      dayOfWeek: base.dayOfWeek,
      isWeekend: col(row, 'is_weekend', 'weekend') !== undefined ? toBool(col(row, 'is_weekend', 'weekend')) : base.isWeekend,
      isHoliday: toBool(col(row, 'is_holiday', 'holiday')),
      holidayName: col(row, 'holiday_name') ?? null,
      isQuizWeek: toBool(col(row, 'is_quiz_week', 'quiz_week')),
      isExamWeek: toBool(col(row, 'is_exam_week', 'exam_week')),
      isMajorEvent: toBool(col(row, 'is_major_event', 'major_event')),
      eventName: col(row, 'event_name') ?? null,
      weekType: weekTypeRaw?.trim().toUpperCase() === 'B' ? 'B' : weekTypeRaw?.trim().toUpperCase() === 'A' ? 'A' : base.weekType,
    });
  }

  let filled = 0;
  const result = all.map((d) => {
    const hit = byDate.get(formatDateOnly(d));
    if (hit) return hit;
    filled += 1;
    return defaultRowFor(d);
  });

  if (filled > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] academic-calendar.csv covered ${all.length - filled}/${all.length} days of 2024 — filled the rest with defaults.`);
  }

  return result;
}

export { seedFileExists };
