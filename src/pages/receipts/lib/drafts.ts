import { supabase } from "@/integrations/supabase/client";
import { tbl } from "./tbl";

export type DraftKind = "document" | "pos" | "settings" | "import";

/**
 * ผลของการบันทึกร่าง — แยกให้ชัดว่า "เก็บในเครื่องแล้ว" กับ "ซิงก์ขึ้นระบบแล้ว"
 * ไม่ใช่เรื่องเดียวกัน เพื่อไม่ให้ UI บอกว่าบันทึกสำเร็จทั้งที่ฐานข้อมูลล้มเงียบ ๆ
 */
export type DraftSaveResult = {
  /** เก็บลง localStorage สำเร็จ (กันข้อมูลหายเสมอ) */
  local: boolean;
  /** อัปขึ้นฐานข้อมูลสำเร็จ */
  synced: boolean;
  /** เหตุผลเมื่อยังไม่ซิงก์ */
  reason?: "signed_out" | "session_expired" | "error";
};

const lsKey = (storeId: string, kind: DraftKind) => `rds_draft_${kind}_${storeId}`;

/** ข้อความ error ที่บอกว่า session หมดอายุ/ไม่มีสิทธิ์เพราะยังไม่ล็อกอิน */
function isAuthError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? "").toLowerCase();
  const code = String((err as { code?: string } | null)?.code ?? "");
  return (
    code === "PGRST301" ||
    msg.includes("jwt") ||
    msg.includes("expired") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid claim")
  );
}

async function upsertDraft(userId: string, storeId: string, kind: DraftKind, payload: any) {
  return supabase
    .from(tbl("drafts") as any)
    .upsert(
      { user_id: userId, store_id: storeId, kind, payload },
      { onConflict: "user_id,store_id,kind" }
    );
}

/**
 * Save to localStorage (always) + DB (best-effort, พร้อม refresh session หนึ่งครั้ง
 * เมื่อ token หมดอายุ) — คืนสถานะให้หน้าจอรายงานตามจริง
 */
export async function saveDraft(
  storeId: string,
  kind: DraftKind,
  payload: any,
): Promise<DraftSaveResult> {
  let local = false;
  try {
    localStorage.setItem(lsKey(storeId, kind), JSON.stringify({ payload, savedAt: Date.now() }));
    local = true;
  } catch { /* quota */ }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { local, synced: false, reason: "signed_out" };

    const { error } = await upsertDraft(user.id, storeId, kind, payload);
    if (!error) return { local, synced: true };

    if (!isAuthError(error)) return { local, synced: false, reason: "error" };

    // Token หมดอายุระหว่างพิมพ์งาน — ต่ออายุหนึ่งครั้งแล้วลองใหม่ครั้งเดียว
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    const uid = refreshed?.session?.user?.id;
    if (refreshErr || !uid) return { local, synced: false, reason: "session_expired" };

    const retry = await upsertDraft(uid, storeId, kind, payload);
    if (retry.error) {
      return { local, synced: false, reason: isAuthError(retry.error) ? "session_expired" : "error" };
    }
    return { local, synced: true };
  } catch (e) {
    return { local, synced: false, reason: isAuthError(e) ? "session_expired" : "error" };
  }
}

/** Load from DB; fall back to localStorage. Returns null if no draft. */
export async function loadDraft(storeId: string, kind: DraftKind): Promise<any | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from(tbl("drafts") as any)
        .select("payload,updated_at")
        .eq("user_id", user.id)
        .eq("store_id", storeId)
        .eq("kind", kind)
        .maybeSingle();
      if (data && (data as any).payload) return (data as any).payload;
    }
  } catch { /* fall through */ }
  try {
    const raw = localStorage.getItem(lsKey(storeId, kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.payload ?? null;
  } catch { return null; }
}

export async function clearDraft(storeId: string, kind: DraftKind): Promise<void> {
  try { localStorage.removeItem(lsKey(storeId, kind)); } catch { /* noop */ }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from(tbl("drafts") as any)
      .delete()
      .eq("user_id", user.id)
      .eq("store_id", storeId)
      .eq("kind", kind);
  } catch { /* noop */ }
}

/** Heuristic: payload has user-entered content worth restoring. */
export function draftHasContent(kind: DraftKind, payload: any): boolean {
  if (!payload) return false;
  if (kind === "document") {
    const s = payload.state ?? payload;
    return (
      (Array.isArray(s?.items) && s.items.some((it: any) => it?.name || (it?.price && it.price > 0))) ||
      !!s?.customer_name ||
      !!s?.project_name ||
      !!s?.notes
    );
  }
  if (kind === "pos") {
    return Array.isArray(payload?.cart) && payload.cart.length > 0;
  }
  if (kind === "import") {
    return (
      (typeof payload?.text === "string" && payload.text.trim().length > 0) ||
      (Array.isArray(payload?.preview) && payload.preview.length > 0)
    );
  }
  if (kind === "settings") {
    // settings drafts always represent unsaved edits
    return !!payload && typeof payload === "object" && Object.keys(payload).length > 0;
  }
  return false;
}
