// Lightweight in-memory rate limiter for edge functions.
//
// Protects realtime / notification endpoints from repeated calls (a looping
// service worker, a stuck retry, or an abusive client). Sliding window per
// caller key, kept in the isolate's memory: cheap, no extra DB round-trip, and
// enough to blunt burst loops. It is a throttle, not an auth control — real
// authorization still happens in each function.

export type RateLimitRule = { limit: number; windowMs: number };
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

const buckets = new Map<string, number[]>();

/** Pure sliding-window check. `now` is injectable for tests. */
export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  const from = now - rule.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > from);
  if (hits.length >= rule.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + rule.windowMs - now) / 1000));
    buckets.set(key, hits);
    return { ok: false, remaining: 0, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so a long-lived isolate can't grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => t > from)) buckets.delete(k);
    }
  }
  return { ok: true, remaining: rule.limit - hits.length, retryAfterSec: 0 };
}

/** Test helper — drops all counters. */
export function resetRateLimits() {
  buckets.clear();
}

/** Stable caller key: identity first, then client IP, then a shared bucket. */
export function callerKey(req: Request, scope: string, identity?: string | null): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  return `${scope}:${identity ?? `ip:${ip}`}`;
}

/** Standard 429 body + headers. */
export function tooManyRequests(result: RateLimitResult, headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify({ error: "rate_limited", retry_after: result.retryAfterSec }),
    {
      status: 429,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    },
  );
}
