import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, FileDown, FileText, RefreshCw, Search, ArrowLeft, CheckCircle2, AlertTriangle, Clock3 } from "lucide-react";
import { useCurrentStore, storeBasePath, useStoreSlug } from "../useStore";
import { tbl } from "../lib/tbl";

interface ArchiveDocument {
  id: string;
  document_no: string;
  document_type: string;
  document_date: string | null;
  customer_name: string | null;
  google_drive_file_id: string | null;
  google_drive_url: string | null;
  google_drive_sync_status: string | null;
  google_drive_synced_at: string | null;
  last_sync_error: string | null;
}

type ArchiveStatus = "uploaded" | "failed" | "pending";

function getStatus(doc: ArchiveDocument): ArchiveStatus {
  if (doc.google_drive_file_id || doc.google_drive_sync_status === "success") return "uploaded";
  if (doc.google_drive_sync_status === "failed") return "failed";
  return "pending";
}

function downloadUrl(doc: ArchiveDocument): string | null {
  if (!doc.google_drive_file_id) return null;
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(doc.google_drive_file_id)}`;
}

const STATUS_META: Record<ArchiveStatus, { label: string; variant: "default" | "destructive" | "secondary"; icon: typeof CheckCircle2 }> = {
  uploaded: { label: "อัปโหลดแล้ว", variant: "default", icon: CheckCircle2 },
  failed: { label: "ไม่สำเร็จ", variant: "destructive", icon: AlertTriangle },
  pending: { label: "รอซิงก์", variant: "secondary", icon: Clock3 },
};

export default function SyncArchive() {
  const storeSlug = useStoreSlug();
  const { store } = useCurrentStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ArchiveStatus>("all");

  const docsQ = useQuery({
    queryKey: ["rds_sync_archive", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("id,document_no,document_type,document_date,customer_name,google_drive_file_id,google_drive_url,google_drive_sync_status,google_drive_synced_at,last_sync_error")
        .eq("store_id", store!.id)
        .is("deleted_at", null)
        .order("document_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as unknown as ArchiveDocument[]);
    },
  });

  const docs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (docsQ.data ?? []).filter((doc) => {
      const docStatus = getStatus(doc);
      if (status !== "all" && docStatus !== status) return false;
      if (!term) return true;
      return [doc.document_no, doc.customer_name, doc.document_type]
        .some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [docsQ.data, search, status]);

  const counts = useMemo(() => {
    const all = docsQ.data ?? [];
    return {
      all: all.length,
      uploaded: all.filter((d) => getStatus(d) === "uploaded").length,
      failed: all.filter((d) => getStatus(d) === "failed").length,
      pending: all.filter((d) => getStatus(d) === "pending").length,
    };
  }, [docsQ.data]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={`${storeBasePath(storeSlug)}/documents`} aria-label="กลับรายการเอกสาร">
              <ArrowLeft className="mr-1 h-4 w-4" />กลับรายการเอกสาร
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <FileText className="h-6 w-6 text-primary" />ประวัติสำรองเอกสาร
            </h1>
            <p className="text-sm text-muted-foreground">ตรวจสอบ PDF รายใบของ {store?.name ?? "ร้านนี้"} ที่อัปโหลดไป Google Drive</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void docsQ.refetch()} disabled={docsQ.isFetching}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${docsQ.isFetching ? "animate-spin" : ""}`} />รีเฟรชสถานะ
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(["all", "uploaded", "failed", "pending"] as const).map((key) => {
          const active = status === key;
          const labels = { all: "เอกสารทั้งหมด", uploaded: "อัปโหลดแล้ว", failed: "ไม่สำเร็จ", pending: "รอซิงก์" };
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
            >
              <div className="text-xs text-muted-foreground">{labels[key]}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{docsQ.isLoading ? "—" : counts[key]}</div>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขที่เอกสาร / ลูกค้า" className="pl-9" />
          </div>
          <Badge variant="outline" className="w-fit shrink-0">แสดง {docs.length} / {counts.all} รายการ</Badge>
        </div>
        {docsQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />กำลังโหลดประวัติ…</div>
        ) : docs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">ไม่พบเอกสารตามตัวกรองนี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">เอกสาร</th>
                  <th className="px-4 py-3 font-medium">ลูกค้า</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium">อัปโหลดล่าสุด</th>
                  <th className="px-4 py-3 text-right font-medium">ไฟล์</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const docStatus = getStatus(doc);
                  const meta = STATUS_META[docStatus];
                  const Icon = meta.icon;
                  const directDownload = downloadUrl(doc);
                  return (
                    <tr key={doc.id} className="border-t align-top hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link to={`${storeBasePath(storeSlug)}/documents/${doc.id}/sync`} className="font-mono font-medium text-primary hover:underline">{doc.document_no}</Link>
                        <div className="mt-0.5 text-xs text-muted-foreground">{doc.document_type} {doc.document_date ? `· ${doc.document_date}` : ""}</div>
                      </td>
                      <td className="max-w-[240px] px-4 py-3"><span className="block truncate">{doc.customer_name || "—"}</span></td>
                      <td className="px-4 py-3">
                        <Badge variant={meta.variant} className="gap-1"><Icon className="h-3 w-3" />{meta.label}</Badge>
                        {docStatus === "failed" && doc.last_sync_error && <p className="mt-1 max-w-[280px] text-xs text-destructive">{doc.last_sync_error}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {doc.google_drive_synced_at ? new Date(doc.google_drive_synced_at).toLocaleString("th-TH") : "ยังไม่มี"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {doc.google_drive_url && <Button asChild variant="outline" size="sm"><a href={doc.google_drive_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />เปิด</a></Button>}
                          {directDownload && <Button asChild variant="outline" size="sm"><a href={directDownload} target="_blank" rel="noreferrer"><FileDown className="mr-1 h-3.5 w-3.5" />ดาวน์โหลด</a></Button>}
                          {!doc.google_drive_url && !directDownload && <span className="text-xs text-muted-foreground">ยังไม่มีไฟล์</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
