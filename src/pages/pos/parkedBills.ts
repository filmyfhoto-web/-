/**
 * Parked bills — local, per-device queue of held POS carts.
 * Persisted in localStorage so the cashier can pause a bill,
 * serve another customer, and resume it later without a backend round-trip.
 */

import type { PosCustomerRef } from "./posTypes";

export type ParkedCartLine = {
  product_id: string;
  name: string;
  unit: string;
  unit_price: number;
  qty: number;
  stock: number;
  variant_id: string | null;
  variant_label: string | null;
  sku: string | null;
  /** Per-line discount in baht (optional so older bills restore cleanly). */
  discount?: number;
  /** SKU image → parent product image → null (placeholder). Optional so
   *  bills parked by older builds still restore cleanly. */
  image_url?: string | null;
  base_id: string | null;
  ratio: number | null;
};

export type ParkedBill = {
  id: string;
  label: string;
  parked_at: string;
  lines: ParkedCartLine[];
  discount: number;
  customer: PosCustomerRef | null;
  /** Sales-channel tag chosen for the bill (storefront/facebook/…). */
  source?: string | null;
  /** Which shop/till parked the bill. */
  store_key?: string | null;
  register_key?: string | null;
};

const KEY = "pos.parked.bills.v1";
const MAX = 50;

export function loadParkedBills(): ParkedBill[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((b) => b && typeof b.id === "string" && Array.isArray(b.lines));
  } catch {
    return [];
  }
}

function save(bills: ParkedBill[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bills.slice(0, MAX)));
  } catch {
    /* quota — ignore */
  }
}

export function parkBill(input: Omit<ParkedBill, "id" | "parked_at"> & { id?: string }): ParkedBill {
  const bill: ParkedBill = {
    id: input.id ?? `park-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    parked_at: new Date().toISOString(),
    label: input.label,
    lines: input.lines,
    discount: input.discount,
    customer: input.customer,
    source: input.source ?? null,
    store_key: input.store_key ?? null,
    register_key: input.register_key ?? null,
  };
  const next = [bill, ...loadParkedBills().filter((b) => b.id !== bill.id)];
  save(next);
  return bill;
}

export function removeParkedBill(id: string): void {
  save(loadParkedBills().filter((b) => b.id !== id));
}

export function clearParkedBills(): void {
  save([]);
}