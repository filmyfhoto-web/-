/**
 * Throttle for realtime-driven refetches.
 *
 * A burst of postgres_changes events (or a flapping websocket) must not turn
 * into a burst of queries: the first call runs immediately, further calls
 * inside the window are collapsed into a single trailing run.
 */
export function createThrottledRefresh(fn: () => void | Promise<void>, minIntervalMs = 1500) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = (now: number) => {
    last = now;
    void fn();
  };

  const trigger = () => {
    const now = Date.now();
    const wait = minIntervalMs - (now - last);
    if (wait <= 0) { run(now); return; }
    if (timer !== undefined) return; // trailing run already scheduled
    timer = setTimeout(() => { timer = undefined; run(Date.now()); }, wait);
  };

  trigger.cancel = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
  };

  return trigger;
}
