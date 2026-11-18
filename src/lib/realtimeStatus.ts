/**
 * Tiny observable store for the app-wide realtime connection state.
 * Kept outside React so the single GlobalRealtime channel can publish to any
 * number of small indicators without prop drilling or extra subscriptions.
 */
export type RealtimeState = "connecting" | "online" | "syncing" | "offline";

let state: RealtimeState = "connecting";
const listeners = new Set<(s: RealtimeState) => void>();

export function getRealtimeState(): RealtimeState {
  return state;
}

export function setRealtimeState(next: RealtimeState) {
  if (next === state) return;
  state = next;
  listeners.forEach((fn) => {
    try { fn(state); } catch { /* a broken listener must not break the rest */ }
  });
}

export function subscribeRealtimeState(fn: (s: RealtimeState) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const REALTIME_LABEL_TH: Record<RealtimeState, string> = {
  connecting: "กำลังเชื่อมต่อ",
  online: "ออนไลน์",
  syncing: "กำลังซิงก์",
  offline: "ออฟไลน์",
};

/** Test-only reset. */
export function __resetRealtimeState() {
  state = "connecting";
  listeners.clear();
}
