import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { History, Loader2, RefreshCw } from "lucide-react";
import { fetchUnifiedHistory, type HistoryEntry } from "@/lib/customer360/unifiedHistory";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import OrderStatusStrip from "@/components/home/OrderStatusStrip";

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <div className="divide-y divide-border">
      {entries.map((e) => (
        <Link
          key={e.key}
          to={e.deepLink}
          className="flex items-center gap-3 p-3 hover:bg-accent/30 min-h-[56px]"
          data-testid="history-entry"
        >
          <span className="px-2 py-0.5 rounded-full border border-border bg-muted text-[11px] shrink-0">{e.typeLabel}</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{e.title}</div>
            <div className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)} · {e.statusLabel}</div>
          </div>
          {!!e.amount && <div className="text-sm font-medium shrink-0">{fmtTHB(e.amount)}</div>}
        </Link>
      ))}
    </div>
  );
}

export default function AccountUnifiedHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const res = await fetchUnifiedHistory(user.id);
    setEntries(res.entries);
    setError(res.error);
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  return (
    <CustomerLayout>
      <SeoHead title="ประวัติทั้งหมดของฉัน — ร้านนัฐภรณ์" description="ดูออเดอร์ ใบสั่งซื้อ ใบเขียนเบิก และไฟล์ Excel ที่เคยส่งไว้ในที่เดียว" path="/account/history" />
      <OrderStatusStrip sticky />
      <div className="flex items-center justify-between mb-4 mt-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><History className="w-6 h-6 text-primary" /> ประวัติทั้งหมด</h1>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช</Button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden pb-1">
        {loading && (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
          </div>
        )}
        {!loading && error && (
          <div className="p-6 text-center text-sm">
            <p className="text-destructive mb-2">โหลดประวัติไม่สำเร็จ</p>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={load}>ลองใหม่</Button>
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            ยังไม่มีรายการ — เริ่มจาก <Link className="text-primary underline" to="/shop">สั่งสินค้า</Link>
          </div>
        )}
        {!loading && !error && entries.length > 0 && <HistoryList entries={entries} />}
      </div>
      {loading && <p className="sr-only"><Loader2 /> กำลังโหลด</p>}
    </CustomerLayout>
  );
}
