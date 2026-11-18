import { useEffect, useRef } from "react";

/**
 * useRapidScanner — hardware barcode scanner (USB keyboard-wedge) detector.
 *
 * Scanners emit characters much faster than a human types (typically
 * <20ms between keys) and terminate the code with Enter. We buffer
 * global keydown events, and when Enter arrives we accept the buffer as
 * a scanned code only if:
 *   - length >= minLen
 *   - median inter-key interval <= maxInterval (ms)
 *
 * Editable elements: while focus is in an <input>/<textarea>/contentEditable
 * we *still* observe keystrokes so a scanner beam works no matter what's
 * focused. When we recognise the burst as a scan we prevent the terminating
 * Enter from bubbling (avoids double-submit through the input's own handler)
 * and roll back any characters the scanner just typed into that input.
 */
export type RapidScannerOptions = {
  enabled: boolean;
  onScan: (code: string) => void;
  minLen?: number;
  maxInterval?: number;
  /** ms after a successful scan during which duplicate identical codes are dropped */
  duplicateWindow?: number;
};

export function useRapidScanner(opts: RapidScannerOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const bufChars: string[] = [];
    const bufTimes: number[] = [];
    let lastCode = "";
    let lastCodeAt = 0;
    let bufferOwner: HTMLElement | null = null;

    function reset() {
      bufChars.length = 0;
      bufTimes.length = 0;
      bufferOwner = null;
    }

    function onKey(e: KeyboardEvent) {
      if (!optsRef.current.enabled) return;
      // Ignore modifier chords entirely — those are shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = performance.now();
      const key = e.key;

      if (key === "Enter") {
        const {
          minLen = 3,
          maxInterval = 40,
          duplicateWindow = 250,
          onScan,
        } = optsRef.current;
        // Profile "camera" sets minLen huge to short-circuit here.
        if (minLen > 500) { reset(); return; }
        const code = bufChars.join("");
        const owner = bufferOwner;
        const intervals: number[] = [];
        for (let i = 1; i < bufTimes.length; i++) {
          intervals.push(bufTimes[i] - bufTimes[i - 1]);
        }
        intervals.sort((a, b) => a - b);
        const median =
          intervals.length === 0
            ? 0
            : intervals[Math.floor(intervals.length / 2)];
        const looksScanned =
          code.length >= minLen &&
          (intervals.length === 0 || median <= maxInterval);
        reset();
        if (!looksScanned) return;
        // Duplicate guard — scanners sometimes send the same code twice.
        if (code === lastCode && now - lastCodeAt < duplicateWindow) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lastCode = code;
        lastCodeAt = now;
        e.preventDefault();
        e.stopPropagation();
        // If the burst was typed into an editable field, roll back the
        // characters the scanner injected so the field stays clean.
        if (owner && isEditable(owner)) {
          try {
            if (
              owner instanceof HTMLInputElement ||
              owner instanceof HTMLTextAreaElement
            ) {
              const val = owner.value;
              if (val.endsWith(code)) {
                owner.value = val.slice(0, val.length - code.length);
                owner.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }
          } catch {
            /* noop */
          }
        }
        onScan(code);
        return;
      }

      // Only accept single printable chars into the buffer.
      if (key.length !== 1) {
        // Non-character (Tab, Shift, Arrow…) — do not reset unless the
        // buffer is empty; scanners never emit those.
        return;
      }

      // Reset when inter-key interval is too slow (human typing).
      if (bufTimes.length > 0) {
        const dt = now - bufTimes[bufTimes.length - 1];
        if (dt > 120) {
          reset();
        }
      }
      if (bufChars.length === 0) {
        bufferOwner = (e.target as HTMLElement) ?? null;
      }
      bufChars.push(key);
      bufTimes.push(now);
    }

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

function isEditable(el: HTMLElement): boolean {
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}