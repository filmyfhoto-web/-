import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload, History } from "lucide-react";
import { storeBasePath, useStoreSlug } from "../useStore";
import { tbl } from "../lib/tbl";

/**
 * Backfill card — surfaces how many previously-saved documents in this store
 * still lack a Google Drive file, and lets the user kick off a bulk upload
 * from Settings. The actual PDF rendering + upload loop already lives in
 * DocumentsList (`syncStuck("all")`), so this card just counts the queue
 * and navigates there with `?bulkSyncDriveAll=1` to auto-trigger the run.
 */
export default function BackfillDriveCard({
  storeId,
  storeSlug,
}: {
  storeId: string;
  storeSlug: string | null;
}) {
  const navigate = useNavigate();

  const pendingQ = useQuery({
    queryKey: ["rds_backfill_drive_count", storeId],
    queryFn: async () => {
      const { count } = await supabase
        .from(tbl("documents") as any)
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .is("google_drive_file_id", null);
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const pending = pendingQ.data ?? 0;

  function startBackfill() {
    if (!storeSlug) return;
    navigate(`${storeBasePath(storeSlug)}/documents?bulkSyncDriveAll=1`);
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">ซิงก์เอกสารเก่าทั้งหมด → Google Drive</p>
            <p className="text-xs text-muted-foreground">
              อัปโหลด PDF ของเอกสารที่บันทึกไว้ก่อนหน้านี้แต่ยังไม่ได้ขึ้น Drive ให้ครบทุกฉบับในครั้งเดียว
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              pending > 0
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
            }`}
          >
            ยังไม่ขึ้น Drive: {pendingQ.isLoading ? "…" : pending} ฉบับ
          </span>
          <Button size="sm" onClick={startBackfill} disabled={!storeSlug || pending === 0}>
            <CloudUpload className="h-3.5 w-3.5 mr-1" />
            เริ่มอัปโหลด
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        ระบบจะเปิดหน้ารายการเอกสารและเริ่มเรนเดอร์ PDF ทีละฉบับตามลำดับ (ห้ามปิดแท็บระหว่างซิงก์)
        ผลลัพธ์และรายการที่ล้มเหลวจะแสดงในกล่อง "สถานะการซิงก์ Google Drive/Sheets" ที่หน้ารายการเอกสาร
      </p>
    </Card>
  );
}