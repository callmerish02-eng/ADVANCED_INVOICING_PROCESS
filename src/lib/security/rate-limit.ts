/**
 * Rate limiter using in-memory sliding window.
 *
 * For Vercel serverless deployments, in-memory rate limiting is reset on
 * every cold start — which is acceptable for low-stakes auth throttling on
 * an internal tool. For stricter protection, swap this for an Upstash Redis
 * limiter (see comments at bottom).
 */

interface Bucket {
  count: number;
  firstAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000; // 1 minute

export function rateLimit(
  key: string,
  maxPerMinute: number,
): { ok: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now - b.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: now });
    return { ok: true, remaining: maxPerMinute - 1, resetInMs: WINDOW_MS };
  }

  if (b.count >= maxPerMinute) {
    return {
      ok: false,
      remaining: 0,
      resetInMs: WINDOW_MS - (now - b.firstAt),
    };
  }

  b.count += 1;
  return {
    ok: true,
    remaining: maxPerMinute - b.count,
    resetInMs: WINDOW_MS - (now - b.firstAt),
  };
}

// For production on Vercel, replace the above with:
// import { Ratelimit } from '@upstash/ratelimit';
// import { Redis } from '@upstash/redis';
// export const ratelimit = new Ratelimit({
//   redis: Redis.fromEnv(),
//   limiter: Ratelimit.slidingWindow(10, '1 m'),
//   prefix: 'inv-tracker',
// });
