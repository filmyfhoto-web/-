import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { printQueue, enqueueCopies } from "../printQueue";

beforeEach(() => {
  printQueue.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  printQueue.reset();
  vi.useRealTimers();
});

describe("printQueue", () => {
  it("runs jobs FIFO and waits for afterprint between each", async () => {
    const order: string[] = [];
    const p1 = printQueue.enqueue({ id: "a", dispatch: () => { order.push("a"); } });
    const p2 = printQueue.enqueue({ id: "b", dispatch: () => { order.push("b"); } });
    const p3 = printQueue.enqueue({ id: "c", dispatch: () => { order.push("c"); } });

    // First job dispatches immediately (sync).
    expect(order).toEqual(["a"]);
    // No further job until afterprint fires.
    await vi.advanceTimersByTimeAsync(500);
    expect(order).toEqual(["a"]);

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(order).toEqual(["a", "b"]);
    await p1;

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(order).toEqual(["a", "b", "c"]);
    await p2;

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    await p3;

    expect(printQueue.status()).toMatchObject({ running: false, pending: 0, completed: 3 });
  });

  it("enqueueCopies dispatches N times in order, respecting afterprint", async () => {
    const calls: number[] = [];
    const done = enqueueCopies("copy", 3, (i) => calls.push(i), "test");
    expect(calls).toEqual([0]);

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toEqual([0, 1]);

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toEqual([0, 1, 2]);

    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    await done;
  });

  it("safety timeout advances the queue if afterprint never fires", async () => {
    const order: string[] = [];
    const p1 = printQueue.enqueue({ id: "x", dispatch: () => { order.push("x"); } });
    const p2 = printQueue.enqueue({ id: "y", dispatch: () => { order.push("y"); } });
    expect(order).toEqual(["x"]);

    // Fast-forward past the 60s safety timeout.
    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(200);
    expect(order).toEqual(["x", "y"]);
    await p1;
    window.dispatchEvent(new Event("afterprint"));
    await vi.advanceTimersByTimeAsync(200);
    await p2;
  });

  it("subscribers receive status updates", async () => {
    const seen: number[] = [];
    const unsub = printQueue.subscribe((s) => seen.push(s.pending));
    printQueue.enqueue({ id: "a", dispatch: () => {} });
    printQueue.enqueue({ id: "b", dispatch: () => {} });
    // Initial + two enqueue emits.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
