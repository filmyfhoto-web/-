import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Cloud, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { storeBasePath, useStoreSlug } from "../useStore";
import { tbl } from "../lib/tbl";

type StoreRow = {
  id: string;
  slug: string | null;
  name: string;
  google_drive_folder_id: string | null;
};

type Counts = { total: number; uploaded: number; pending: number };

async function countFor(storeId: string): Promise<Counts> {
  const base = supabase
    .from(tbl("documents") as any)
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .is("deleted_at", null);
  const [{ count: total }, { count: uploaded }] = await Promise.all([
    base,
    supabase
      .from(tbl("documents") as any)
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .not("google_drive_file_id", "is", null),
  ]);
  const t = total ?? 0;
  const u = uploaded ?? 0;
  return { total: t, uploaded: u, pending: Math.max(0, t - u) };
}

export default function PerStoreSyncStatusCard() {
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["rds_per_store_sync_status"],
    queryFn: async () => {
      const { data: stores, error } = await supabase
        .from(tbl("stores") as any)
        .select("id, slug, name, google_drive_folder_id")
        .order("slug");
      if (error) throw error;
      const rows = (stores ?? []) as unknown as StoreRow[];
      const counts = await Promise.all(rows.map((s) => countFor(s.id)));
      return rows.map((s, i) => ({ ...s, counts: counts[i] }));
    },
    refetchInterval: 30_000,
  });

  const rows = q.data ?? [];
  const grand = rows.reduce<Counts>(
    (acc, r) => ({
      total: acc.total + r.counts.total,
      uploaded: acc.uploaded + r.counts.uploaded,
      pending: acc.pending + r.counts.pending,
    }),
    { total: 0, uploaded: 0, pending: 0 },
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Cloud className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">สถานะการซิงก์ Google Drive แยกตามร้าน</p>
            <p className="text-xs text-muted-foreground">รวมทุกร้านในโปรเจกต์ พร้อมจำนวนที่อัปโหลดแล้วและยังคงค้าง</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${q.isFetching ? "animate-spin" : ""}`} /> รีเฟรช
        </Button>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="ทั้งหมด" value={grand.total} tone="muted" />
        <StatBox label="อัปโหลดแล้ว" value={grand.uploaded} tone="success" />
        <StatBox label="ยังคงค้าง" value={grand.pending} tone={grand.pending > 0 ? "warning" : "success"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {q.isLoading && (
          <p className="text-sm text-muted-foreground col-span-full">กำลังโหลด...</p>
        )}
        {!q.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">ไม่พบร้าน</p>
        )}
        {rows.map((r) => {
          const { total, uploaded, pending } = r.counts;
          const pct = total > 0 ? Math.round((uploaded / total) * 100) : 100;
          const synced = pending === 0;
          const folderUrl = r.google_drive_folder_id
            ? `https://drive.google.com/drive/folders/${r.google_drive_folder_id}`
            : null;
          return (
            <div key={r.id} className="rounded-xl border border-border p-4 space-y-3 bg-background/40">
              <div className="flex items-center gap-2">
                <div
                  className={`h-8 w-8 rounded-lg grid place-items-center ${
                    synced ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  }`}
                >
                  {synced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate flex items-center gap-1">
                    <Store className="h-3.5 w-3.5 text-muted-foreground" /> {r.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {synced ? "ซิงก์ครบทุกฉบับ" : `ยังค้าง ${pending} ฉบับ`}
                  </p>
                </div>
                <span className="text-xs font-medium tabular-nums">{pct}%</span>
              </div>

              <Progress value={pct} className="h-2" />

              <div className="grid grid-cols-3 gap-2">
                <StatBox label="ทั้งหมด" value={total} tone="muted" compact />
                <StatBox label="อัปโหลด" value={uploaded} tone="success" compact />
                <StatBox label="ค้าง" value={pending} tone={pending > 0 ? "warning" : "success"} compact />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {folderUrl ? (
                  <a
                    href={folderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    เปิดโฟลเดอร์ Drive <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-[11px] text-muted-foreground">ยังไม่ได้ตั้งค่า Folder ID</span>
                )}
                {r.slug && pending > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 text-xs"
                    onClick={() => navigate(`${storeBasePath(r.slug)}/documents?bulkSyncDriveAll=1`)}
                  >
                    ซิงก์ที่ค้าง
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatBox({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: number;
  tone: "muted" | "success" | "warning";
  compact?: boolean;
}) {
  const toneCls =
    tone === "success"
      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
      : tone === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      : "bg-muted text-muted-foreground";
  return (
    <div className={`rounded-lg px-3 ${compact ? "py-1.5" : "py-2"} ${toneCls}`}>
      <p className={`${compact ? "text-[10px]" : "text-[11px]"} opacity-80`}>{label}</p>
      <p className={`${compact ? "text-sm" : "text-lg"} font-semibold tabular-nums`}>{value.toLocaleString("th-TH")}</p>
    </div>
  );
}