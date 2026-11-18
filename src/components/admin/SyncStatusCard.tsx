import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Store, CheckCircle2, AlertTriangle, Cloud } from "lucide-react";
import { toast } from "sonner";

type Row = {
  store_id: string;
  store_name: string;
  rds_count: number;
  missing: number;
  last_synced_at: string | null;
};

export default function SyncStatusCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [adminCount, setAdminCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [{ data: stores }, { data: adminProducts }] = await Promise.all([
        supabase.from("rds_stores").select("id,name").order("name"),
        supabase.from("products").select("id, code").eq("active", true),
      ]);
      const codes = new Set((adminProducts ?? []).map((p: any) => (p.code || "").trim()).filter(Boolean));
      setAdminCount(codes.size);
      const out: Row[] = [];
      for (const s of stores ?? []) {
        const { data: rds } = await supabase
          .from("rds_products")
          .select("sku, updated_at")
          .eq("store_id", s.id);
        const rdsSkus = new Set((rds ?? []).map((r: any) => (r.sku || "").trim()).filter(Boolean));
        const missing = [...codes].filter((c) => !rdsSkus.has(c)).length;
        const lastSynced = (rds ?? []).reduce<string | null>((acc, r: any) => {
          if (!r.updated_at) return acc;
          if (!acc || r.updated_at > acc) return r.updated_at;
          return acc;
        }, null);
        out.push({ store_id: s.id, store_name: s.name, rds_count: rdsSkus.size, missing, last_synced_at: lastSynced });
      }
      setRows(out);
    } catch (e: any) {
      toast.error(e.message || "โหลดสถานะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ch = liveChannel("admin-sync-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "rds_products" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncMissing(storeId: string) {
    setSyncing(storeId);
    try {
      const { data: rds } = await supabase
        .from("rds_products")
        .select("sku")
        .eq("store_id", storeId);
      const rdsSkus = new Set((rds ?? []).map((r: any) => (r.sku || "").trim()).filter(Boolean));
      const { data: adminProducts } = await supabase
        .from("products")
        .select("id, code")
        .eq("active", true);
      const missing = (adminProducts ?? []).filter((p: any) => p.code && !rdsSkus.has(p.code.trim()));
      if (!missing.length) { toast.success("ซิงก์ครบแล้ว ไม่มีรายการที่ขาด"); return; }
      // Touch updated_at to trigger trg_products_sync_to_rds
      let ok = 0;
      for (const p of missing) {
        const { error } = await supabase.from("products").update({ updated_at: new Date().toISOString() }).eq("id", p.id);
        if (!error) ok++;
      }
      toast.success(`สั่งซิงก์ ${ok}/${missing.length} รายการแล้ว`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "ซิงก์ไม่สำเร็จ");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-primary" />
          <h2 className="font-bold">สถานะซิงก์สินค้าไปยังร้านทั้งหมด</h2>
          <Badge variant="outline" className="rounded-full">สินค้าหลัก {adminCount} รายการ</Badge>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl" disabled={loading} onClick={load}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> ตรวจสอบ
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((r) => {
          const synced = r.missing === 0;
          return (
            <div key={r.store_id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background/40">
              <div className={`w-9 h-9 rounded-xl grid place-items-center ${synced ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                {synced ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 font-medium text-sm truncate">
                  <Store className="w-3.5 h-3.5 text-muted-foreground" /> {r.store_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.rds_count} รายการในร้าน · {synced ? "ครบ" : `ขาด ${r.missing}`}
                  {r.last_synced_at && <> · อัปเดต {new Date(r.last_synced_at).toLocaleString("th-TH")}</>}
                </div>
              </div>
              {!synced && (
                <Button size="sm" variant="outline" className="rounded-xl" disabled={syncing === r.store_id} onClick={() => syncMissing(r.store_id)}>
                  {syncing === r.store_id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "ซิงก์ที่ขาด"}
                </Button>
              )}
            </div>
          );
        })}
        {!rows.length && !loading && <div className="text-sm text-muted-foreground">ไม่พบร้าน</div>}
      </div>
    </div>
  );
}