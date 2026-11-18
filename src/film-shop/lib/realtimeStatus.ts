import { useEffect, useRef, useState } from 'react';

export type RealtimeState = 'connected' | 'connecting' | 'offline';

type Listener = () => void;

const channelStatus = new Map<string, string>();
const statusListeners = new Set<Listener>();
const refreshListeners = new Set<Listener>();

let lastSyncedAt: number | null = null;
let refreshing = false;

function emitStatus() {
  statusListeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function reportChannelStatus(key: string, status: string) {
  const prev = channelStatus.get(key);
  if (prev === status) return;
  channelStatus.set(key, status);
  if (status === 'SUBSCRIBED') markSynced();
  emitStatus();
}

export function unregisterChannel(key: string) {
  if (channelStatus.delete(key)) emitStatus();
}

export function markSynced() {
  lastSyncedAt = Date.now();
  emitStatus();
}

export function getLastSyncedAt() {
  return lastSyncedAt;
}

export function getRealtimeState(): RealtimeState {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const values = [...channelStatus.values()];
  if (values.length === 0) return 'connecting';
  if (values.some((v) => v === 'SUBSCRIBED')) return 'connected';
  if (values.every((v) => v === 'CHANNEL_ERROR' || v === 'TIMED_OUT' || v === 'CLOSED')) return 'offline';
  return 'connecting';
}

/** Ask every subscribed data hook to refetch now. */
export async function requestGlobalRefresh() {
  refreshing = true;
  emitStatus();
  refreshListeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
  // Give fetches a beat so the spinner is visible and honest.
  await new Promise((r) => setTimeout(r, 600));
  refreshing = false;
  markSynced();
}

export function onGlobalRefresh(cb: Listener) {
  refreshListeners.add(cb);
  return () => { refreshListeners.delete(cb); };
}

/** Subscribe a refetch callback to the global "refresh now" signal. */
export function useGlobalRefresh(cb: Listener) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => onGlobalRefresh(() => ref.current?.()), []);
}

export function useRealtimeStatus() {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    statusListeners.add(bump);
    window.addEventListener('online', bump);
    window.addEventListener('offline', bump);
    return () => {
      statusListeners.delete(bump);
      window.removeEventListener('online', bump);
      window.removeEventListener('offline', bump);
    };
  }, []);
  return {
    state: getRealtimeState(),
    lastSyncedAt,
    refreshing,
    refresh: requestGlobalRefresh,
  };
}
