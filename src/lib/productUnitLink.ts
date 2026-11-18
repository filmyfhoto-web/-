import { supabase } from "@/integrations/supabase/client";

/**
 * Linked-unit products (สินค้าสัมพันธ์ — wrapper → base + ratio).
 *
 * The DB is the single source of truth:
 *   - table  public.product_unit_links(wrapper_id UNIQUE, base_id, ratio, enabled)
 *   - view   public.v_product_effective_stock  → floor(base.stock / ratio)
 *   - RPC    public.set_product_unit_link(_wrapper_id, _base_id, _ratio)
 *   - RPC    public.unset_product_unit_link(_wrapper_id)
 *
 * This module provides:
 *   - pure validation helpers used by UI + Excel import + tests
 *   - typed client wrappers around the RPCs
 *   - derived-availability helper for POS cart UIs
 */

export type UnitLinkRow = {
  id?: string;
  wrapper_id: string;
  base_id: string;
  ratio: number;
  enabled: boolean;
};

export type LinkValidationInput = {
  wrapperId: string;
  baseId: string;
  ratio: number | string;
  /** existing links used for chain/cycle checks (from the same file or DB). */
  otherLinks?: Array<{ wrapper_id: string; base_id: string; enabled: boolean }>;
  /** wrapper flags used for hard rejects. */
  wrapperHasVariants?: boolean;
  baseHasVariants?: boolean;
  wrapperActive?: boolean;
  baseActive?: boolean;
};

export type LinkValidationError =
  | "wrapper_and_base_required"
  | "self_link_forbidden"
  | "ratio_must_be_positive_integer"
  | "wrapper_inactive"
  | "base_inactive"
  | "wrapper_has_variants_conflict"
  | "base_has_variants_conflict"
  | "base_is_itself_a_wrapper_no_chain"
  | "wrapper_is_already_base_of_other_wrapper";

export const LINK_ERROR_MESSAGES_TH: Record<LinkValidationError, string> = {
  wrapper_and_base_required: "ต้องระบุทั้งสินค้าห่อและสินค้าหน่วยเล็ก",
  self_link_forbidden: "ห้ามผูกสินค้ากับตัวเอง",
  ratio_must_be_positive_integer: "อัตราส่วนต้องเป็นจำนวนเต็มบวก",
  wrapper_inactive: "สินค้าห่อไม่พร้อมใช้งานหรือถูกลบ",
  base_inactive: "สินค้าหน่วยเล็กไม่พร้อมใช้งานหรือถูกลบ",
  wrapper_has_variants_conflict: "สินค้าห่อมี SKU ย่อยแล้ว ไม่สามารถผูกหน่วยเล็กได้",
  base_has_variants_conflict: "สินค้าหน่วยเล็กมี SKU ย่อยแล้ว ไม่สามารถถูกผูกได้",
  base_is_itself_a_wrapper_no_chain: "สินค้าหน่วยเล็กถูกใช้เป็นสินค้าห่ออยู่แล้ว (ห้ามผูกซ้อน)",
  wrapper_is_already_base_of_other_wrapper: "สินค้านี้ถูกใช้เป็นหน่วยเล็กของสินค้าอื่น (ห้ามผูกวน)",
};

