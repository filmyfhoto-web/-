import { supabase } from "@/integrations/supabase/client";

export type StockAdjustMode = "add" | "reduce" | "set";

export interface StockAdjustInput {
  productId: string;
  variantId?: string | null;
  mode: StockAdjustMode;
  qty: number;
  reason?: string;
  reference?: string | null;
  note?: string | null;
  idempotencyKey?: string;
}

export function previewAfter(before: number, mode: StockAdjustMode, qty: number): number {
  if (mode === "add") return before + qty;
  if (mode === "reduce") return before - qty;
  return qty;
}

export function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function adjustStock(input: StockAdjustInput): Promise<string> {
  const { data, error } = await (supabase as any).rpc("pos_adjust_stock", {
    p_product_id: input.productId,
    p_variant_id: input.variantId ?? null,
    p_mode: input.mode,
    p_qty: input.qty,
    p_reason: input.reason ?? "other",
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
    p_idempotency_key: input.idempotencyKey ?? makeIdempotencyKey(),
  });
  if (error) throw error;
  return data as string;
}
