/**
 * Sequential print queue.
 *
 * The browser print dialog is *modal per tab* — firing `window.print()`
 * twice in a row (via setTimeout) can overlap or drop the second call
 * entirely on Chrome/Safari. Jobs are drained one at a time, and each
 * job resolves only after the browser fires `afterprint` (or a safety
 * timeout elapses). Callers that need to print N copies enqueue N jobs
 * and get a deterministic 1-2-3 order with no overlap.
 */

export type PrintJob = {
  id: string;
  label?: string;
  /** Fire window.print()/w.print()/cw.print(); MUST be synchronous. */
  dispatch: () => void;
};

export type PrintQueueStatus = {
  running: boolean;
  pending: number;
  currentId: string | null;
  currentLabel: string | null;
  completed: number;
};

type Listener = (s: PrintQueueStatus) => void;

type InternalJob = PrintJob & {
  resolve: () => void;
  reject: (e: unknown) => void;
};

class PrintQueue {
  private queue: InternalJob[] = [];
  private current: InternalJob | null = null;
  private completed = 0;
  private listeners = new Set<Listener>();
  private afterPrintHandler: (() => void) | null = null;
  private safetyTimer = 0;
  private lifecycleListeners = new Set<(active: boolean) => void>();
  /**
   * External-run counter: `printViaCurrentDocument` and other callers that
   * run their own copy loop bump this so `isActive()` stays true across all
   * copies of the run, and subscribers see one clean active→idle transition.
   */
  private externalRuns = 0;
  /** Max ms to wait for `afterprint` before advancing anyway. */
  private readonly SAFETY_TIMEOUT_MS = 60_000;
  /** Gap between finishing one job and starting the next. */
  private readonly GAP_MS = 120;

  enqueue(job: PrintJob): Promise<void> {
    return new Promise((resolve, reject) => {
      const wasIdle = !this.current && this.queue.length === 0;
      this.queue.push({ ...job, resolve, reject });
      this.emit();
      if (wasIdle) this.emitLifecycle(true);
      if (!this.current) this.drain();
    });
  }

  status(): PrintQueueStatus {
    return {
      running: !!this.current,
      pending: this.queue.length,
      currentId: this.current?.id ?? null,
      currentLabel: this.current?.label ?? null,
      completed: this.completed,
    };
  }

  /**
   * Returns true while a job is currently dispatching OR waiting in the
   * queue. Callers use this to freeze layout/scale between copies so the
   * printed pages don't jump when the browser triggers reflow between
   * `beforeprint`/`afterprint` cycles.
   */
  isActive(): boolean {
    return !!this.current || this.queue.length > 0 || this.externalRuns > 0;
  }

  /**
   * Notify the queue that an external caller has started a multi-copy
   * print run (they manage `window.print()` + `afterprint` themselves).
   * Keeps `isActive()` true and fires the active-lifecycle event so
   * scale-freezing subscribers engage for the whole run.
   */
  beginExternalRun(): void {
    const wasIdle = !this.isActive();
    this.externalRuns += 1;
    if (wasIdle) this.emitLifecycle(true);
  }

  /** Pair with `beginExternalRun`. Emits idle when the run count reaches 0. */
  endExternalRun(): void {
    if (this.externalRuns <= 0) return;
    this.externalRuns -= 1;
    if (!this.isActive()) this.emitLifecycle(false);
  }

  /**
   * Subscribe to queue lifecycle transitions (idle → active → idle).
   * The callback fires with `true` right before the first job starts and
   * `false` after the last job resolves. Fires immediately with the
   * current state on subscribe.
   */
  onLifecycle(fn: (active: boolean) => void): () => void {
    this.lifecycleListeners.add(fn);
    try { fn(this.isActive()); } catch { /* noop */ }
    return () => { this.lifecycleListeners.delete(fn); };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => { this.listeners.delete(fn); };
  }

  /** Test-only: drop pending jobs without running them. */
  reset(): void {
    const wasActive = this.isActive();
    this.queue = [];
    this.current = null;
    this.completed = 0;
    this.externalRuns = 0;
    this.detachAfterPrint();
    this.emit();
    if (wasActive) this.emitLifecycle(false);
  }

  private emit() {
    const s = this.status();
    this.listeners.forEach((fn) => { try { fn(s); } catch { /* noop */ } });
  }

  private emitLifecycle(active: boolean) {
    this.lifecycleListeners.forEach((fn) => { try { fn(active); } catch { /* noop */ } });
  }

  private detachAfterPrint() {
    try { if (this.afterPrintHandler) window.removeEventListener("afterprint", this.afterPrintHandler); } catch { /* noop */ }
    try { if (this.safetyTimer) window.clearTimeout(this.safetyTimer); } catch { /* noop */ }
    this.afterPrintHandler = null;
    this.safetyTimer = 0;
  }

  private advance() {
    const job = this.current;
    this.current = null;
    this.completed++;
    this.detachAfterPrint();
    if (job) {
      try { job.resolve(); } catch { /* noop */ }
    }
    this.emit();
    if (this.queue.length > 0) {
      window.setTimeout(() => this.drain(), this.GAP_MS);
    } else {
      this.emitLifecycle(false);
    }
  }

  private drain() {
    if (this.current) return;
    const next = this.queue.shift();
    if (!next) { this.emit(); this.emitLifecycle(false); return; }
    this.current = next;
    this.emit();

    let advanced = false;
    const advanceOnce = () => {
      if (advanced) return;
      advanced = true;
      this.advance();
    };
    this.afterPrintHandler = advanceOnce;
    try { window.addEventListener("afterprint", this.afterPrintHandler); } catch { /* noop */ }
    this.safetyTimer = window.setTimeout(advanceOnce, this.SAFETY_TIMEOUT_MS);

    try {
      next.dispatch();
    } catch (e) {
      try { next.reject(e); } catch { /* noop */ }
      this.current = null;
      this.detachAfterPrint();
      this.emit();
      if (this.queue.length > 0) {
        window.setTimeout(() => this.drain(), this.GAP_MS);
      } else {
        this.emitLifecycle(false);
      }
    }
  }
}

export const printQueue = new PrintQueue();

/**
 * Convenience: enqueue N identical dispatches (one per copy) and resolve
 * when the last one completes. Preserves order and never overlaps.
 */
export function enqueueCopies(
  baseId: string,
  copies: number,
  dispatch: (copyIndex: number) => void,
  label?: string,
): Promise<void> {
  const n = Math.min(50, Math.max(1, Math.round(copies)));
  const promises: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    promises.push(
      printQueue.enqueue({
        id: `${baseId}#${i + 1}`,
        label: label ? `${label} (${i + 1}/${n})` : undefined,
        dispatch: () => dispatch(i),
      }),
    );
  }
  return Promise.all(promises).then(() => undefined);
}
