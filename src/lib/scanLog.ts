import { supabase } from "@/integrations/supabase/client";

export type ScanAction =
  | "scan_session_start"
  | "scan_session_finish"
  | "scan_ocr_success"
  | "scan_ocr_error"
  | "scan_barcode_duplicate"
  | "scan_barcode_skipped"
  | "scan_image_cropped"
  | "scan_bulk_save"
  | "scan_product_saved";

let _sessionId: string | null = null;
export function startScanSession(): string {
  _sessionId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  return _sessionId;
}
export function currentScanSession(): string | null { return _sessionId; }
export function endScanSession() { _sessionId = null; }

/**
 * Best-effort activity log for scanning workflow.
 * Silently swallows errors so logging never blocks UX.
 */
export async function logScan(action: ScanAction, detail: Record<string, unknown> = {}) {
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return;
    const session_id = _sessionId;
    await supabase.from("activity_logs").insert({
      user_id: uid,
      action,
      target_type: "product_scan",
      detail: { ...detail, session_id } as any,
    });
  } catch {
    // ignore
  }
}

const PREF_KEY = "scan_prefs_v1";
export type ScanPrefs = {
  removeBg: boolean;
  autoOcr: boolean;
  continuous: boolean;
  /** 'confirm' = ถามทุกครั้งก่อนบันทึก, 'skip' = ข้ามอัตโนมัติเมื่อบันทึกหลายรายการ */
  dupHandling: "confirm" | "skip";
  /** เปิด/ปิด ออโต้โฟกัสกล้อง (continuous AF) */
  autoFocus: boolean;
  /** ระยะโฟกัสด้วยตนเอง 0-1 (ใช้เมื่อ autoFocus=false และอุปกรณ์รองรับ) */
  focusDistance: number;
  /** แสดงกรอบนำสายตาในมุมมองกล้อง */
  showGuide: boolean;
  /** โหมดล่าสุดที่ผู้ใช้เลือก (barcode/name/full) จะถูกเปิดอัตโนมัติเมื่อกลับมาที่หน้ากล้อง */
  lastFocus: "barcode" | "name" | "full";
  /** จำนวนสูงสุดต่อรอบในโหมดสแกนต่อเนื่อง (0 = ไม่จำกัด) */
  queueLimit: number;
  /** เปิด/ปิดไฟฉาย (torch) ค่าเริ่มต้นเมื่อเริ่มเซสชัน */
  torch: boolean;
};
const DEFAULTS: ScanPrefs = {
  removeBg: true, autoOcr: true, continuous: false, dupHandling: "confirm",
  autoFocus: true, focusDistance: 0.5, showGuide: true,
  lastFocus: "full", queueLimit: 0, torch: false,
};

export function loadScanPrefs(): ScanPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveScanPrefs(p: Partial<ScanPrefs>) {
  try {
    const cur = loadScanPrefs();
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...cur, ...p }));
  } catch {
    // ignore
  }
}

// ───────── ค่าเริ่มต้นของสินค้าตอนบันทึกจากคิวสแกน ─────────
const DEF_KEY = "scan_product_defaults_v1";
export type ScanProductDefaults = {
  unit: string;
  stock: number;
  low_stock_threshold: number;
  standard_price: number | null;
  group_price_id: string | null;
  group_price: number | null;
  category_id: string | null;
};
const DEF_DEFAULTS: ScanProductDefaults = {
  unit: "ชิ้น",
  stock: 0,
  low_stock_threshold: 0,
  standard_price: null,
  group_price_id: null,
  group_price: null,
  category_id: null,
};
export function loadProductDefaults(): ScanProductDefaults {
  try {
    const raw = localStorage.getItem(DEF_KEY);
    if (!raw) return DEF_DEFAULTS;
    return { ...DEF_DEFAULTS, ...JSON.parse(raw) };
  } catch { return DEF_DEFAULTS; }
}
export function saveProductDefaults(p: Partial<ScanProductDefaults>) {
  try {
    const cur = loadProductDefaults();
    localStorage.setItem(DEF_KEY, JSON.stringify({ ...cur, ...p }));
  } catch { /* ignore */ }
}