export function coerceRatio(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

export function validateLinkInput(input: LinkValidationInput): LinkValidationError | null {
  const { wrapperId, baseId } = input;
  if (!wrapperId || !baseId) return "wrapper_and_base_required";
  if (wrapperId === baseId) return "self_link_forbidden";
  const ratio = coerceRatio(input.ratio);
  if (ratio == null) return "ratio_must_be_positive_integer";
  if (input.wrapperActive === false) return "wrapper_inactive";
  if (input.baseActive === false) return "base_inactive";
  if (input.wrapperHasVariants) return "wrapper_has_variants_conflict";
  if (input.baseHasVariants) return "base_has_variants_conflict";

  const enabledOthers = (input.otherLinks ?? []).filter((l) => l.enabled);
  // No chain: base must not itself be a wrapper.
  if (enabledOthers.some((l) => l.wrapper_id === baseId)) {
    return "base_is_itself_a_wrapper_no_chain";
  }
  // No cycle / no promotion: wrapper must not currently be a base of anything else.
  if (enabledOthers.some((l) => l.base_id === wrapperId && l.wrapper_id !== wrapperId)) {
    return "wrapper_is_already_base_of_other_wrapper";
  }
  return null;
}

/** Compute derived wrapper availability. Returns { available, remainder }. */
export function deriveWrapperAvailability(baseStock: number, ratio: number): { available: number; remainder: number } {
  if (!Number.isFinite(baseStock) || baseStock < 0) return { available: 0, remainder: 0 };
  if (!Number.isInteger(ratio) || ratio <= 0) return { available: 0, remainder: 0 };
  const available = Math.floor(baseStock / ratio);
  const remainder = baseStock - available * ratio;
  return { available, remainder };
}

/**
 * Effective stock resolution: for each product, return the amount that can be
 * sold. Wrappers with an enabled link derive from their base; everyone else
 * keeps their own stock. Used by /pos/stock display and /pos catalog cards.
 */
export type EffectiveStockInfo = {
  productId: string;
  ownStock: number;
  effectiveStock: number;
  baseId: string | null;
  ratio: number | null;
  baseStock: number | null;
  remainder: number | null;
  isLinked: boolean;
};

export function buildEffectiveStockMap(
  products: ReadonlyArray<{ id: string; stock: number | null | undefined }>,
  links: ReadonlyArray<UnitLinkRow>,
): Map<string, EffectiveStockInfo> {
  const byId = new Map<string, number>();
  for (const p of products) byId.set(p.id, Number(p.stock ?? 0));
  const enabledByWrapper = new Map<string, UnitLinkRow>();
  for (const l of links) if (l.enabled) enabledByWrapper.set(l.wrapper_id, l);
  const out = new Map<string, EffectiveStockInfo>();
  for (const p of products) {
    const own = Number(p.stock ?? 0);
    const link = enabledByWrapper.get(p.id);
    if (!link) {
      out.set(p.id, {
        productId: p.id, ownStock: own, effectiveStock: own,
        baseId: null, ratio: null, baseStock: null, remainder: null, isLinked: false,
      });
    } else {
      const bs = byId.get(link.base_id);
      const baseStock = typeof bs === "number" ? bs : 0;
      const { available, remainder } = deriveWrapperAvailability(baseStock, link.ratio);
      out.set(p.id, {
        productId: p.id, ownStock: own, effectiveStock: available,
        baseId: link.base_id, ratio: link.ratio, baseStock, remainder, isLinked: true,
      });
    }
  }
  return out;
}

/**
 * Aggregate base demand across every cart line that shares a base.
 * A base-line consumes 1 unit per qty. A wrapper-line consumes ratio units per qty.
 * Returns a map baseProductId → total base units required.
 * A base product's own id may be a key too, when a line sells the base directly.
 */
export function computeAggregateBaseDemand(
  lines: ReadonlyArray<{ product_id: string; qty: number; base_id?: string | null; ratio?: number | null }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    const q = Number(l.qty ?? 0);
    if (!(q > 0)) continue;
    if (l.base_id && l.ratio && l.ratio > 0) {
      out.set(l.base_id, (out.get(l.base_id) ?? 0) + q * l.ratio);
    } else {
      out.set(l.product_id, (out.get(l.product_id) ?? 0) + q);
    }
  }
  return out;
}

/**
 * True if adding `deltaQty` more of `candidate` to `existingLines` would push
 * the aggregate demand on any base product above the base's physical stock.
 * Base stock is read from the pre-computed effective-stock map (which stores
 * `baseStock` for wrappers and `ownStock` for everything else).
 */
export function wouldExceedBaseStock(
  existingLines: ReadonlyArray<{ product_id: string; qty: number; base_id?: string | null; ratio?: number | null }>,
  candidate: { product_id: string; base_id?: string | null; ratio?: number | null },
  deltaQty: number,
  physicalStockByProductId: ReadonlyMap<string, number>,
): { ok: boolean; baseId?: string; available?: number; requested?: number } {
  const projected = [...existingLines, { ...candidate, qty: deltaQty }];
  const demand = computeAggregateBaseDemand(projected);
  for (const [pid, req] of demand) {
    const cap = physicalStockByProductId.get(pid) ?? 0;
    if (req > cap) return { ok: false, baseId: pid, available: cap, requested: req };
  }
  return { ok: true };
}

export async function loadUnitLink(wrapperId: string): Promise<UnitLinkRow | null> {
  const { data, error } = await supabase
    .from("product_unit_links")
    .select("id,wrapper_id,base_id,ratio,enabled")
    .eq("wrapper_id", wrapperId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export async function loadAllUnitLinks(): Promise<UnitLinkRow[]> {
  const { data, error } = await supabase
    .from("product_unit_links")
    .select("id,wrapper_id,base_id,ratio,enabled")
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as any as UnitLinkRow[];
}

export async function saveUnitLink(wrapperId: string, baseId: string, ratio: number): Promise<UnitLinkRow> {
  const { data, error } = await supabase.rpc("set_product_unit_link", {
    _wrapper_id: wrapperId,
    _base_id: baseId,
    _ratio: ratio,
  });
  if (error) throw error;
  return data as any as UnitLinkRow;
}

export async function removeUnitLink(wrapperId: string): Promise<void> {
  const { error } = await supabase.rpc("unset_product_unit_link", { _wrapper_id: wrapperId });
  if (error) throw error;
}

export function translateLinkRpcError(msg: string | null | undefined): string {
  const s = String(msg ?? "");
  for (const k of Object.keys(LINK_ERROR_MESSAGES_TH) as LinkValidationError[]) {
    if (s.includes(k)) return LINK_ERROR_MESSAGES_TH[k];
  }
  if (s.includes("not_authorized")) return "ไม่มีสิทธิ์บันทึกสินค้าสัมพันธ์";
  return s || "บันทึกไม่สำเร็จ";
}