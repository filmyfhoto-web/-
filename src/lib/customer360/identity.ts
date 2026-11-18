/**
 * Customer identity — ตัวตนลูกค้าแบบ canonical โดยใช้ profiles / organizations /
 * line_account_links ที่มีอยู่เดิม (reuse-first) ไม่สร้างฐานลูกค้าชุดใหม่
 */

export type LineLinkState = "linked" | "unmatched" | "none";

export const LINE_LINK_LABEL: Record<LineLinkState, string> = {
  linked: "เชื่อมแล้ว",
  unmatched: "พบ LINE แต่ยังไม่จับคู่",
  none: "ยังไม่เชื่อม",
};

export const LINE_LINK_BADGE: Record<LineLinkState, string> = {
  linked: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unmatched: "bg-amber-50 text-amber-700 border-amber-200",
  none: "bg-muted text-muted-foreground border-border",
};

/**
 * สถานะการเชื่อม LINE — ต้องมาจากข้อมูลฝั่งเซิร์ฟเวอร์เท่านั้น
 * `verified` = ผ่าน flow ผูกบัญชีที่ตรวจสอบแล้ว
 */
export function lineLinkState(input: {
  lineUserId?: string | null;
  verifiedAt?: string | null;
  boundCustomerId?: string | null;
}): LineLinkState {
  if (!input.lineUserId) return "none";
  if (input.boundCustomerId && input.verifiedAt) return "linked";
  if (input.boundCustomerId) return "linked";
  return "unmatched";
}

/** รหัสลูกค้าที่เสถียร — ใช้ค่าจากฐานข้อมูลก่อน ถ้ายังไม่มีค่อยคำนวณจาก id */
export function customerCode(row: { customer_code?: string | null; id?: string | null }, prefix = "CUS"): string {
  if (row?.customer_code) return row.customer_code;
  const id = String(row?.id ?? "");
  if (!id) return "—";
  const compact = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${prefix}-${compact}`;
}

/** ไม่เปิดเผย line_user_id เต็มใน UI */
export function maskLineUserId(id?: string | null): string {
  const s = String(id ?? "");
  if (!s) return "—";
  if (s.length <= 8) return `${s.slice(0, 2)}••••`;
  return `${s.slice(0, 5)}••••••${s.slice(-4)}`;
}

/** ห้าม merge อัตโนมัติจากชื่ออย่างเดียว — ถ้าคลุมเครือให้เป็น "รอจับคู่" */
export function canAutoMatch(candidate: {
  phoneMatches?: boolean;
  nameMatches?: boolean;
  candidateCount?: number;
}): boolean {
  if (!candidate.phoneMatches) return false;
  return (candidate.candidateCount ?? 1) === 1;
}
