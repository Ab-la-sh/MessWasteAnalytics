// Column dictionary for the CSV / Excel export, shown on the Reports page.
//
// Typed against ExportRow (the server-side row shape in src/lib/export.ts) so
// that adding, renaming or removing an export column WITHOUT documenting it
// here is a compile error. `import type` is erased at build time, so none of
// the server-side export code (papaparse, exceljs) reaches the browser bundle.

import type { ExportRow } from '@/lib/export';

export type ColumnGroup = 'Identity' | 'Calendar & context' | 'Waste' | 'Volume & cost' | 'Weather' | 'Menu' | 'Notes';

export interface ColumnDoc {
  group: ColumnGroup;
  type: 'text' | 'number' | '0/1' | 'date';
  description: string;
}

const COLUMN_DOCS: Record<keyof ExportRow, ColumnDoc> = {
  date: { group: 'Identity', type: 'date', description: 'Meal date (YYYY-MM-DD).' },
  mess_code: { group: 'Identity', type: 'text', description: 'Short mess code, e.g. M1.' },
  mess_name: { group: 'Identity', type: 'text', description: 'Mess name.' },
  meal_slot: { group: 'Identity', type: 'text', description: 'BREAKFAST, LUNCH, SNACKS or DINNER.' },
  day_of_week: { group: 'Calendar & context', type: 'text', description: 'MONDAY … SUNDAY, derived from the date.' },
  week_type: { group: 'Calendar & context', type: 'text', description: 'A or B — position in the 14-day mess menu cycle.' },
  event_type: {
    group: 'Calendar & context',
    type: 'text',
    description: 'NORMAL, HOLIDAY, FESTIVAL, COLLEGE_EVENT or EXAM_PERIOD.',
  },
  headcount: { group: 'Volume & cost', type: 'number', description: 'People served at this meal.' },
  quantity_prepared: { group: 'Volume & cost', type: 'number', description: 'Food prepared, in quantity_unit.' },
  quantity_unit: { group: 'Volume & cost', type: 'text', description: 'KG or LITRES.' },
  plate_waste_kg: { group: 'Waste', type: 'number', description: 'Waste left on diners’ plates (kg).' },
  counter_waste_kg: { group: 'Waste', type: 'number', description: 'Waste at the serving counter (kg).' },
  packaging_waste_kg: { group: 'Waste', type: 'number', description: 'Packaging waste (kg).' },
  total_waste_kg: { group: 'Waste', type: 'number', description: 'Plate + counter + packaging (kg). Server-computed.' },
  waste_per_person: { group: 'Waste', type: 'number', description: 'total_waste_kg ÷ headcount (kg per person).' },
  waste_percent: { group: 'Waste', type: 'number', description: '(total_waste_kg ÷ quantity_prepared) × 100.' },
  total_ingredient_cost: { group: 'Volume & cost', type: 'number', description: 'Total ingredient cost in ₹.' },
  temperature_c: { group: 'Weather', type: 'number', description: 'Mean temperature that day (°C) — blank if unavailable.' },
  rainfall_mm: { group: 'Weather', type: 'number', description: 'Rainfall that day (mm) — blank if unavailable.' },
  schedule_deviation: { group: 'Menu', type: '0/1', description: '1 if the meal deviated from the scheduled menu.' },
  deviation_reason: { group: 'Menu', type: 'text', description: 'Why it deviated (blank if it did not).' },
  tags: { group: 'Menu', type: 'text', description: 'Menu composition tags actually served, semicolon-separated.' },
  menu_item_count: { group: 'Menu', type: 'number', description: 'Scheduled item count (blank if no scheduled menu is linked).' },
  menu_pct_gravy_dishes: { group: 'Menu', type: 'number', description: 'Scheduled % of gravy dishes (0–100).' },
  has_biryani: { group: 'Menu', type: '0/1', description: 'Scheduled menu includes biryani.' },
  has_paneer: { group: 'Menu', type: '0/1', description: 'Scheduled menu includes paneer.' },
  has_egg_breakfast: { group: 'Menu', type: '0/1', description: 'Scheduled menu includes an egg breakfast.' },
  has_dessert: { group: 'Menu', type: '0/1', description: 'Scheduled menu includes dessert.' },
  has_dosa: { group: 'Menu', type: '0/1', description: 'Scheduled menu includes dosa.' },
  has_paratha: { group: 'Menu', type: '0/1', description: 'Scheduled menu includes paratha.' },
  notes: { group: 'Notes', type: 'text', description: 'Free-text notes from the coordinator.' },
};

/** Columns in file order — keep this object in the same order as ExportRow (the compile-time check covers completeness, not order). */
export const EXPORT_COLUMNS: (ColumnDoc & { name: string })[] = Object.entries(COLUMN_DOCS).map(([name, doc]) => ({
  name,
  ...doc,
}));
