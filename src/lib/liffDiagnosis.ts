// Shared helpers to translate LIFF/LINE diagnostic events into
// Thai-language explanations + suggested fixes. Used by:
//  - src/pages/admin/AutoBindHistory.tsx (reason column + CSV export)
//  - src/pages/admin/LineSettings.tsx (health card remediation)
//  - src/components/RequireLineLink.tsx (customer-facing help)

export type DiagnosisReason =
  | "origin_mismatch"
  | "liff_init_fail"
  | "liff_login_loop"
  | "link_verify_fail"
  | "invalid_phone"
  | "binding_failed"
  | "customer_create_failed"
  | "missing_params"
  | "token_missing"
  | "callback_missing"
  | "endpoint_mismatch"
  | "unknown";

export type Diagnosis = {
  code: DiagnosisReason;
  title: string;
  hint: string;
};

export function diagnoseReason(rawReason?: string | null, message?: string | null): Diagnosis {
  const r = String(rawReason || message || "").toLowerCase();

  if (r.includes("origin_mismatch")) {
    return {
      code: "origin_mismatch",
      title: "โดเมนไม่ตรง",
      hint: "ผู้ใช้เปิดจากโดเมนที่ไม่ตรงกับ LIFF Endpoint — เปิดจากโดเมนหลัก หรือเพิ่มโดเมนนั้นเข้า Callback",
    };
  }
  if (r.includes("liff_init") || r.includes("init_fail")) {
    return {
      code: "liff_init_fail",
      title: "LIFF เริ่มต้นไม่สำเร็จ",
      hint: "LIFF SDK init ล้มเหลว — ตรวจ LIFF ID และ scope ใน LINE Console",
    };
  }
  if (r.includes("login_loop") || r.includes("loop")) {
    return {
      code: "liff_login_loop",
      title: "วนกลับหน้าล็อกอิน",
      hint: "หลังผูกแล้วยังเจอหน้ากั้น — ให้ผู้ใช้กดปุ่ม 'ล้างข้อมูลแล้วเริ่มใหม่'",
    };
  }
  if (r.includes("invalid_phone")) {
    return { code: "invalid_phone", title: "เบอร์โทรไม่ถูกต้อง", hint: "เบอร์ต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก" };
  }
  if (r.includes("binding_failed")) {
    return { code: "binding_failed", title: "บันทึกผูกบัญชีไม่สำเร็จ", hint: "insert `line_account_links` ล้มเหลว — ดู detail แล้วแจ้ง dev" };
  }
  if (r.includes("customer_create")) {
    return { code: "customer_create_failed", title: "สร้างลูกค้าไม่สำเร็จ", hint: "insert `guest_customers` ล้มเหลว — ดู detail" };
  }
  if (r.includes("missing_param")) {
    return { code: "missing_params", title: "พารามิเตอร์ไม่ครบ", hint: "ขาด `line_user_id` — ผู้ใช้อาจเปิดนอก LIFF" };
  }
  if (r.includes("token")) {
    return { code: "token_missing", title: "ไม่มี LINE Access Token", hint: "ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` ใน Backend secrets" };
  }
  if (r.includes("callback")) {
    return { code: "callback_missing", title: "Callback URL ไม่ครบ", hint: "เพิ่ม Callback ที่หายไปใน LINE Login channel" };
  }
  if (r.includes("endpoint")) {
    return { code: "endpoint_mismatch", title: "Endpoint ไม่ตรง", hint: "แก้ Endpoint ใน LIFF app ให้ตรงกับค่าที่บันทึกในระบบ" };
  }
  if (r.includes("link_verify")) {
    return { code: "link_verify_fail", title: "ยืนยันการเชื่อมบัญชีไม่ผ่าน", hint: "ดู detail — อาจเป็น network / edge function error" };
  }
  return {
    code: "unknown",
    title: rawReason || message || "ไม่ทราบสาเหตุ",
    hint: "ดู payload เต็มเพื่อวิเคราะห์เพิ่มเติม",
  };
}

/** ป้ายภาษาไทยสั้น ๆ สำหรับตาราง */
export function reasonLabelTh(rawReason?: string | null, message?: string | null): string {
  return diagnoseReason(rawReason, message).title;
}