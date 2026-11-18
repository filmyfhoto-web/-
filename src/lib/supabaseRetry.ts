/**
 * Retry wrapper for transient Supabase / network errors.
 * Retries 1–3 times with exponential backoff (200ms, 600ms, 1500ms)
 * only for retryable conditions (network, timeout, 5xx, fetch failures).
 * Auth/permission/4xx errors fail immediately.
 */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_PATTERNS = [
  /network/i,
  /failed to fetch/i,
  /fetch failed/i,
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /socket hang up/i,
  /load failed/i,
];

function isRetryable(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as any;
  const status = Number(anyErr?.status ?? anyErr?.statusCode ?? anyErr?.code);
  if (Number.isFinite(status) && RETRYABLE_STATUS.has(status)) return true;
  const msg = String(anyErr?.message ?? err ?? "");
  return RETRYABLE_PATTERNS.some((re) => re.test(msg));
}

const DEFAULT_BACKOFF_MS = [200, 600, 1500];

export interface RetryOptions {
  retries?: number;
  backoffMs?: number[];
  onRetry?: (attempt: number, err: unknown) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const max = Math.max(0, Math.min(opts.retries ?? 3, backoff.length));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= max || !isRetryable(err)) throw err;
      try { opts.onRetry?.(attempt + 1, err); } catch { /* noop */ }
      await new Promise((r) => setTimeout(r, backoff[attempt] ?? 1500));
    }
  }
  throw lastErr;
}

/**
 * Convenience helper for Supabase query builders that resolve to
 * `{ data, error }`. Retries on transient errors; throws the original error
 * shape on final failure so existing callers can keep their error handling.
 */
export async function withRetryQuery<T>(
  build: () => PromiseLike<{ data: T | null; error: unknown }>,
  opts: RetryOptions = {}
): Promise<{ data: T | null; error: unknown }> {
  return withRetry(async () => {
    const res = await build();
    if (res.error && isRetryable(res.error)) throw res.error;
    return res;
  }, opts);
}

export { isRetryable as _isRetryable };