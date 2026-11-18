import { useEffect, useState } from "react";
import { ShoppingCart, FileText, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type Counts = { all: number; pending: number; quoted: number; completed: number };

const CARDS: Array<{
  key: keyof Counts; label: string; hint: string; icon: typeof ShoppingCart; tone: string;
}> = [
  { key: "all", label: "คำสั่งซื้อทั้งหมด", hint: "รวมทุกสถานะ", icon: ShoppingCart, tone: "bg-primary/10 text-primary" },
  { key: "pending", label: "รอเสนอราคา", hint: "ต้องดำเนินการ", icon: Clock, tone: "bg-warning/10 text-warning" },
  { key: "quoted", label: "เสนอราคาแล้ว", hint: "รอลูกค้ายืนยัน", icon: FileText, tone: "bg-accent text-accent-foreground" },
  { key: "completed", label: "เสร็จสิ้น", hint: "ปิดงานแล้ว", icon: CheckCircle2, tone: "bg-success/10 text-success" },
];

async function countBy(status?: string): Promise<number> {
  let q: any = supabase.from("orders").select("id", { count: "exact", head: true });
  if (status) q = q.eq("status", status);
  const { count } = await q;
  return typeof count === "number" ? count : 0;
}

/**
 * แถบสรุปตัวเลขด้านบนหน้าออเดอร์ของแอดมิน (แสดงผลอย่างเดียว)
 * นับจากตาราง orders ตรง ๆ ไม่แตะตัวกรอง/ตารางเดิม
 */
export default function OrderMetricCards({ refreshKey = 0 }: { refreshKey?: number }) {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [all, pending, quoted, completed] = await Promise.all([
          countBy(), countBy("pending_quote"), countBy("quoted"), countBy("completed"),
        ]);
        if (alive) setCounts({ all, pending, quoted, completed });
      } catch {
        if (alive) setCounts({ all: 0, pending: 0, quoted: 0, completed: 0 });
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-order-metrics">
      {CARDS.map(({ key, label, hint, icon: Icon, tone }) => (
        <div
          key={key}
          data-testid={`admin-order-metric-${key}`}
          className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"
        >
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs text-muted-foreground">{label}</div>
              {counts === null ? (
                <Skeleton className="mt-1 h-7 w-14" />
              ) : (
                <div className="text-2xl font-bold leading-tight tabular-nums">
                  {counts[key].toLocaleString("th-TH")}
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> {hint}
          </div>
        </div>
      ))}
    </div>
  );
}
