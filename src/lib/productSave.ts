// Unified product write helper — used by every "add/edit product" form so
// they hit the same tables + RPCs regardless of where the user opens the
// form from (admin, POS quick-add, POS stock sheet, staff intake).
//
// Steps:
//   1) validate + duplicate barcode/code guard
//   2) insert or update `products` (stock is NEVER written directly on update —
//      it goes through the central `pos_adjust_stock` RPC so every change is
//      recorded in `stock_movements`, the single source of truth)
//   3) upsert `product_costs.cost_price` when caller supplies it
//   4) call RPC `admin_set_product_shops` when caller supplies shop ids
//
// Returns the freshly-fetched product row so the caller can drop it into a
// cart / list / navigation target without doing a second round-trip.

import { supabase } from "@/integrations/supabase/client";

export type ProductLine = "colorlab" | "print" | "other";

export type ProductFormValues = {
  code?: string | null;
  barcode?: string | null;
  name: string;
  category_id?: string | null;
  product_line?: ProductLine;
  unit?: string | null;
  description?: string | null;
  stock?: number;
  low_stock_threshold?: number;
  cost_price?: number | null;
  standard_price?: number;
  active?: boolean;
  image_url?: string | null;
  status?: "active" | "draft" | "pending_review";
};

export type SaveProductInput = {
  mode: "create" | "update";
  productId?: string;
  values: ProductFormValues;
  shopIds?: string[] | null; // null = don't touch shops
  nextAutoCode?: string; // when code equals this it's kept blank so DB fills it
};

export type SavedProduct = {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  category_id: string | null;
  standard_price: number;
  stock: number;
  unit: string | null;
  image_url: string | null;
  active: boolean;
  deleted_at: string | null;
  has_variants: boolean;
};

const SELECT_COLS =
  "id,name,code,barcode,category_id,standard_price,stock,unit,image_url,active,deleted_at,has_variants";

export class ProductSaveError extends Error {
  constructor(msg: string, public field?: string) {
    super(msg);
    this.name = "ProductSaveError";
  }
}

async function assertBarcodeUnique(barcode: string, ignoreId?: string) {
  const { data } = await supabase
    .from("products")
    .select("id,name")
    .eq("barcode", barcode)
    .maybeSingle();
  if (data && data.id !== ignoreId)
    throw new ProductSaveError(`บาร์โค้ดนี้ถูกใช้แล้ว: ${data.name}`, "barcode");
}

async function assertCodeUnique(code: string, ignoreId?: string) {
  const { data } = await supabase
    .from("products")
    .select("id,name")
    .eq("code", code)
    .maybeSingle();
  if (data && data.id !== ignoreId)
    throw new ProductSaveError(`รหัส "${code}" ซ้ำกับ "${data.name}"`, "code");
}

export async function saveProduct(input: SaveProductInput): Promise<SavedProduct> {
  const v = input.values;
  const name = (v.name || "").trim();
  if (!name) throw new ProductSaveError("กรุณากรอกชื่อสินค้า", "name");

  const numChecks: [string, unknown][] = [
    ["ราคามาตรฐาน", v.standard_price],
    ["สต๊อกคงเหลือ", v.stock],
    ["จุดเตือนสต๊อกต่ำ", v.low_stock_threshold],
  ];
  if (v.cost_price != null) numChecks.push(["ราคาทุน", v.cost_price]);
  for (const [label, x] of numChecks) {
    if (x == null || x === "") continue;
    const n = Number(x);
    if (!Number.isFinite(n)) throw new ProductSaveError(`${label} ต้องเป็นตัวเลข`);
    if (n < 0) throw new ProductSaveError(`${label} ต้องไม่ติดลบ`);
  }

  const barcode = (v.barcode || "").trim() || null;
  if (barcode) await assertBarcodeUnique(barcode, input.productId);

  const typedCode = (v.code || "").trim();
  const codeToSave =
    !typedCode || (input.nextAutoCode && typedCode === input.nextAutoCode)
      ? null
      : typedCode;
  if (codeToSave) await assertCodeUnique(codeToSave, input.productId);

  const payload: Record<string, unknown> = {
    name,
    code: codeToSave,
    barcode,
    category_id: v.category_id ?? null,
    product_line: v.product_line ?? "other",
    unit: v.unit || "ชิ้น",
    description: v.description || null,
    low_stock_threshold: Number(v.low_stock_threshold ?? 5),
    standard_price: Number(v.standard_price ?? 0),
    active: v.active ?? true,
  };
  if (v.image_url !== undefined) payload.image_url = v.image_url;
  if (v.status) payload.status = v.status;

  let saved: SavedProduct | null = null;
  if (input.mode === "create") {
    // Opening balance on create is fine: there is no prior movement history.
    payload.stock = Number(v.stock ?? 0);
    const { data, error } = await supabase
      .from("products")
      .insert(payload as never)
      .select(SELECT_COLS)
      .single();
    if (error || !data) throw new ProductSaveError(error?.message || "บันทึกไม่สำเร็จ");
    saved = data as SavedProduct;
  } else {
    if (!input.productId) throw new ProductSaveError("ไม่พบรหัสสินค้าเพื่อแก้ไข");
    const { data, error } = await supabase
      .from("products")
      .update(payload as never)
      .eq("id", input.productId)
      .select(SELECT_COLS)
      .single();
    if (error || !data) throw new ProductSaveError(error?.message || "บันทึกไม่สำเร็จ");
    saved = data as SavedProduct;

    // Stock edits from the product form become a real audited movement.
    if (v.stock != null && !saved.has_variants) {
      const target = Number(v.stock);
      if (Number.isFinite(target) && target !== Number(saved.stock ?? 0)) {
        // Wrapper (pack) products derive their stock from the base product and
        // must never be adjusted directly.
        const { data: wrap } = await supabase
          .from("product_unit_links")
          .select("id")
          .eq("wrapper_id", saved.id)
          .eq("enabled", true)
          .limit(1);
        const isWrapper = !!(wrap && wrap.length);
        // Skip ONLY the stock adjustment for wrappers — cost and shop
        // assignments below must still be saved.
        if (!isWrapper) {
          const { error: ae } = await supabase.rpc("pos_adjust_stock" as never, {
            p_product_id: saved.id,
            p_variant_id: null,
            p_mode: "set",
            p_qty: target,
            p_reason: "recount",
            p_note: "แก้ไขจากฟอร์มสินค้า",
          } as never);
          if (ae) throw new ProductSaveError(ae.message || "ปรับสต๊อกไม่สำเร็จ", "stock");
          saved = { ...saved, stock: target };
        }
      }
    }
  }

  if (v.cost_price != null) {
    await supabase.from("product_costs").upsert({
      product_id: saved.id,
      cost_price: Number(v.cost_price) || 0,
      updated_at: new Date().toISOString(),
    } as never);
  }

  if (Array.isArray(input.shopIds)) {
    const { error: se } = await supabase.rpc("admin_set_product_shops" as never, {
      p_product_id: saved.id,
      p_store_ids: input.shopIds,
    } as never);
    if (se) {
      // Non-fatal — surface to caller as a warning path.
      console.warn("admin_set_product_shops failed", se);
    }
  }

  return saved;
}