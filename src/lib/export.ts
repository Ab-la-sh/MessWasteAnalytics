// CSV/Excel export for WasteRecord data. Column set is deliberately flat and
// ML-friendly (one row per record, every dimension as its own column,
// booleans as 0/1, tags as a single semicolon-joined string) so the export
// can be fed straight into a notebook/spreadsheet without reshaping.

import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { formatDateOnly } from '@/lib/date-utils';
import type { Prisma } from '@prisma/client';

// The shape produced by the export route's query (see route.ts include clause).
export type ExportableWasteRecord = Prisma.WasteRecordGetPayload<{
  include: {
    mess: { select: { name: true; code: true } };
    menuSlot: true;
  };
}>;

export interface ExportRow {
  date: string;
  mess_code: string;
  mess_name: string;
  meal_slot: string;
  day_of_week: string;
  week_type: string;
  event_type: string;
  headcount: number;
  quantity_prepared: number;
  quantity_unit: string;
  plate_waste_kg: number;
  counter_waste_kg: number;
  packaging_waste_kg: number;
  total_waste_kg: number;
  waste_per_person: number;
  waste_percent: number;
  total_ingredient_cost: number;
  temperature_c: number | '';
  rainfall_mm: number | '';
  schedule_deviation: 0 | 1;
  deviation_reason: string;
  tags: string;
  menu_item_count: number | '';
  menu_pct_gravy_dishes: number | '';
  has_biryani: 0 | 1 | '';
  has_paneer: 0 | 1 | '';
  has_egg_breakfast: 0 | 1 | '';
  has_dessert: 0 | 1 | '';
  has_dosa: 0 | 1 | '';
  has_paratha: 0 | 1 | '';
  notes: string;
}

export function toExportRow(r: ExportableWasteRecord): ExportRow {
  return {
    date: formatDateOnly(r.date),
    mess_code: r.mess.code,
    mess_name: r.mess.name,
    meal_slot: r.mealSlot,
    day_of_week: r.dayOfWeek,
    week_type: r.weekType,
    event_type: r.eventType,
    headcount: r.headcount,
    quantity_prepared: r.quantityPrepared,
    quantity_unit: r.quantityUnit,
    plate_waste_kg: r.plateWasteKg,
    counter_waste_kg: r.counterWasteKg,
    packaging_waste_kg: r.packagingWasteKg,
    total_waste_kg: r.totalWasteKg,
    waste_per_person: r.wastePerPerson,
    waste_percent: r.wastePercent,
    total_ingredient_cost: r.totalIngredientCost,
    temperature_c: r.temperatureC ?? '',
    rainfall_mm: r.rainfallMm ?? '',
    schedule_deviation: r.scheduleDeviation ? 1 : 0,
    deviation_reason: r.deviationReason ?? '',
    tags: r.tags.join(';'),
    menu_item_count: r.menuSlot?.itemCount ?? '',
    menu_pct_gravy_dishes: r.menuSlot?.pctGravyDishes ?? '',
    has_biryani: r.menuSlot ? (r.menuSlot.hasBiryani ? 1 : 0) : '',
    has_paneer: r.menuSlot ? (r.menuSlot.hasPaneer ? 1 : 0) : '',
    has_egg_breakfast: r.menuSlot ? (r.menuSlot.hasEggBreakfast ? 1 : 0) : '',
    has_dessert: r.menuSlot ? (r.menuSlot.hasDessert ? 1 : 0) : '',
    has_dosa: r.menuSlot ? (r.menuSlot.hasDosa ? 1 : 0) : '',
    has_paratha: r.menuSlot ? (r.menuSlot.hasParatha ? 1 : 0) : '',
    notes: r.notes ?? '',
  };
}

export function buildCsv(records: ExportableWasteRecord[]): string {
  const rows = records.map(toExportRow);
  return Papa.unparse(rows);
}

// Returns a Blob rather than a Node Buffer or a raw Uint8Array. NextResponse
// takes a Web `BodyInit`, and both of those are the wrong shape for it in at
// least one TS lib/version combination: Buffer isn't part of the DOM lib at
// all, and `Uint8Array<ArrayBufferLike>` (the type xlsx's writeBuffer output
// gets converted to) doesn't reliably match BodyInit's overloads either — it
// depends on exactly how TS resolves ArrayBufferLike vs ArrayBuffer for that
// call. Blob has no such ambiguity: it's unconditionally a BodyInit.
export async function buildXlsx(records: ExportableWasteRecord[]): Promise<Blob> {
  const rows = records.map(toExportRow);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MessWaste Analytics';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Waste Records');

  if (rows.length > 0) {
    sheet.columns = Object.keys(rows[0]).map((key) => ({
      header: key,
      key,
      width: Math.max(12, key.length + 2),
    }));
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  } else {
    sheet.addRow(['No records match the selected filters']);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportFilename(format: 'csv' | 'xlsx'): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `messwaste-export-${stamp}.${format}`;
}
