// Recent barcode scans across the POS. Persisted in localStorage.

export type ScanHistorySource = "usb" | "camera" | "mobile" | "manual" | "photo";
export type ScanHistoryStatus = "matched" | "not_found" | "invalid";

export type ScanHistoryEntry = {
  id: string;
  time: number;
  raw: string;
  normalized: string | null;
  status: ScanHistoryStatus;
  productName?: string | null;
  source: ScanHistorySource;
};

const KEY = "pos.scanHistory.v1";
const MAX = 200;
const DUP_WINDOW_MS = 800;

type Listener = (list: ScanHistoryEntry[]) => void;
const listeners = new Set<Listener>();

function read(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ScanHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(list: ScanHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* noop */
  }
  listeners.forEach((l) => {
    try { l(list); } catch { /* noop */ }
  });
}

export function loadScanHistory(): ScanHistoryEntry[] {
  return read();
}

export function clearScanHistory() {
  write([]);
}

export function subscribeScanHistory(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function pushScanHistory(entry: Omit<ScanHistoryEntry, "id" | "time"> & { time?: number }) {
  const list = read();
  const now = entry.time ?? Date.now();
  // Suppress exact-duplicate scan within short window (scanner double-fire).
  const last = list[0];
  if (
    last &&
    last.raw === entry.raw &&
    last.status === entry.status &&
    now - last.time < DUP_WINDOW_MS
  ) {
    return last;
  }
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const next: ScanHistoryEntry = {
    id,
    time: now,
    raw: entry.raw,
    normalized: entry.normalized ?? null,
    status: entry.status,
    productName: entry.productName ?? null,
    source: entry.source,
  };
  const combined = [next, ...list].slice(0, MAX);
  write(combined);
  return next;
}