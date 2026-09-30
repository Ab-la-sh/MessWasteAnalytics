// Minimal in-memory sliding-window rate limiter.
//
// Limitation: state lives in the memory of one server instance. On Vercel
// (serverless) each warm instance keeps its own counters, so this slows down
// casual brute-forcing but is not a hard global limit. For a strict limit,
// swap `hit()` for a shared store (e.g. Upstash Redis) — the call sites stay the same.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000; // crude memory cap

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (b.timestamps.every((t) => t <= cutoff)) buckets.delete(k);
    }
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientIp(req: { headers: Headers }): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
