import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, LogIn, AlertTriangle, CheckCircle2 } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  owner: "Super Admin (เจ้าของ)",
  admin: "Admin",
  stock_staff: "พนักงานสต็อก",
  photo_staff: "พนักงานถ่ายรูป",
};

export default function AcceptAdminInvite() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [state, setState] = useState<"loading" | "ready" | "invalid" | "expired" | "used" | "accepted">("loading");
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("admin-invite-accept", { body: { token, mode: "preview" } });
      if (error || (data as any)?.error) {
        const msg = String(error?.message || (data as any)?.error || "");
        if (msg.includes("expired")) setState("expired");
        else if (msg.includes("accepted") || msg.includes("revoked")) setState("used");
        else setState("invalid");
        return;
      }
      setInfo((data as any).invitation); setState("ready");
    })();
  }, [token]);

  async function accept() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-invite-accept", { body: { token, mode: "accept" } });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "ยืนยันไม่สำเร็จ");
      return;
    }
    toast.success("ได้รับสิทธิ์แล้ว");
    setState("accepted");
    const role = String((data as any)?.role || info?.role || "");
    const dest = role === "owner" || role === "admin" ? "/admin" : "/pos";
    setTimeout(() => nav(dest), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md p-6 rounded-2xl space-y-4">
        {state === "loading" && <p className="text-center text-sm text-muted-foreground">กำลังตรวจสอบคำเชิญ...</p>}

        {state === "invalid" && (
          <div className="text-center space-y-2">
            <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="text-lg font-semibold">ลิงก์ไม่ถูกต้อง</h1>
            <p className="text-sm text-muted-foreground">คำเชิญนี้ไม่พบในระบบ</p>
          </div>
        )}
        {state === "expired" && (
          <div className="text-center space-y-2">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
            <h1 className="text-lg font-semibold">คำเชิญหมดอายุ</h1>
            <p className="text-sm text-muted-foreground">โปรดขอลิงก์เชิญใหม่จากผู้ดูแล</p>
          </div>
        )}
        {state === "used" && (
          <div className="text-center space-y-2">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
            <h1 className="text-lg font-semibold">คำเชิญถูกใช้แล้ว</h1>
          </div>
        )}
        {state === "accepted" && (
          <div className="text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <h1 className="text-lg font-semibold">ยืนยันสำเร็จ</h1>
            <p className="text-sm text-muted-foreground">กำลังพาเข้าสู่หลังบ้าน...</p>
          </div>
        )}

        {state === "ready" && (
          <>
            <div className="text-center space-y-1">
              <ShieldCheck className="w-10 h-10 mx-auto text-primary" />
              <h1 className="text-lg font-semibold">คำเชิญเป็นผู้ดูแลระบบ</h1>
              <p className="text-sm text-muted-foreground">
                คุณได้รับเชิญให้เป็น <b>{ROLE_LABEL[info?.role] || info?.role}</b>
              </p>
            </div>
            {info?.message && (
              <div className="bg-muted/50 rounded-xl p-3 text-sm whitespace-pre-wrap">{info.message}</div>
            )}
            {info?.perms && info.role !== "owner" && info.role !== "admin" && (
              <div className="border rounded-xl p-3 text-sm space-y-1">
                <div className="text-xs font-medium text-muted-foreground">สิทธิ์ที่จะได้รับ</div>
                <p>
                  {[info.perms.pos && "POS", info.perms.stock && "สต๊อก", info.perms.po && "ใบสั่งซื้อ (PO)", info.perms.history && "ประวัติ/รายงาน"]
                    .filter(Boolean)
                    .join(" · ") || "ยังไม่กำหนด — เจ้าของจะเปิดสิทธิ์ให้ภายหลัง"}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              หมดอายุ {new Date(info?.expires_at).toLocaleString("th-TH")}
            </p>
            {authLoading ? (
              <p className="text-center text-sm text-muted-foreground">กำลังตรวจสอบสถานะเข้าสู่ระบบ...</p>
            ) : !user ? (
              <div className="space-y-2">
                <p className="text-sm text-center">กรุณาเข้าสู่ระบบก่อนยืนยัน</p>
                <Button className="w-full rounded-xl" asChild>
                  <Link to={`/login?next=${encodeURIComponent(`/accept-admin?token=${token}`)}`}>
                    <LogIn className="w-4 h-4 mr-1" /> เข้าสู่ระบบ
                  </Link>
                </Button>
              </div>
            ) : (
              <Button className="w-full rounded-xl" onClick={accept} disabled={busy}>
                {busy ? "กำลังยืนยัน..." : "ยืนยันรับสิทธิ์"}
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}