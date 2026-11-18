import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ShieldAlert, Eraser } from "lucide-react";

/**
 * Client-side ONLY shape validator for LINE Messaging API secrets. The pasted
 * values never leave the browser (no network, no logging). Auto-clears after
 * 30s to avoid leaving credentials on-screen. Guides the admin toward the
 * correct value BEFORE they open the Lovable secret form.
 */

type Field = {
  key: string;
  label: string;
  hint: string;
  validate: (v: string) => { ok: boolean; reason: string };
};

const FIELDS: Field[] = [
  {
    key: "LINE_CHANNEL_SECRET",
    label: "LINE_CHANNEL_SECRET (Messaging API → Basic settings → Channel secret)",
    hint: "ต้องเป็น hex 32 ตัว (a-f, 0-9) เช่น a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 — ถ้าเป็นตัวเลขล้วน เช่น 2010450986 แสดงว่าคัดลอกผิดช่อง (Channel ID)",
    validate: (v) => {
      const t = v.trim();
      if (!t) return { ok: false, reason: "ยังว่าง — วางค่าที่คัดลอกมา" };
      if (/^\d{8,}$/.test(t)) return { ok: false, reason: "❌ ค่านี้ดูเหมือน Channel ID (ตัวเลขล้วน) เช่น 2010450986 — กลับไปคัดลอกช่อง Channel secret ด้านล่าง" };
      if (t.length > 100) return { ok: false, reason: "❌ ค่านี้ยาวเกิน 100 ตัว — น่าจะเป็น Channel access token, ไม่ใช่ secret" };
      if (/^@/.test(t)) return { ok: false, reason: "❌ ค่านี้เป็น Basic ID (@xxxx) ไม่ใช่ secret" };
      if (!/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: `❌ ยาว ${t.length} ตัว — ต้องเป็น hex 32 ตัว (มีแต่ a-f และ 0-9)` };
      return { ok: true, reason: "✅ รูปแบบถูก (hex 32) — พร้อมวางใน Lovable secret form" };
    },
  },
  {
    key: "LINE_CHANNEL_ACCESS_TOKEN",
    label: "LINE_CHANNEL_ACCESS_TOKEN (Messaging API → Channel access token long-lived)",
    hint: "ขึ้นต้นด้วย Bearer หรือ token ยาว ~172 ตัว ไม่ใช่ secret 32 ตัว",
    validate: (v) => {
      const t = v.trim();
      if (!t) return { ok: false, reason: "ยังว่าง — วาง token ที่คัดลอกมา" };
      if (/^Bearer\s/i.test(t)) return { ok: false, reason: "❌ อย่าเอาคำว่า 'Bearer' มาด้วย — วางเฉพาะ token" };
      if (/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: "❌ ค่านี้เป็น hex 32 ตัว — น่าจะเป็น Channel secret ไม่ใช่ access token" };
      if (t.length < 80) return { ok: false, reason: `❌ ยาว ${t.length} ตัว — access token มักยาว ~172 ตัว` };
      return { ok: true, reason: "✅ รูปแบบถูก (token ยาว) — พร้อมวางใน Lovable secret form" };
    },
  },
  {
    key: "LINE_ADMIN_USER_ID",
    label: "LINE_ADMIN_USER_ID (userId ของแอดมิน — คัดลอกจาก webhook events)",
    hint: "ขึ้นต้น 'U' ตามด้วย hex 32 ตัว (รวม 33 ตัวอักษร)",
    validate: (v) => {
      const t = v.trim();
      if (!t) return { ok: false, reason: "ยังว่าง — วางค่าที่คัดลอกมา" };
      if (/^@/.test(t)) return { ok: false, reason: "❌ ค่านี้เป็น Basic ID (@xxxx) ไม่ใช่ userId" };
      if (/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: "❌ เป็น hex 32 ตัว (ไม่มี 'U' นำหน้า) — น่าจะเป็น Channel secret" };
      if (!/^U[0-9a-f]{32}$/.test(t)) return { ok: false, reason: "❌ รูปแบบไม่ตรง — ต้องขึ้นต้น 'U' ตามด้วย hex 32 ตัว" };
      return { ok: true, reason: "✅ รูปแบบถูก (U + hex 32) — พร้อมวางใน Lovable secret form" };
    },
  },
];

export default function LineSecretPreflight() {
  const [values, setValues] = useState<Record<string, string>>({});
  const timerRef = useRef<Record<string, number>>({});

  // Auto-clear each field 30s after last edit.
  function setValue(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
    if (timerRef.current[key]) window.clearTimeout(timerRef.current[key]);
    if (v) {
      timerRef.current[key] = window.setTimeout(() => {
        setValues((s) => ({ ...s, [key]: "" }));
      }, 30_000);
    }
  }

  useEffect(() => () => {
    Object.values(timerRef.current).forEach((t) => window.clearTimeout(t));
  }, []);

  const results = useMemo(
    () => FIELDS.map((f) => ({ f, v: values[f.key] || "", r: f.validate(values[f.key] || "") })),
    [values],
  );

  const anyValue = results.some((x) => x.v.length > 0);

  function clearAll() {
    Object.values(timerRef.current).forEach((t) => window.clearTimeout(t));
    setValues({});
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-5 shadow-card mb-4">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-5 h-5 text-primary" />
        <h2 className="font-bold">ตรวจรูปแบบก่อนบันทึก (Pre-save Validator)</h2>
        <Badge variant="outline" className="text-[10px]">Client-side เท่านั้น · ไม่ส่งค่าไปที่ไหน</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        วางค่าที่จะบันทึกที่นี่ก่อน เพื่อตรวจว่าคัดลอก <b>ช่องที่ถูกต้อง</b> หรือไม่ — ค่าจะไม่ถูกส่งไปเซิร์ฟเวอร์ และช่องจะ <b>ล้างอัตโนมัติใน 30 วินาที</b>
      </p>

      <div className="space-y-3">
        {results.map(({ f, v, r }) => (
          <div key={f.key} className="rounded-xl border p-3 space-y-1.5">
            <Label className="text-xs">{f.label}</Label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={v}
              onChange={(e) => setValue(f.key, e.target.value)}
              placeholder={f.hint}
              className="rounded-lg font-mono text-xs"
            />
            {v ? (
              <div className={`inline-flex items-center gap-1 text-[11px] ${r.ok ? "text-success" : "text-destructive"}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {r.reason}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{f.hint}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-3">
        <Button variant="outline" size="sm" onClick={clearAll} disabled={!anyValue} className="rounded-lg">
          <Eraser className="w-3.5 h-3.5 mr-1" /> ล้างทุกช่อง
        </Button>
        <p className="text-[11px] text-muted-foreground self-center">
          เมื่อทุกช่องขึ้น <span className="text-success">✅</span> แล้ว ให้บอกทีมงาน Lovable ว่า "อัปเดต secret ตัวไหน" — จะเปิดฟอร์มปลอดภัยให้วางค่าจริง (ค่าที่พิมพ์ในการ์ดนี้จะไม่ถูกใช้บันทึกโดยอัตโนมัติ)
        </p>
      </div>
    </section>
  );
}
