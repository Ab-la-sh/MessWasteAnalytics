// Real Open-Meteo integration — no API key required (per the spec).
//
// Open-Meteo splits "recent/near-real-time" data from "long-range historical
// archive" data across two endpoints with different latency characteristics:
//   - Forecast API   (api.open-meteo.com/v1/forecast): serves today, future
//     forecast days, and — via start_date/end_date — the last ~92 days.
//     This is the one with the freshest data for recent dates.
//   - Archive API     (archive-api.open-meteo.com/v1/archive): ERA5
//     reanalysis, authoritative for older dates, but has a ~5-6 day lag
//     before a given date's data is finalized and available.
//
// We pick whichever endpoint actually has the date: recent dates (within
// ARCHIVE_LAG_DAYS of today) go to the forecast endpoint, older dates go to
// the archive endpoint.
import { prisma } from '@/lib/prisma';
import { formatDateOnly } from '@/lib/date-utils';
import type { WeatherDaily } from '@prisma/client';

const FORECAST_BASE_URL = process.env.OPEN_METEO_FORECAST_URL ?? 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE_URL = process.env.OPEN_METEO_ARCHIVE_URL ?? 'https://archive-api.open-meteo.com/v1/archive';

const ARCHIVE_LAG_DAYS = 6;
const FETCH_TIMEOUT_MS = 8000;

const DAILY_PARAMS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'temperature_2m_mean',
  'precipitation_sum',
  'rain_sum',
].join(',');

interface OpenMeteoDailyResponse {
  daily?: {
    time: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_mean?: (number | null)[];
    precipitation_sum?: (number | null)[];
    rain_sum?: (number | null)[];
  };
}

export interface FetchedWeather {
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  temperatureMeanC: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
}

function pickEndpoint(date: Date): { baseUrl: string; source: string } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  return diffDays > ARCHIVE_LAG_DAYS
    ? { baseUrl: ARCHIVE_BASE_URL, source: 'open-meteo-archive' }
    : { baseUrl: FORECAST_BASE_URL, source: 'open-meteo-forecast' };
}

/**
 * Calls Open-Meteo for a single date at a single location. Returns null on
 * any failure (network error, timeout, non-200, missing daily data) rather
 * than throwing — callers treat a miss as "show the fallback state", never
 * as a reason to fail the whole request.
 */
export async function fetchWeatherFromApi(
  latitude: number,
  longitude: number,
  date: Date,
  timezone = 'Asia/Kolkata'
): Promise<{ weather: FetchedWeather; source: string } | null> {
  const dateStr = formatDateOnly(date);
  const { baseUrl, source } = pickEndpoint(date);

  const url = new URL(baseUrl);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('start_date', dateStr);
  url.searchParams.set('end_date', dateStr);
  url.searchParams.set('daily', DAILY_PARAMS);
  url.searchParams.set('timezone', timezone);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[weather] Open-Meteo ${res.status} for ${dateStr} @ ${latitude},${longitude}`);
      return null;
    }

    const body = (await res.json()) as OpenMeteoDailyResponse;
    const idx = body.daily?.time?.indexOf(dateStr) ?? -1;
    if (idx === -1) return null;

    return {
      source,
      weather: {
        temperatureMaxC: body.daily?.temperature_2m_max?.[idx] ?? null,
        temperatureMinC: body.daily?.temperature_2m_min?.[idx] ?? null,
        temperatureMeanC: body.daily?.temperature_2m_mean?.[idx] ?? null,
        precipitationMm: body.daily?.precipitation_sum?.[idx] ?? null,
        rainMm: body.daily?.rain_sum?.[idx] ?? null,
      },
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[weather] fetch failed for ${dateStr} @ ${latitude},${longitude}:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface WeatherResult {
  weather: WeatherDaily | null;
  fromCache: boolean;
  fetchFailed: boolean;
}

/**
 * Cache-first weather lookup: checks WeatherDaily for (messId, date) first;
 * only calls the Open-Meteo API on a miss, then persists the result so the
 * same mess/date never re-hits the API. Never throws — a failed fetch comes
 * back as { weather: null, fetchFailed: true } for the caller to degrade
 * gracefully (per the spec's "loading/fallback state if the API call fails").
 */
export async function getOrFetchWeather(
  mess: { id: string; latitude: number; longitude: number; timezone: string },
  date: Date
): Promise<WeatherResult> {
  const cached = await prisma.weatherDaily.findUnique({
    where: { messId_date: { messId: mess.id, date } },
  });
  if (cached) {
    return { weather: cached, fromCache: true, fetchFailed: false };
  }

  const fetched = await fetchWeatherFromApi(mess.latitude, mess.longitude, date, mess.timezone);
  if (!fetched) {
    return { weather: null, fromCache: false, fetchFailed: true };
  }

  // Upsert (not create) — guards against a rare race where two requests for
  // the same new mess/date both miss the cache and fetch concurrently.
  const weather = await prisma.weatherDaily.upsert({
    where: { messId_date: { messId: mess.id, date } },
    create: {
      messId: mess.id,
      date,
      temperatureMaxC: fetched.weather.temperatureMaxC,
      temperatureMinC: fetched.weather.temperatureMinC,
      temperatureMeanC: fetched.weather.temperatureMeanC,
      precipitationMm: fetched.weather.precipitationMm,
      rainMm: fetched.weather.rainMm,
      source: fetched.source,
    },
    update: {}, // another request already wrote it first; just read it back
  });

  return { weather, fromCache: false, fetchFailed: false };
}
