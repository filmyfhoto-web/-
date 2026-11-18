import { supabase } from "@/integrations/supabase/client";

export interface PriceResolution {
  productId: string;
  price: number | null; // null => awaiting quote
  source: "customer" | "group" | "standard" | "pending";
}

function readSessionToken(): string | null {
  try {
    const raw = localStorage.getItem("guest_session_v1");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const t = obj?.school_token;
    return typeof t === "string" && t.length >= 8 ? t : null;
  } catch { return null; }
}

export async function resolvePrices(
  productIds: string[],
  organizationId: string | null,
  opts?: { schoolToken?: string | null },
): Promise<Record<string, PriceResolution>> {
  if (!productIds.length) return {};
  const out: Record<string, PriceResolution> = {};
  // ลำดับการเลือก RPC:
  //   1) มี school-token (จากลิงก์ /school/[token]) → get_prices_by_token (บังคับ verify token ก่อนเสมอ)
  //   2) มี organizationId (auth flow ภายใน) → get_prices_by_org
  //   3) อื่น ๆ → get_my_prices (auth.uid())
  const token = opts?.schoolToken ?? readSessionToken();
  let data: any = null;
  if (token) {
    const r = await supabase.rpc("get_prices_by_token" as any, { p_token: token, p_product_ids: productIds } as any);
    data = r.data;
  } else if (organizationId !== null) {
    const r = await supabase.rpc("get_prices_by_org", { p_org_id: organizationId, p_product_ids: productIds } as any);
    data = r.data;
  } else {
    const r = await supabase.rpc("get_my_prices", { p_product_ids: productIds } as any);
    data = r.data;
  }
  for (const row of ((data as any[]) ?? [])) {
    out[row.product_id] = {
      productId: row.product_id,
      price: row.price != null ? Number(row.price) : null,
      source: (row.source as PriceResolution["source"]) ?? "pending",
    };
  }
  for (const id of productIds) {
    if (!out[id]) out[id] = { productId: id, price: null, source: "pending" };
  }
  return out;
}