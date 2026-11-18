import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy, Check, ChevronRight, MessageCircle,
  RefreshCw, UserPlus, Smile,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLineBindingState } from "@/hooks/useLineBindingState";
import { customerCode } from "@/lib/customer360/identity";

import { profileInitial, safePictureUrl } from "@/lib/lineProfile";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { openLine } from "@/lib/line";

export type HomeCustomer = {
  name: string;
  code: string;
};

/**
 * แผงต้อนรับลูกค้าบนหน้าแรก — ชื่อ/รหัสลูกค้า รูปโปรไฟล์ LINE และทางลัด 3 อย่าง
 * ใช้ข้อมูลจริงจาก profiles + สถานะผูก LINE ฝั่งเซิร์ฟเวอร์ (ไม่แตะ business logic เดิม)
 */
export default function CustomerHomePanel({ shopImage }: { shopImage?: React.ReactNode }) {
  const [customer, setCustomer] = useState<HomeCustomer | null>(null);
  const [copied, setCopied] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bust, setBust] = useState(0);
  const line = useLineBindingState();
  
  const { config } = useSiteConfig();
  const lineUrl = config.line_cta.url;
  const linked = line.status === "linked";
  const checking = line.status === "loading";

  // เชื่อม LINE สำเร็จ (เช่น กลับมาจากแอป LINE / เพิ่มเพื่อนแล้ว)
  // → ดึงรูปโปรไฟล์จาก LINE ให้อัตโนมัติครั้งเดียว
  useEffect(() => {
    if (!linked) return;
    setAvatarBroken(false);
    if (line.pictureUrl) return;
    let alive = true;
    (async () => {
      try { await supabase.functions.invoke("line-profile-sync", { body: {} }); } catch { /* ใช้ค่าที่มีอยู่ */ }
      if (alive) await line.refresh();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, line.lineUserId, line.pictureUrl]);


  // รูปเปลี่ยน → ให้ลองโหลดใหม่
  useEffect(() => { setAvatarBroken(false); setAvatarLoaded(false); }, [line.pictureUrl]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, customer_code")
          .eq("id", uid)
          .maybeSingle();
        if (!alive || !data) return;
        setCustomer({
          name: (data as any).full_name || auth?.user?.email || "ลูกค้าของร้าน",
          code: customerCode(data as any),
        });
      } catch {
        /* ไม่มีสิทธิ์/ยังไม่ล็อกอิน — ไม่แสดงแผงนี้ */
      }
    })();
    return () => { alive = false; };
  }, []);

  const copy = async () => {
    if (!customer) return;
    try {
      await navigator.clipboard.writeText(customer.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard ถูกปิด */ }
  };

  /** ดึงสถานะ + รูปโปรไฟล์ LINE ใหม่ (bust cache ของรูปด้วย) */
  const refreshAvatar = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setAvatarBroken(false);
    setAvatarLoaded(false);
    try { await line.refresh(); } catch { /* แสดง fallback ต่อไป */ }
    setBust(Date.now());
    setRefreshing(false);
  };

  const baseAvatar = avatarBroken ? null : safePictureUrl(line.pictureUrl);
  const avatarSrc = baseAvatar ? (bust ? `${baseAvatar}${baseAvatar.includes("?") ? "&" : "?"}v=${bust}` : baseAvatar) : null;
  const name = customer?.name || line.customerName || line.displayName || "ลูกค้าของร้าน";

  const avatarBlock = (
    <div className="relative shrink-0">
      <span className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-full sm:h-20 sm:w-20 border border-primary/20 bg-accent">
        {checking || refreshing ? (
          <span data-testid="home-line-avatar-skeleton" className="h-full w-full animate-pulse bg-brand/15" />
        ) : avatarSrc ? (
          <>
            {!avatarLoaded && (
              <span data-testid="home-line-avatar-skeleton" className="absolute inset-0 animate-pulse bg-brand/15" />
            )}
            <img
              src={avatarSrc}
              alt={`รูปโปรไฟล์ LINE ของ ${line.displayName ?? name}`}
              data-testid="home-line-avatar"
              referrerPolicy="no-referrer"
              onLoad={() => setAvatarLoaded(true)}
              onError={() => setAvatarBroken(true)}
              className="h-full w-full object-cover"
            />
          </>
        ) : linked ? (
          <span data-testid="home-line-avatar" className="text-2xl font-black text-primary sm:text-3xl">
            {profileInitial(line.displayName ?? name)}
          </span>
        ) : (
          <Smile className="h-8 w-8 shrink-0 text-primary sm:h-10 sm:w-10" color="currentColor" strokeWidth={1.8} aria-hidden />
        )}
      </span>
      <button
        type="button"
        onClick={() => void refreshAvatar()}
        disabled={refreshing}
        aria-label="รีเฟรชรูปโปรไฟล์ LINE"
        title="รีเฟรชรูปโปรไฟล์ LINE"
        data-testid="home-line-avatar-refresh"
        className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-primary/20 bg-white text-primary shadow-sm disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
      </button>
    </div>
  );

  /* ---- ยังไม่ได้เชื่อม LINE: ต้อนรับสั้น ๆ + ปุ่มเชื่อมต่อ แต่ยังเห็นทางลัด/แถบสถานะ ---- */
  if (!linked) {
    return (
      <div
        data-testid="home-customer-panel"
        data-linked="false"
        className="rounded-[1.75rem] border border-primary/15 bg-white/90 p-4 shadow-[var(--shadow-brand)] sm:p-6"
      >
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              {avatarBlock}
              <div className="min-w-0">
                <p className="text-xl font-black leading-tight text-brand sm:text-2xl" data-testid="home-welcome-title">
                  ยินดีต้อนรับ โรงเรียน / หน่วยงาน
                </p>
                <p className="text-base font-semibold text-foreground sm:text-lg">
                  {checking ? "กำลังตรวจสอบสถานะ..." : "คุณยังไม่ได้เป็นสมาชิกของร้าน"}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                data-testid="home-line-connect"
                onClick={() => {
                  // เปิด LINE ด้วยการกดของผู้ใช้เองเท่านั้น — ไม่เปลี่ยนเส้นทางไปหน้า LIFF
                  if (lineUrl) openLine(lineUrl);
                }}
                disabled={!lineUrl}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                เปิด LINE ของร้าน
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              ติดต่อร้านผ่าน LINE ได้โดยตรง โดยหน้านี้จะไม่พาไปหน้าเชื่อมบัญชีอัตโนมัติ
            </p>

          </div>
          <div className="hidden min-w-0 sm:block">{shopImage}</div>
        </div>

      </div>
    );
  }

  return (
    <div
      data-testid="home-customer-panel"
      data-linked="true"
      className="rounded-[1.75rem] border border-primary/15 bg-white/90 p-4 shadow-[var(--shadow-brand)] sm:p-6"
    >
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {avatarBlock}
            <div className="min-w-0">
              <p className="text-xl font-black leading-tight text-brand sm:text-2xl" data-testid="home-welcome-title">
                ยินดีต้อนรับ โรงเรียน / หน่วยงาน
              </p>
              <p className="truncate text-lg font-bold text-foreground sm:text-xl" data-testid="home-customer-name">
                {name}
              </p>
              {avatarBroken && (
                <p className="text-[11px] text-muted-foreground">โหลดรูปไม่สำเร็จ — กดรีเฟรชเพื่อลองใหม่</p>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {customer && (
              <div className="inline-flex max-w-full items-center gap-2 rounded-xl bg-accent/70 px-3 py-1.5">
                <span className="truncate text-xs font-bold text-primary" data-testid="home-customer-code">
                  รหัสลูกค้า {customer.code}
                </span>
                <button
                  type="button"
                  onClick={copy}
                  aria-label="คัดลอกรหัสลูกค้า"
                  data-testid="home-copy-code"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-primary ring-1 ring-brand/20"
                >
                  {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                </button>
              </div>
            )}
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-[hsl(var(--success)/0.12)] px-3 py-1.5 text-xs font-semibold text-foreground">
              <MessageCircle className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden />
              <span className="truncate">เชื่อมต่อ LINE แล้ว · {line.displayName || "บัญชี LINE ของคุณ"}</span>
            </span>
          </div>
        </div>

        <div className="hidden min-w-0 sm:block">{shopImage}</div>
      </div>

    </div>
  );
}
