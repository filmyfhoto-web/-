import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, LogIn, CheckCircle2 } from "lucide-react";

export default function JoinStore() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { store_id: string; role: string }>(null);

  async function submit() {
    const c = code.replace(/\D+/g, "").slice(0, 6);
    if (c.length !== 6) { toast.error("กรุณากรอกรหัส 6 หลัก"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("redeem_store_invite_code" as any, { _code: c });
    setBusy(false);
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("code_not_found_or_expired")) toast.error("รหัสไม่ถูกต้อง หรือหมดอายุ");
      else if (msg.includes("invalid_code_format")) toast.error("รูปแบบรหัสไม่ถูกต้อง");
      else if (msg.includes("not_authenticated")) toast.error("กรุณาเข้าสู่ระบบก่อน");
      else toast.error(msg || "แลกรหัสไม่สำเร็จ");
      return;
    }
    const row = Array.isArray(data) ? data[0] : (data as any);
    setDone(row);
    toast.success("เข้าร่วมเป็นแอดมินสำเร็จ");
    setTimeout(() => nav("/receipts"), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md p-6 rounded-2xl space-y-4">
        <div className="text-center space-y-1">
          <KeyRound className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-lg font-semibold">เข้าร่วมร้านด้วยรหัส 6 หลัก</h1>
          <p className="text-sm text-muted-foreground">ใส่รหัสที่ได้จากเจ้าของร้านเพื่อรับสิทธิ์แอดมินของร้านนั้น</p>
        </div>

        {done ? (
          <div className="text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <p className="text-sm">เข้าร่วมสำเร็จ กำลังพาไปยังหน้าร้าน…</p>
          </div>
        ) : loading ? (
          <p className="text-center text-sm text-muted-foreground">กำลังตรวจสอบสถานะเข้าสู่ระบบ…</p>
        ) : !user ? (
          <div className="space-y-2">
            <p className="text-sm text-center">กรุณาเข้าสู่ระบบก่อน</p>
            <Button className="w-full rounded-xl" asChild>
              <Link to={`/login?next=${encodeURIComponent("/join-store")}`}>
                <LogIn className="w-4 h-4 mr-1" /> เข้าสู่ระบบ
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>รหัส 6 หลัก</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
            <Button className="w-full rounded-xl" onClick={submit} disabled={busy || code.length !== 6}>
              {busy ? "กำลังยืนยัน…" : "ยืนยันรหัส"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}