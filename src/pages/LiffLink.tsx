import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Phone } from "lucide-react";
import { writeBinding, writeLinkError, clearLinkError, sanitizeNext, logLineIssue } from "@/lib/lineSession";

function readLiffProfile() {
  try {
    const raw = sessionStorage.getItem("liff_profile");
    if (!raw) return null;
    return JSON.parse(raw) as { userId: string; displayName?: string; pictureUrl?: string };
  } catch {
    return null;
  }
}

export default function LiffLink() {
  const navigate = useNavigate();
  const profile = readLiffProfile();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!profile?.userId || profile.userId === "guest") {
      toast.error("กรุณาเปิดผ่าน LINE เพื่อเชื่อมบัญชี");
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);


  async function bindNow() {
    if (!profile?.userId) return;
    const clean = phone.replace(/\D+/g, "");
    if (!/^0\d{8,9}$/.test(clean)) {
      toast.error("กรุณากรอกเบอร์โทรให้ถูกต้อง (เช่น 0812345678)");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-link-bind", {
        body: {
          line_user_id: profile.userId,
          phone: clean,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || "เชื่อมบัญชีไม่สำเร็จ");
        writeLinkError({ message: data?.error || "เชื่อมบัญชีไม่สำเร็จ", code: data?.error });
      logLineIssue("link_verify_fail", { reason: data?.error || "unknown", line_user_id: profile.userId, mode: "bind" });
        return;
      }
      writeBinding({
        phone: data.phone,
        customer_id: data.customer_id,
        customer_source: data.customer_source,
        customer_name: data.customer_name,
        linked_at: new Date().toISOString(),
        status: "linked",
      });
      clearLinkError();
      setDone(true);
      toast.success("เชื่อมบัญชีสำเร็จ");
      const next = sanitizeNext(sessionStorage.getItem("line_link_next")) || "/shop";
      sessionStorage.removeItem("line_link_next");
      setTimeout(() => navigate(next, { replace: true }), 900);
    } catch (e: any) {
      toast.error(e?.message || "เกิดข้อผิดพลาด");
      writeLinkError({ message: e?.message || "เกิดข้อผิดพลาด" });
      logLineIssue("link_verify_fail", { reason: "exception", message: e?.message ?? null, line_user_id: profile.userId, mode: "bind" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">เชื่อมบัญชี LINE</h1>
            <p className="text-sm text-muted-foreground">
              กรอกเบอร์โทรเพื่อจับคู่กับประวัติคำสั่งซื้อของคุณ
            </p>
          </div>
        </div>

        {profile?.displayName && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            LINE: <span className="font-medium">{profile.displayName}</span>
          </div>
        )}

        {!done ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> เบอร์โทรศัพท์
              </Label>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="0812345678"
                value={phone}
                maxLength={15}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button className="w-full" onClick={bindNow} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              เชื่อมบัญชี LINE
            </Button>
            <p className="text-xs text-muted-foreground">
              เบอร์นี้จะถูกใช้จับคู่กับประวัติคำสั่งซื้อเดิม และรับการแจ้งเตือนจากร้านผ่าน LINE
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-4 text-primary">
            <ShieldCheck className="h-6 w-6" />
            <div className="text-sm">เชื่อมบัญชีสำเร็จ — กำลังเข้าสู่ร้านค้า...</div>
          </div>
        )}
      </Card>
    </div>
  );
}