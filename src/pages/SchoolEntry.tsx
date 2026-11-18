import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useGuest, newGuestId } from "@/contexts/GuestContext";
import SeoHead from "@/components/SeoHead";

export default function SchoolEntry() {
  const { token } = useParams();
  const nav = useNavigate();
  const { session, setSession, resolveToken } = useGuest();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    const t = (token || "").trim();
    if (!t || t.length < 8) { nav("/school/invalid", { replace: true }); return; }
    let cancelled = false;
    (async () => {
      try {
        const info = await resolveToken(t);
        if (cancelled) return;
        if (!info?.id) { nav("/school/invalid", { replace: true }); return; }
        const gid = session?.guest_id || newGuestId();
        setSession({
          guest_id: gid,
          name: session?.name || "", phone: session?.phone || "", project: session?.project || "",
          org_slug: info.slug,
          org_id: info.id,
          org_name: info.name,
          org_approved: true,
          price_group_id: info.price_group_id,
          school_token: t,
          created_at: new Date().toISOString(),
        } as any);
        setTimeout(() => nav("/shop", { replace: true }), 30);
      } catch {
        if (!cancelled) { setStatus("error"); nav("/school/invalid", { replace: true }); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      <SeoHead title="กำลังเข้าสู่หน้าสินค้าโรงเรียน" description="กำลังตรวจสอบลิงก์โรงเรียน" path="/school" />
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 animate-pulse" />
        {status === "loading" ? "กำลังตรวจสอบลิงก์โรงเรียน..." : "ลิงก์ไม่ถูกต้อง"}
      </div>
    </div>
  );
}