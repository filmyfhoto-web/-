import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, FileCheck2, PackageCheck, History, ChevronRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readIdToken } from "@/lib/lineSession";
import { useLineBindingState } from "@/hooks/useLineBindingState";
import {
  CUSTOMER_ORDER_BUCKETS_DISPLAY, countBuckets, type CustomerOrder,
} from "@/lib/customerOrderBuckets";
import { ACCOUNT_ROUTES, BUCKET_ROUTES } from "@/lib/customerAccountRoutes";

const ICONS = { history: History, clock: Clock3, fileCheck: FileCheck2, packageCheck: PackageCheck } as const;


/** โทนสีชิปแต่ละสถานะ (ใช้ token ของธีม ไม่ hardcode สี) */
const CHIP: Record<string, string> = {
  pending: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
  issued: "bg-accent text-primary",
  received: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  all: "bg-muted text-muted-foreground",
};

/**
 * แถบ “ประวัติและสถานะคำสั่งซื้อ” — นับจากออเดอร์จริงของลูกค้า
 * ยังไม่เชื่อม LINE ก็เห็นแถบนี้ได้ แต่จะเป็น 0 พร้อมคำแนะนำให้เชื่อม LINE
 */
export default function OrderStatusStrip({ linked: linkedProp, sticky = false }: { linked?: boolean; sticky?: boolean }) {
  const line = useLineBindingState();
  const linked = linkedProp ?? line.status === "linked";
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);

  useEffect(() => {
    let alive = true;
    if (!linked) { setOrders([]); return () => { alive = false; }; }
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user?.id) { if (alive) setOrders([]); return; }
        const id_token = readIdToken();
        const { data } = await supabase.functions.invoke("my-line-orders", {
          body: { action: "list", ...(id_token ? { id_token } : {}) },
        });
        if (alive) setOrders(((data as any)?.orders ?? []) as CustomerOrder[]);
      } catch {
        if (alive) setOrders([]);
      }
    })();
    return () => { alive = false; };
  }, [linked]);

  const counts = countBuckets(orders ?? []);

  return (
    <div
      data-testid="home-order-strip"
      data-linked={linked ? "true" : "false"}
      data-sticky={sticky ? "true" : "false"}
      className={`mt-4 w-full rounded-none border border-primary/15 bg-white p-3.5 sm:p-4 ${
        sticky ? "sticky top-0 z-30 shadow-sm" : ""
      }`}
    >
      <div className="flex w-full flex-col gap-2.5">
        <div className="min-w-0">
          <h2 className="text-base font-black text-foreground sm:text-lg">ประวัติและสถานะคำสั่งซื้อ</h2>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {linked
              ? "รวมทุกออเดอร์ ใบเสนอราคา ใบส่งของ และใบเสร็จ"
              : "เชื่อม LINE เพื่อดูประวัติของคุณ"}
          </p>
        </div>

        <div className="-mx-0.5 w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [-webkit-overflow-scrolling:touch]">
          <div className="grid w-full min-w-[560px] grid-cols-5 rounded-none border border-primary/15 divide-x divide-brand/15 sm:min-w-0">

            {CUSTOMER_ORDER_BUCKETS_DISPLAY.map((b) => {
              const Icon = ICONS[b.iconKey];
              return (
                <Link
                  key={b.key}
                  to={BUCKET_ROUTES[b.key] ?? ACCOUNT_ROUTES.history}
                  data-testid={`home-bucket-${b.key}`}
                  title={b.label}
                  className={`flex min-h-[104px] min-w-0 snap-start items-center gap-2 rounded-none px-3 py-3 transition-opacity hover:opacity-80 ${CHIP[b.key] ?? CHIP.all}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-white/70">
                    <Icon className="h-5 w-5 shrink-0" color="currentColor" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold leading-tight">{b.label}</span>
                    <span className="block text-lg font-black leading-none text-foreground">
                      {orders === null ? "—" : counts[b.key] ?? 0}
                    </span>
                  </span>
                </Link>
              );
            })}

            <Link
              to={ACCOUNT_ROUTES.allHistory}
              data-testid="home-all-history"
              title="ดูประวัติทั้งหมด"
              className="flex min-h-[104px] min-w-0 snap-start items-center justify-center gap-1.5 rounded-none bg-white px-3 text-center text-sm font-bold text-primary hover:bg-accent"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-accent">
                <FileText className="h-5 w-5 shrink-0" color="currentColor" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0 truncate">ดูประวัติทั้งหมด</span>
              <ChevronRight className="h-4 w-4 shrink-0" color="currentColor" aria-hidden />
            </Link>
          </div>
        </div>


      </div>
    </div>
  );
}

