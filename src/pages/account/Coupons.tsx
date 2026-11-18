import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent } from "lucide-react";
import AccountPage, { EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTHB } from "@/lib/format";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

type Coupon = {
  id: string; code: string; title: string; description: string | null;
  discount_type: string; discount_value: number; min_subtotal: number;
  starts_at: string | null; ends_at: string | null; is_active: boolean;
};
type UserCoupon = { coupon_id: string; used_at: string | null };

const TABS = [
  { key: "usable", label: "ใช้ได้" },
  { key: "used", label: "ใช้แล้ว" },
  { key: "expired", label: "หมดอายุ" },
];

export default function Coupons() {
  const userId = useAuthUserId();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [mine, setMine] = useState<UserCoupon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("usable");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ data: c, error: ce }, { data: u }] = await Promise.all([
        (supabase as any).from("coupons").select("*").eq("is_active", true).order("created_at", { ascending: false }),
        (supabase as any).from("user_coupons").select("coupon_id, used_at"),
      ]);
      if (ce) throw ce;
      setCoupons((c ?? []) as Coupon[]);
      setMine((u ?? []) as UserCoupon[]);
    } catch {
      setCoupons([]);
      setError("โหลดคูปองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }, []);

  useEffect(() => { void load(); }, [load, userId]);

  const rows = useMemo(() => {
    const now = Date.now();
    const usedIds = new Set(mine.filter((m) => m.used_at).map((m) => m.coupon_id));
    return (coupons ?? []).filter((c) => {
      const expired = c.ends_at ? new Date(c.ends_at).getTime() < now : false;
      const notStarted = c.starts_at ? new Date(c.starts_at).getTime() > now : false;
      if (tab === "used") return usedIds.has(c.id);
      if (tab === "expired") return expired && !usedIds.has(c.id);
      return !expired && !notStarted && !usedIds.has(c.id);
    });
  }, [coupons, mine, tab]);

  return (
    <AccountPage title="คูปอง / ส่วนลด" description="คูปองและส่วนลดที่ใช้ได้กับงานของคุณ" path={ACCOUNT_ROUTES.coupons}>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-testid={`coupons-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-h-11 rounded-full px-3 text-[13px] font-medium ${
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-primary/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {coupons === null ? <ListSkeleton rows={2} /> : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีคูปองในหมวดนี้" hint="ติดตามโปรโมชันของร้านได้ที่หน้าแรก" />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <article key={c.id} className="flex gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10" data-testid={`coupon-${c.id}`}>
              <span className="w-11 h-11 shrink-0 rounded-xl bg-accent grid place-items-center">
                <BadgePercent className="w-5 h-5 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{c.title}</div>
                {c.description && <p className="text-[13px] text-muted-foreground">{c.description}</p>}
                <p className="mt-1 text-[12px] text-muted-foreground">
                  ใช้ได้เมื่อยอดตั้งแต่ {fmtTHB(c.min_subtotal)}
                  {c.ends_at ? ` · ถึง ${fmtDate(c.ends_at)}` : ""}
                </p>
                <p className="mt-1 text-[12px] font-mono">{c.code}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </AccountPage>
  );
}
