import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, School, Send, ShoppingBag, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useGuest, newGuestId } from "@/contexts/GuestContext";
import SeoHead from "@/components/SeoHead";
import { toast } from "sonner";

type Candidate = { id: string; slug: string; name: string };

export default function GuestEntry() {
  const { slug: routeSlug } = useParams();
  const nav = useNavigate();
  const { session, setSession, resolveOrg } = useGuest();
  const slug = (routeSlug || "").trim();

  const [schoolName, setSchoolName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [entering, setEntering] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);

  // If arrived via /s/:slug — auto-resolve org and enter shop directly
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setEntering(true);
    (async () => {
      const info = await resolveOrg(slug);
      if (cancelled) return;
      if (!info?.id) {
        setEntering(false);
        toast.error(`ไม่พบลิงก์โรงเรียน "${slug}"`);
        nav("/s", { replace: true });
        return;
      }
      const gid = session?.guest_id || newGuestId();
      setSession({
        guest_id: gid,
        name: "", phone: "",
        org_slug: slug,
        org_id: info.id,
        org_name: info.name,
        org_approved: true,
        price_group_id: info.price_group_id,
        created_at: new Date().toISOString(),
      } as any);
      setTimeout(() => nav("/shop", { replace: true }), 30);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function requestLink() {
    const s = schoolName.trim();
    if (s.length < 2 || s.length > 120) return toast.error("กรุณากรอกชื่อโรงเรียน (2-120 ตัวอักษร)");
    if (busy) return;
    setBusy(true);
    setCandidates([]);
    try {
      const { data, error } = await supabase.rpc("submit_link_request_v2" as any, {
        p_contact_name: "", p_phone: "", p_school_name: s,
      });
      if (error) throw error;
      const res = (data ?? {}) as { id?: string; matched_slug?: string | null; matched_name?: string | null; candidates?: Candidate[] };
      if (res.id) { supabase.functions.invoke("link-request-notify", { body: { request_id: res.id } }).catch(() => {}); }
      setRequestId(res.id ?? null);
      const list = Array.isArray(res.candidates) ? res.candidates : [];
      if (res.matched_slug) {
        toast.success(`พบโรงเรียน "${res.matched_name || s}" — กำลังเข้าสู่หน้าสินค้า`);
        setTimeout(() => nav(`/s/${res.matched_slug}`, { replace: true }), 300);
        return;
      }
      if (list.length > 1) {
        setCandidates(list);
        toast.info(`พบ ${list.length} รายการที่ใกล้เคียง — กรุณาเลือกโรงเรียนของคุณ`);
        return;
      }
      setSent(true);
      setSchoolName("");
      toast.success("ส่งคำขอเรียบร้อย รอทางร้านส่งลิงก์ให้ทาง LINE");
    } catch (e: any) {
      toast.error(e?.message || "ส่งคำขอไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function chooseCandidate(c: Candidate) {
    try {
      if (requestId) {
        await supabase.rpc("confirm_link_request" as any, { p_id: requestId, p_slug: c.slug });
      }
    } catch { /* non-fatal */ }
    nav(`/s/${c.slug}`, { replace: true });
  }

  function notMine() {
    setCandidates([]);
    setSent(true);
    setSchoolName("");
    toast.success("รับคำขอไว้แล้ว รอทางร้านส่งลิงก์ให้ทาง LINE");
  }

  if (slug && entering) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <div className="flex items-center gap-2"><ShoppingBag className="w-5 h-5 animate-pulse" /> กำลังเข้าสู่หน้าสินค้า...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft relative overflow-hidden">
      <SeoHead
        title="ขอลิงก์โรงเรียนเพื่อดูสินค้า — ร้านนัฐภรณ์ เชียงกลาง"
        description="ขอลิงก์ของโรงเรียน/หน่วยงานของคุณ ทางร้านจะส่งลิงก์ให้ผ่าน LINE OA เพื่อเข้าดูสินค้าและราคาพิเศษ"
        path="/s"
      />
      <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-accent/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-primary/10 blur-3xl" />

      <header className="relative container mx-auto px-6 pt-8 flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary grid place-items-center text-primary-foreground shadow-soft">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">ระบบดูสินค้าและราคา</div>
          <div className="text-xs text-muted-foreground">ร้านนัฐภรณ์ เชียงกลาง</div>
        </div>
      </header>

      <main className="relative container mx-auto px-6 pt-10 pb-12 max-w-lg">
        <h1 className="text-center text-3xl md:text-4xl font-extrabold leading-tight">
          ขอลิงก์โรงเรียนเพื่อดูสินค้า
        </h1>
        <p className="mt-4 text-center text-muted-foreground">
          กรอกชื่อโรงเรียน/หน่วยงานของคุณ ทางร้านจะส่งลิงก์เฉพาะให้ทาง LINE OA
          <br className="hidden sm:block" />
          เมื่อกดลิงก์ จะเห็นสินค้าและราคาตามฐานของโรงเรียนคุณโดยไม่ต้องสมัครสมาชิก
        </p>

        <div className="mt-8 bg-card border border-border rounded-3xl p-6 shadow-card space-y-4">
          <label className="text-sm font-medium flex items-center gap-2">
            <School className="w-4 h-4 text-primary" /> ชื่อโรงเรียน / หน่วยงาน
          </label>
          <Input
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="เช่น โรงเรียนบ้านสบกอน"
            className="rounded-xl h-12"
            maxLength={120}
            onKeyDown={(e) => { if (e.key === "Enter") requestLink(); }}
          />
          <Button
            onClick={requestLink}
            disabled={busy || schoolName.trim().length < 2}
            className="w-full h-12 rounded-2xl bg-gradient-primary text-primary-foreground text-base font-semibold"
          >
            <Send className="w-5 h-5 mr-2" /> {busy ? "กำลังส่ง..." : "ขอลิงก์โรงเรียน"}
          </Button>
          {candidates.length > 0 && (
            <div className="space-y-2 pt-2 border-t" data-testid="candidate-list">
              <div className="text-sm font-semibold">เลือกโรงเรียนของคุณ:</div>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => chooseCandidate(c)}
                  data-testid={`candidate-${c.slug}`}
                  className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-background hover:bg-accent px-4 py-3 text-left transition-colors"
                >
                  <span className="font-medium">{c.name}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
              <button
                type="button"
                onClick={notMine}
                className="w-full text-xs text-muted-foreground underline pt-1"
              >
                ไม่ใช่โรงเรียนของฉัน — ให้ทางร้านส่งลิงก์กลับใน LINE
              </button>
            </div>
          )}
          {sent && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 text-center">
              ✓ ส่งคำขอเรียบร้อย รอทางร้านส่งลิงก์กลับให้ทาง LINE
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ไม่ต้องสมัครสมาชิก ไม่ต้องล็อกอิน ไม่ต้องกรอกชื่อหรือเบอร์โทร
        </p>
      </main>
    </div>
  );
}