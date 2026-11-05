// Client for the local ML model service (model_service/app.py), reached
// through an ngrok tunnel. Runs server-side only (Vercel API routes) - the
// browser never sees the tunnel URL or the API key.
//
// Design rule: this NEVER throws. If the laptop is off, ngrok is down, the key
// is wrong or the call is slow, it returns null and the caller falls back to
// the built-in baseline in src/lib/prediction.ts. The dashboard keeps working
// whether or not your laptop is on.

export interface ModelDayInput {
  /** YYYY-MM-DD */
  date: string;
  has_biryani: boolean;
  has_dosa: boolean;
  /** Item count across breakfast + lunch + dinner. */
  n_dishes?: number;
  temp_mean_c?: number;
  temp_anomaly?: number;
  /** Trailing 7-day average waste, in crates (1 crate = 30 kg). */
  crates_rollmean7?: number;
}

export interface ModelDayOutput {
  date: string;
  expected_crates: number;
  expected_kg: number;
  range_low_kg: number;
  range_high_kg: number;
  /** Probability of the most likely crate class. */
  confidence: number;
  class_probabilities: Record<string, number>;
}

/** Env values pasted into dashboards often carry stray spaces or quote marks. */
function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
}

const TIMEOUT_MS = Number(clean(process.env.MODEL_TIMEOUT_MS)) || 8000;

/** Reason the most recent call fell back to the baseline (for the diagnostics route). */
let lastError: string | null = null;
export function getLastModelError(): string | null {
  return lastError;
}

/** Which mess the model was trained on (e.g. "M1"). Unset = model is off. */
export function isModelMess(messCode: string): boolean {
  const code = clean(process.env.MODEL_MESS_CODE);
  return code !== '' && code.toUpperCase() === messCode.trim().toUpperCase();
}

export function isModelConfigured(): boolean {
  return clean(process.env.MODEL_SERVICE_URL) !== '' && clean(process.env.MODEL_API_KEY) !== '';
}

export async function predictDailyBatch(items: ModelDayInput[]): Promise<ModelDayOutput[] | null> {
  lastError = null;
  if (!isModelConfigured() || items.length === 0) {
    lastError = 'not configured (MODEL_SERVICE_URL or MODEL_API_KEY empty)';
    return null;
  }

  const rawUrl = clean(process.env.MODEL_SERVICE_URL);
  const base = (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/predict/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': clean(process.env.MODEL_API_KEY),
        // ngrok's free tier serves an HTML interstitial to unknown clients;
        // this header makes it pass requests straight through.
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ items }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      lastError = `service returned HTTP ${res.status}`;
      console.warn(`[model] ${lastError}; using baseline`);
      return null;
    }
    const json = (await res.json()) as { predictions?: ModelDayOutput[] };
    if (!Array.isArray(json.predictions) || json.predictions.length !== items.length) {
      lastError = 'unexpected response shape from model service';
      return null;
    }
    return json.predictions;
  } catch (err) {
    const cause = (err as { cause?: { message?: string; code?: string } })?.cause;
    lastError = `${err instanceof Error ? err.name + ': ' + err.message : String(err)}${
      cause ? ' / cause: ' + (cause.code ?? '') + ' ' + (cause.message ?? '') : ''
    }`;
    console.warn('[model] unreachable; using baseline:', lastError);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
