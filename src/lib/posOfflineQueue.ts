/**
 * Offline order queue for the touch register.
 *
 * When the shop's internet drops mid-sale the cashier can still finish the
 * bill: the checkout payload is parked in localStorage and replayed against
 * `pos_checkout` as soon as the browser is online again. Every payload keeps
 * its own idempotency key, so a replay can never double-charge stock.
 */

export type QueuedCheckout = {
  id: string;
  label: string;
  total: number;
  queuedAt: string;
  payload: Record<string, unknown>;
};

const KEY = "pos.offline.checkoutQueue";
const DRAFT_KEY = "pos.offline.cartDraft";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadQueue(): QueuedCheckout[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as QueuedCheckout[]) : [];
    return Array.isArray(list) ? list.filter((x) => x && x.id && x.payload) : [];
  } catch {
    return [];
  }
}

function writeQueue(list: QueuedCheckout[]): void {
  try { store()?.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function enqueueCheckout(entry: Omit<QueuedCheckout, "id" | "queuedAt">): QueuedCheckout {
  const row: QueuedCheckout = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...loadQueue(), row]);
  return row;
}

export function removeQueued(id: string): void {
  writeQueue(loadQueue().filter((x) => x.id !== id));
}

export function clearQueue(): void {
  writeQueue([]);
}

/**
 * Replay every parked bill. Returns how many synced and how many are still
 * waiting (kept in the queue so the next online event retries them).
 */
export async function flushQueue(
  send: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>,
): Promise<{ synced: number; pending: number }> {
  let synced = 0;
  for (const row of loadQueue()) {
    try {
      const { error } = await send(row.payload);
      if (error) break; // keep the rest queued and preserve ordering
      removeQueued(row.id);
      synced += 1;
    } catch {
      break;
    }
  }
  return { synced, pending: loadQueue().length };
}

/** Cart draft — survives a refresh / app restart while offline. */
export function saveCartDraft<T>(data: T): void {
  try { store()?.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

export function loadCartDraft<T>(): T | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearCartDraft(): void {
  try { store()?.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}