interface RateRecord {
  count: number;
  resetAt: number;
}

const map = new Map<string, RateRecord>();

export function rateLimit(key: string, limit: number, windowMs = 60000) {
  const now = Date.now();
  const record = map.get(key);

  if (!record || now > record.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, resetInMs: windowMs };
  }

  if (record.count >= limit) {
    return { ok: false, resetInMs: record.resetAt - now };
  }

  record.count += 1;
  return { ok: true, resetInMs: record.resetAt - now };
}
