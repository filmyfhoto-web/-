import { useCallback, useRef, useState } from "react";

/**
 * Prevents double submit / double payment / double stock mutation from rapid
 * taps on touch devices. The guard is synchronous (a ref, not state) so two
 * taps inside the same frame can never both start the action.
 */
export function useSubmitGuard() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}

/**
 * Non-React variant for imperative modules (POS payment, stock apply).
 * Returns a wrapped function that ignores calls while a previous call for the
 * same key is still in flight.
 */
export function createOnceGuard() {
  const inflight = new Set<string>();
  return async function once<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (inflight.has(key)) return undefined;
    inflight.add(key);
    try {
      return await fn();
    } finally {
      inflight.delete(key);
    }
  };
}
