import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2Off, ShieldCheck, ArrowLeft, Loader2, LogOut } from "lucide-react";
import { clearLineSession } from "@/lib/lineSession";

type Binding = {
  phone?: string;
  customer_id?: string;
  customer_source?: string;
  customer_name?: string | null;
  display_name?: string;
};

export default function ShopAccountLink() {
  const navigate = useNavigate();
  const [binding, setBinding] = useState<Binding | null>(null);
  const [loading, setLoading] = useState(true);
  const [unbinding, setUnbinding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = sessionStorage.getItem("liff_profile");
        const profile = raw ? JSON.parse(raw) : null;
        if (!profile?.userId || profile.userId === "guest") {
          navigate("/", { replace: true });

          return;
        }
        const { data } = await supabase.functions.invoke("line-link-lookup", {
          body: { line_user_id: profile.userId },
        });
        setBinding(data?.bound ? { ...data, display_name: profile.displayName } : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  async function unbind() {
    const raw = sessionStorage.getItem("liff_profile");
    const profile = raw ? JSON.parse(raw) : null;
    if (!profile?.userId) return;
    if (!confirm("ยกเลิกการเชื่อมบัญชี LINE นี้?")) return;
    setUnbinding(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-link-unbind", {
        body: { line_user_id: profile.userId },
      });
      if (error || !data?.ok) throw new Error(data?.error || "ยกเลิกไม่สำเร็จ");
      sessionStorage.removeItem("line_binding");
      toast.success("ยกเลิกการเชื่อมบัญชีแล้ว");
      navigate("/l/link", { replace: true });
    } catch (e: any) {
      toast.error(e?.message);
    } finally {
      setUnbinding(false);
    }
  }

  function logout() {
    if (!confirm("ออกจากระบบ LINE?")) return;
    clearLineSession();
    toast.success("ออกจากระบบแล้ว");
    navigate("/", { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/shop")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
        </Button>
        <Card className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-7 w-7 text-primary shrink-0" />
            <div>
              <h1 className="text-lg font-semibold">การเชื่อมบัญชี LINE</h1>
              <p className="text-sm text-muted-foreground">
                ระบบใช้เบอร์นี้แสดงข้อมูลของคุณอย่างถูกต้อง
              </p>
            </div>
          </div>

          {binding ? (
            <>
              <div className="rounded-lg border p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LINE</span>
                  <span className="font-medium">{binding.display_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">เบอร์</span>
                  <span className="font-medium">
                    {binding.phone
                      ? `${binding.phone.slice(0, 3)}****${binding.phone.slice(-2)}`
                      : "—"}
                  </span>
                </div>
                {binding.customer_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ลูกค้า</span>
                    <span className="font-medium">{binding.customer_name}</span>
                  </div>
                )}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={unbind}
                disabled={unbinding}
              >
                {unbinding ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2Off className="h-4 w-4 mr-2" />
                )}
                ยกเลิกการเชื่อมบัญชี
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/l/link")}
              >
                เปลี่ยนเบอร์ที่ผูก
              </Button>
              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={logout}
              >
                <LogOut className="h-4 w-4 mr-2" /> ออกจากระบบ LINE
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm">ยังไม่ได้เชื่อมบัญชี</p>
              <Button className="w-full" onClick={() => navigate("/l/link")}>
                เชื่อมบัญชี LINE
              </Button>
              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={logout}
              >
                <LogOut className="h-4 w-4 mr-2" /> ออกจากระบบ LINE
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}