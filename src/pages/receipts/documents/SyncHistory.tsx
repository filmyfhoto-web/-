import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, RefreshCw, CloudUpload, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { triggerSync } from "../lib/syncStub";
import { renderDocToPdfBase64 } from "../lib/pdfUtils";
import { useCurrentStore, storeBasePath, useStoreSlug } from "../useStore";
import { tbl } from "../lib/tbl";

interface LogRow {
  id: string;
  action: string;
  detail: any;
  created_at: string;
}

export default function SyncHistory() {
  const storeSlug = useStoreSlug();
  const { id } = useParams<{ id: string }>();
  const { store } = useCurrentStore();

  const docQ = useQuery({
    queryKey: ["rds_doc_sync_meta", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("id,document_no,document_type,paper_size,document_date,google_drive_url,google_drive_file_id,google_drive_sync_status,google_drive_synced_at,google_sheet_sync_status,google_sheet_synced_at,last_sync_error,customer_name,customer_phone,customer_address,customer_tax_id,customer_branch,vat_mode,vat_rate,price_type,withholding_tax_enabled,withholding_tax_rate,discount_amount,payment_method,notes,subtotal,discount_total,amount_before_vat,vat_amount,grand_total,withholding_tax_amount,net_total,show_document_date,show_payment_method,show_payment_date,show_footer_document_date,template,print_mode,auto_fit_a4,print_scale")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const logsQ = useQuery({
    queryKey: ["rds_doc_sync_logs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("activity_logs") as any)
        .select("id,action,detail,created_at")
        .eq("target_id", id!)
          .in("action", ["drive_sync", "drive_sync_failed", "sheet_sync", "sheet_sync_failed"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const templateConfigQ = useQuery({
    queryKey: ["rds_document_templates", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("document_templates") as any)
        .select("template_key, header_text, footer_text")
        .eq("store_id", store!.id);
      const map: Record<string, { header_text: string; footer_text: string }> = {};
      ((data as any[]) ?? []).forEach((r) => { map[r.template_key] = { header_text: r.header_text ?? "", footer_text: r.footer_text ?? "" }; });
      return map;
    },
  });

  const rows: LogRow[] = useMemo(() => (logsQ.data as any[]) ?? [], [logsQ.data]);

  async function retryUpload() {
    if (!store || !docQ.data) return;
    try {
      const { data: items } = await supabase
        .from(tbl("document_items") as any)
        .select("*")
        .eq("document_id", id!)
        .order("item_order");
      const d = docQ.data;
      const state = {
        document_type: d.document_type,
        paper_size: d.paper_size,
        print_mode: d.print_mode ?? "fit_a4",
        auto_fit_a4: d.auto_fit_a4 ?? true,
        print_scale: d.print_scale != null ? Number(d.print_scale) : null,
        template: d.template ?? "modern",
        document_date: d.document_date,
        show_document_date: d.show_document_date,
        vat_mode: d.vat_mode,
        vat_rate: Number(d.vat_rate),
        price_type: d.price_type,
        withholding_tax_enabled: !!d.withholding_tax_enabled,
        withholding_tax_rate: Number(d.withholding_tax_rate ?? 0),
        discount_amount: Number(d.discount_amount ?? 0),
        customer_name: d.customer_name ?? "",
        customer_phone: d.customer_phone ?? "",
        customer_address: d.customer_address ?? "",
        customer_tax_id: d.customer_tax_id ?? "",
        customer_branch: d.customer_branch ?? "",
        payment_method: d.payment_method ?? "",
        show_payment_method: d.show_payment_method !== false,
        show_payment_date: d.show_payment_date !== false,
        show_footer_document_date: d.show_footer_document_date !== false,
        notes: d.notes ?? "",
        items: ((items as any[]) ?? []).map((it: any) => ({
          key: it.id,
          product_id: it.product_id,
          name: it.name,
          description: it.description ?? "",
          price: Number(it.price),
          quantity: Number(it.quantity),
          unit: it.unit ?? "",
          discount_percent: Number(it.discount_percent ?? 0),
          discount_amount: Number(it.discount_amount ?? 0),
        })),
      };
      const totals = {
        subtotal: Number(d.subtotal),
        discount_total: Number(d.discount_total),
        amount_before_vat: Number(d.amount_before_vat),
        vat_amount: Number(d.vat_amount),
        grand_total: Number(d.grand_total),
        withholding_tax_amount: Number(d.withholding_tax_amount),
        net_total: Number(d.net_total),
      };
      toast({ title: "กำลังเตรียม PDF…" });
      const pdf64 = await renderDocToPdfBase64(store, state, totals, d.document_no, d.paper_size, "portrait", true, templateConfigQ.data?.[state.template ?? "modern"]);
      if (!pdf64) throw new Error("เตรียม PDF ไม่สำเร็จ");
      const r = await triggerSync([id!], "drive", { [id!]: pdf64 });
      if (r.ok) toast({ title: "อัปโหลดเข้า Google Drive สำเร็จ" });
      else toast({ title: "อัปโหลดล้มเหลว", variant: "destructive" });
      logsQ.refetch();
      docQ.refetch();
    } catch (e: any) {
      toast({ title: "อัปโหลดไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    }
  }

  const d = docQ.data;
  const failed = d?.google_drive_sync_status === "failed";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`${storeBasePath(storeSlug)}/documents`}><ArrowLeft className="h-4 w-4 mr-1" />กลับ</Link>
        </Button>
        <Button onClick={retryUpload}>
          <CloudUpload className="h-4 w-4 mr-1.5" />ซิงก์ Google Drive
        </Button>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">ประวัติการอัปโหลด Google Drive</h1>
          {d && <span className="text-sm text-muted-foreground font-mono">{d.document_no}</span>}
        </div>
        {d && (
          <div className="text-sm space-y-1">
            <p>
              สถานะปัจจุบัน:{" "}
              <Badge variant={d.google_drive_sync_status === "success" ? "default" : d.google_drive_sync_status === "failed" ? "destructive" : "secondary"}>
                {d.google_drive_sync_status ?? "—"}
              </Badge>
              {d.google_drive_synced_at && (
                <span className="text-xs text-muted-foreground ml-2">
                  ล่าสุด {new Date(d.google_drive_synced_at).toLocaleString("th-TH")}
                </span>
              )}
            </p>
            {d.google_drive_url && (
              <p>
                <a href={d.google_drive_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> เปิดไฟล์ล่าสุดใน Drive
                </a>
              </p>
            )}
            {failed && d.last_sync_error && (
              <p className="text-xs text-destructive flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{d.last_sync_error}</span>
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-medium mb-3">ประวัติการอัปโหลดทั้งหมด</h2>
        {logsQ.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
        {!logsQ.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการอัปโหลด</p>
        )}
        <ul className="space-y-2">
          {rows.map((r) => {
            const ok = r.action === "drive_sync" || r.action === "sheet_sync";
            const kind = r.action.startsWith("sheet") ? "Sheets" : "Drive";
            const det = r.detail ?? {};
            return (
              <li key={r.id} className="border border-border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{kind}</Badge>
                    <Badge variant={ok ? "default" : "destructive"}>{ok ? "สำเร็จ" : "ล้มเหลว"}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("th-TH")}
                  </span>
                </div>
                {ok ? (
                  <div className="mt-1 space-y-0.5 text-xs">
                    {det.file_name && <p>ไฟล์: <span className="font-mono">{det.file_name}</span></p>}
                    {det.url && (
                      <a href={det.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" />เปิดไฟล์
                      </a>
                    )}
                    <SyncDetailGrid det={det} />
                  </div>
                ) : (
                  <div className="mt-1 text-xs space-y-1">
                    <p className="text-destructive">{det.error ?? (det.reason === "header_mismatch" ? "หัวคอลัมน์ Google Sheet ไม่ตรง" : "ไม่ทราบสาเหตุ")}</p>
                    <SyncDetailGrid det={det} />
                    {det.reason === "header_mismatch" && Array.isArray(det.mismatches) && (
                      <div className="border rounded-md overflow-hidden mt-1">
                        <table className="w-full text-[11px]">
                          <thead className="bg-muted">
                            <tr>
                              <th className="px-2 py-1 text-left w-10">คอล.</th>
                              <th className="px-2 py-1 text-left">คาดว่า</th>
                              <th className="px-2 py-1 text-left">พบจริง</th>
                            </tr>
                          </thead>
                          <tbody>
                            {det.mismatches.map((m: any, i: number) => (
                              <tr key={i} className="border-t">
                                <td className="px-2 py-1 font-mono">{m.col}</td>
                                <td className="px-2 py-1 text-emerald-700">{m.expected || "(ว่าง)"}</td>
                                <td className="px-2 py-1 text-destructive">{m.actual || "(ว่าง)"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {failed && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={retryUpload}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />ลองอัปโหลดใหม่
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function SyncDetailGrid({ det }: { det: any }) {
  if (!det || typeof det !== "object") return null;
  const fields: Array<{ k: string; label: string; mono?: boolean; link?: boolean }> = [
    { k: "endpoint", label: "endpoint" },
    { k: "sheet_id", label: "sheet_id", mono: true },
    { k: "tab", label: "แท็บ" },
    { k: "doc_type", label: "doc_type" },
    { k: "root_folder_id", label: "root_folder", mono: true },
    { k: "target_folder_id", label: "target_folder", mono: true },
    { k: "file_id", label: "file_id", mono: true },
    { k: "mode", label: "mode" },
  ];
  const rows = fields.filter((f) => det[f.k] != null && det[f.k] !== "");
  if (!rows.length) return null;
  return (
    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {rows.map((f) => (
        <div key={f.k} className="flex gap-1">
          <span className="shrink-0">{f.label}:</span>
          <span className={`break-all ${f.mono ? "font-mono" : ""}`}>{String(det[f.k])}</span>
        </div>
      ))}
    </div>
  );
}
