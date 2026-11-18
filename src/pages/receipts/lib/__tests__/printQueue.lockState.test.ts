import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { printQueue } from "../printQueue";

beforeEach(() => {
  printQueue.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  printQueue.reset();
  vi.useRealTimers();
});

describe("printQueue lifecycle lock", () => {
  it("reports isActive() true while jobs are pending or running, false when idle", async () => {
    expect(printQueue.isActive()).toBe(false);

    const events: boolean[] = [];
    const unsub = printQueue.onLifecycle((a) => events.push(a));
    // Initial subscribe fires with current state (idle).
    expect(events).toEqual([false]);

    const p1 = printQueue.enqueue({ id: "a", dispatch: () => {} });
    const p2 = printQueue.enqueue({ id: "b", dispatch: () => {} });
    const p3 = printQueue.enqueue({ id: "c", dispatch: () => {} });

    expect(printQueue.isActive()).toBe(true);
    // Exactly one active transition even though 3 jobs were queued.
    expect(events.filter((e) => e === true).length).toBe(1);

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(printQueue.isActive()).toBe(true);
    await p1;

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(printQueue.isActive()).toBe(true);
    await p2;

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    await p3;

    expect(printQueue.isActive()).toBe(false);
    // Idle fires exactly once at the end (plus the initial subscribe call).
    expect(events.filter((e) => e === false).length).toBe(2);
    unsub();
  });

  it("reset() from an active queue emits an idle transition", () => {
    const events: boolean[] = [];
    const unsub = printQueue.onLifecycle((a) => events.push(a));
    events.length = 0; // drop initial

    printQueue.enqueue({ id: "x", dispatch: () => {} });
    expect(events).toEqual([true]);

    printQueue.reset();
    expect(events).toEqual([true, false]);
    unsub();
  });

  it("beginExternalRun/endExternalRun keeps isActive() true across a full multi-copy run", () => {
    const events: boolean[] = [];
    const unsub = printQueue.onLifecycle((a) => events.push(a));
    events.length = 0;

    // Simulate `printViaCurrentDocument` starting a 3-copy run.
    printQueue.beginExternalRun();
    expect(printQueue.isActive()).toBe(true);
    expect(events).toEqual([true]);

    // Multiple copies dispatch → afterprint fires per copy → still active.
    window.dispatchEvent(new Event("afterprint"));
    window.dispatchEvent(new Event("afterprint"));
    expect(printQueue.isActive()).toBe(true);

    // Final copy finishes → external run ends → single idle transition.
    printQueue.endExternalRun();
    expect(printQueue.isActive()).toBe(false);
    expect(events).toEqual([true, false]);
    unsub();
  });
});