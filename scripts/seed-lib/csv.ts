// Small CSV-reading helper shared by every seed-lib parser.
// Column names are matched case-insensitively with underscore/space/hyphen
// normalized, so "Temp Max", "temp_max" and "temp-max" all resolve the same.

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

export const SEED_DATA_DIR = path.join(process.cwd(), 'prisma', 'seed-data');

export function seedDataPath(filename: string): string {
  return path.join(SEED_DATA_DIR, filename);
}

export function seedFileExists(filename: string): boolean {
  return fs.existsSync(seedDataPath(filename));
}

/** Reads and parses a CSV file in prisma/seed-data/. Returns null if it doesn't exist. */
export function readCsv(filename: string): Record<string, string>[] | null {
  const filePath = seedDataPath(filename);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeKey,
  });

  if (parsed.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] ${filename}: ${parsed.errors.length} parse warning(s), first:`, parsed.errors[0]);
  }

  return parsed.data;
}

export function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Picks the first present column from a list of accepted header aliases (already-normalized keys). */
export function col(row: Record<string, string>, ...aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const v = row[alias];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

export function toBool(v: string | undefined): boolean {
  if (v === undefined) return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

export function toNum(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
