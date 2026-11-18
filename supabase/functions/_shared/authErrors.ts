/** Maps GoTrue errors to actionable Thai messages (never mislabel a password problem as an email problem). */
export function friendlyAuthError(raw: string): string {
  const msg = String(raw || "");
  if (/weak|pwned|known to be weak|easy to guess/i.test(msg)) {
    return "รหัสผ่านนี้ถูกจัดว่าคาดเดาง่าย — ใช้รหัสที่ยาวขึ้นและผสมตัวอักษร/ตัวเลข (เช่น กดปุ่มสุ่มรหัส)";
  }
  if (/password/i.test(msg) && /short|length|at least/i.test(msg)) return "รหัสผ่านสั้นเกินไป — ต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (/password/i.test(msg)) return `รหัสผ่านใช้ไม่ได้: ${msg}`;
  if (/email/i.test(msg) && /invalid|not valid/i.test(msg)) {
    return "ระบบอีเมลปฏิเสธอีเมลนี้ — กรุณาใช้อีเมลจริงที่ใช้งานได้ (เช่น @gmail.com)";
  }
  return msg;
}
