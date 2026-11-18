// Pure helpers for internal (staff-only) alert classification. No imports so
// they stay testable outside the Deno runtime.

export type StaffAlertType = "line_login_failure" | "line_link_failure" | "webhook_failure";

/** Map the failing edge function to one of the rate-limited alert types. */
export function alertTypeFor(source: string): StaffAlertType {
  const s = (source || "").toLowerCase();
  if (s.includes("webhook")) return "webhook_failure";
  if (s.includes("login") || s.includes("oauth")) return "line_login_failure";
  return "line_link_failure";
}

export function alertTitle(type: string): string {
  if (type === "webhook_failure") return "LINE webhook ทำงานผิดพลาด";
  if (type === "line_login_failure") return "ลูกค้าเข้าสู่ระบบด้วย LINE ไม่สำเร็จ";
  return "การผูกบัญชี LINE ไม่สำเร็จ";
}