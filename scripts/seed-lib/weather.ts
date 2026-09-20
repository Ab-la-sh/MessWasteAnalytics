// Parses prisma/seed-data/weather.csv (one row per date, institution-wide)
// into WeatherDaily rows. Since every mess in this deployment shares the
// same IIT Madras campus location, the same daily reading is stored once
// per mess (WeatherDaily is keyed by messId+date, matching how the live
// Open-Meteo integration caches per-mess). Falls back to a synthetic
// Chennai-ish seasonal curve if the CSV isn't present.

import { readCsv, col, toNum, seedFileExists } from './csv';
import { toDateOnly, formatDateOnly, addDaysUTC } from '../../src/lib/date-utils';
import { mulberry32, seedFromString, randRange } from './rng';

export interface WeatherSeedRow {
  date: Date;
  temperatureMaxC: number;
  temperatureMinC: number;
  temperatureMeanC: number;
  precipitationMm: number;
  rainMm: number;
  humidityPercent: number | null;
  source: string;
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

/** Rough Chennai/IIT Madras seasonal climate — used only when weather.csv is absent. */
function syntheticWeatherFor(date: Date): WeatherSeedRow {
  const dayOfYear = Math.floor(
    (date.getTime() - toDateOnly(`${date.getUTCFullYear()}-01-01`).getTime()) / 86400000
  );
  const rand = mulberry32(seedFromString(`weather-${formatDateOnly(date)}`));

  // Chennai: hot & fairly flat April-June, monsoon Oct-Dec, mild Dec-Feb.
  const seasonalMean = 27 + 4 * Math.sin(((dayOfYear - 60) / 365) * 2 * Math.PI);
  const isMonsoon = dayOfYear >= 274 && dayOfYear <= 335; // roughly Oct-Nov

  const meanC = seasonalMean + randRange(rand, -1.5, 1.5);
  const spread = randRange(rand, 4, 7);
  const rain = isMonsoon ? Math.max(0, randRange(rand, -5, 40)) : Math.max(0, randRange(rand, -8, 8));

  return {
    date,
    temperatureMaxC: Math.round((meanC + spread / 2) * 10) / 10,
    temperatureMinC: Math.round((meanC - spread / 2) * 10) / 10,
    temperatureMeanC: Math.round(meanC * 10) / 10,
    precipitationMm: Math.round(rain * 10) / 10,
    rainMm: Math.round(rain * 10) / 10,
    humidityPercent: Math.round(randRange(rand, 55, 85)),
    source: 'synthetic-seed',
  };
}

export function loadWeatherSeedRows(): WeatherSeedRow[] {
  const filename = 'weather.csv';
  const rows = readCsv(filename);

  if (!rows) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] ${filename} not found — generating a synthetic seasonal weather series for 2024.`);
    return daysInRange(YEAR_START, YEAR_END).map(syntheticWeatherFor);
  }

  const byDate = new Map<string, WeatherSeedRow>();
  for (const row of rows) {
    const dateStr = col(row, 'date');
    if (!dateStr) continue;
    const date = toDateOnly(dateStr);

    const max = toNum(col(row, 'temp_max', 'temperature_max', 'tmax'), NaN);
    const min = toNum(col(row, 'temp_min', 'temperature_min', 'tmin'), NaN);
    const meanRaw = col(row, 'temp_mean', 'temperature_mean', 'tmean');
    const mean = meanRaw !== undefined ? toNum(meanRaw) : (max + min) / 2;

    byDate.set(formatDateOnly(date), {
      date,
      temperatureMaxC: Number.isFinite(max) ? max : mean,
      temperatureMinC: Number.isFinite(min) ? min : mean,
      temperatureMeanC: mean,
      precipitationMm: toNum(col(row, 'precipitation', 'precipitation_mm'), 0),
      rainMm: toNum(col(row, 'rain', 'rain_mm'), 0),
      humidityPercent: (() => {
        const h = col(row, 'humidity', 'humidity_percent');
        return h !== undefined ? toNum(h) : null;
      })(),
      source: 'seed-csv',
    });
  }

  // Fill any gap days synthetically so the full year is always covered.
  const all = daysInRange(YEAR_START, YEAR_END);
  let filled = 0;
  const result = all.map((d) => {
    const hit = byDate.get(formatDateOnly(d));
    if (hit) return hit;
    filled += 1;
    return syntheticWeatherFor(d);
  });

  if (filled > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[seed] weather.csv covered ${all.length - filled}/${all.length} days of 2024 — filled the rest synthetically.`);
  }

  return result;
}

export { seedFileExists };
