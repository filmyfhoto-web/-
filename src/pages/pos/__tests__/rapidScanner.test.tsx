import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useRapidScanner } from "../useRapidScanner";

function Harness({ onScan, enabled = true }: { onScan: (c: string) => void; enabled?: boolean }) {
  useRapidScanner({ enabled, onScan, minLen: 3, maxInterval: 40, duplicateWindow: 250 });
  return <div />;
}

function typeBurst(chars: string, gapMs: number) {
  let t = 0;
  const spy = vi.spyOn(performance, "now");
  spy.mockImplementation(() => (t += 0));
  for (const ch of chars) {
    t += gapMs;
    spy.mockImplementation(() => t);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
  }
  t += gapMs;
  spy.mockImplementation(() => t);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  spy.mockRestore();
}

describe("useRapidScanner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts a fast burst terminated by Enter", () => {
    const onScan = vi.fn();
    render(<Harness onScan={onScan} />);
    act(() => typeBurst("8850123456789", 10));
    expect(onScan).toHaveBeenCalledWith("8850123456789");
  });

  it("ignores human-typed input (slow interval)", () => {
    const onScan = vi.fn();
    render(<Harness onScan={onScan} />);
    act(() => typeBurst("abcd", 200));
    expect(onScan).not.toHaveBeenCalled();
  });

  it("does not fire when disabled", () => {
    const onScan = vi.fn();
    render(<Harness onScan={onScan} enabled={false} />);
    act(() => typeBurst("12345678", 5));
    expect(onScan).not.toHaveBeenCalled();
  });

  it("drops duplicate identical codes within the duplicate window", () => {
    const onScan = vi.fn();
    render(<Harness onScan={onScan} />);
    act(() => typeBurst("55501234", 8));
    act(() => typeBurst("55501234", 8));
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it("handles many bursts back-to-back", () => {
    const onScan = vi.fn();
    render(<Harness onScan={onScan} />);
    for (let i = 0; i < 5; i++) {
      act(() => typeBurst(`CODE${i}${i}${i}${i}`, 8));
    }
    expect(onScan).toHaveBeenCalledTimes(5);
    expect(onScan.mock.calls.map((c) => c[0])).toEqual([
      "CODE0000",
      "CODE1111",
      "CODE2222",
      "CODE3333",
      "CODE4444",
    ]);
  });
});