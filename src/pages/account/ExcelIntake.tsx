import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  EXCEL_ACCEPT, EXCEL_BUCKET, checkExcelFile, excelStoragePath, intakeItemsToCsv,
  isSubmittableRow, parseExcelFile, summarize, toIntakeItems,
} from "@/lib/excelIntake";
import type { SmartImportRow } from "@/lib/smartImport";
import { fmtTHB } from "@/lib/format";

export default function AccountExcelIntake() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<SmartImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ customer_name: "", school_name: "", phone: "", note: "" });

  // prefill จากโปรไฟล์ฝั่งเซิร์ฟเวอร์ — ลูกค้าที่เชื่อม LINE แล้วไม่ต้องกรอกซ้ำ
  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      customer_name: f.customer_name || profile.full_name || (profile as any).line_display_name || "",
      phone: f.phone || profile.phone || "",
    }));
  }, [profile]);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase.from("organizations").select("name").eq("id", profile.organization_id).maybeSingle()
      .then(({ data }) => { if (data?.name) setForm((f) => ({ ...f, school_name: f.school_name || data.name })); });
  }, [profile?.organization_id]);

  const summary = useMemo(() => summarize(rows), [rows]);
  const items = useMemo(() => toIntakeItems(rows), [rows]);

  const pick = useCallback(async (f: File | null) => {
    setError(null);
    if (!f) return;
    const check = checkExcelFile(f);
    if (!check.ok) { setError(check.reason ?? "ไฟล์ไม่รองรับ"); return; }
    setFile(f);
    setParsing(true);
    try {
      const res = await parseExcelFile(f);
      setRows(res.rows);
      if (res.rows.length === 0) setError("อ่านไฟล์ได้ แต่ไม่พบรายการสินค้า — ลองตรวจหัวตารางหรือแก้ชื่อคอลัมน์");
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setParsing(false);
    }
  }, []);

  function patchRow(i: number, patch: Partial<SmartImportRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch, needsReview: false } : r)));
  }

  function downloadCsv() {
    const blob = new Blob([intakeItemsToCsv(items)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(file?.name || "excel").replace(/\.[^.]+$/, "")}-รายการ.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function submit() {
    if (!user) {
      // เปิดหน้าได้ทุกคน แต่ต้องเข้าสู่ระบบก่อนส่งรายการให้ร้าน
      toast.error("กรุณาเข้าสู่ระบบก่อนส่งรายการ");
      navigate(`/auth?next=${encodeURIComponent("/account/excel")}`);
      return;
    }
    if (items.length === 0) { toast.error("ยังไม่มีรายการที่ส่งได้"); return; }
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    // 1) อัปโหลดไฟล์ต้นฉบับเข้าบัคเก็ตส่วนตัวก่อน — ถ้าไม่สำเร็จจะไม่บันทึกว่า
    //    "เก็บไฟล์แล้ว" และให้ลูกค้ากดส่งใหม่ได้
    const intakeId = crypto.randomUUID();
    let storagePath: string | null = null;
    if (file) {
      const path = excelStoragePath(user.id, intakeId, file.name);
      const { error: upErr } = await supabase.storage
        .from(EXCEL_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (upErr) {
        setSubmitting(false);
        setError("อัปโหลดไฟล์ต้นฉบับไม่สำเร็จ — กรุณากดส่งอีกครั้ง");
        toast.error("อัปโหลดไฟล์ต้นฉบับไม่สำเร็จ — ลองใหม่อีกครั้ง");
        return;
      }
      storagePath = path;
    }

    const { error: err } = await supabase.from("customer_excel_intakes" as any).insert({
      id: intakeId,
      user_id: user.id,
      customer_name: form.customer_name.trim(),
      school_name: form.school_name.trim(),
      phone: form.phone.trim(),
      note: form.note.trim(),
      filename: file?.name ?? "",
      file_size: file?.size ?? 0,
      mime_type: file?.type ?? "",
      storage_bucket: storagePath ? EXCEL_BUCKET : null,
      storage_path: storagePath,
      source: "excel",
      items,
      row_count: items.length,
      needs_review_count: summary.needsReviewCount,
      total: items.reduce((s, it) => s + it.total, 0),
      status: "submitted",
    } as any);
    setSubmitting(false);
    if (err) {
      // ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง เพื่อไม่ให้เหลือไฟล์กำพร้าที่ไม่มี record
      if (storagePath) await supabase.storage.from(EXCEL_BUCKET).remove([storagePath]);
      setError("ส่งรายการไม่สำเร็จ — กรุณาลองใหม่");
      toast.error("ส่งรายการไม่สำเร็จ — กรุณาลองใหม่");
      return;
    }
    toast.success("ส่งไฟล์ให้ร้านแล้ว ร้านจะตรวจและติดต่อกลับ");
    navigate("/account/history");
  }

  return (
    <CustomerLayout>
      <SeoHead title="ส่ง Excel เดิมของฉัน — ร้านนัฐภรณ์" description="อัปโหลดไฟล์รายการสินค้าเดิมของคุณ แล้วร้านจะตรวจและจัดทำเอกสารให้" path="/account/excel" />
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <FileSpreadsheet className="w-6 h-6 text-primary" /> ส่งไฟล์ Excel เดิมของฉัน
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        ใช้ไฟล์เดิมที่คุณทำอยู่แล้วได้เลย (.xlsx, .xls, .csv) ระบบจะอ่านรายการให้ แล้วคุณตรวจก่อนส่ง
      </p>

      <div className="space-y-4 pb-28 md:pb-6">
        <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
          <input
            ref={fileRef}
            type="file"
            accept={EXCEL_ACCEPT}
            className="hidden"
            data-testid="excel-file-input"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <Button className="rounded-xl min-h-11 w-full md:w-auto" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> เลือกไฟล์จากเครื่อง
          </Button>
          {file && (
            <p className="mt-2 text-sm text-muted-foreground break-all">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
          {parsing && (
            <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังอ่านไฟล์…
            </p>
          )}
          {error && (
            <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">{error}</div>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={() => file && pick(file)}>ลองใหม่</Button>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="p-3 border-b border-border flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">ตรวจรายการก่อนส่ง</span>
              <span className="text-muted-foreground">{items.length} รายการ · รวม {fmtTHB(items.reduce((s, i) => s + i.total, 0))}</span>
              {summary.needsReviewCount > 0 && (
                <span className="px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs">
                  ต้องตรวจสอบ {summary.needsReviewCount} แถว
                </span>
              )}
              <Button size="sm" variant="outline" className="rounded-lg ml-auto" onClick={downloadCsv}>
                <Download className="w-3.5 h-3.5 mr-1" /> ดาวน์โหลด CSV
              </Button>
            </div>
            <div className="divide-y divide-border max-h-[55vh] overflow-y-auto">
              {rows.map((r, i) => (
                <div key={i} className="p-3 grid gap-2 md:grid-cols-[1fr_90px_90px_110px]" data-testid="excel-row">
                  <div>
                    <Input value={r.name} onChange={(e) => patchRow(i, { name: e.target.value })} className="rounded-xl" placeholder="ชื่อรายการ" />
                    {r.needsReview && (
                      <span className="mt-1 inline-block text-[11px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                        ต้องตรวจสอบ{r.reviewNote ? ` — ${r.reviewNote}` : ""}
                      </span>
                    )}
                    {!isSubmittableRow(r) && (
                      <span className="mt-1 ml-1 inline-block text-[11px] text-muted-foreground">ยังส่งไม่ได้ (ต้องมีชื่อและจำนวน)</span>
                    )}
                  </div>
                  <Input value={String(r.qty ?? "")} inputMode="decimal" onChange={(e) => patchRow(i, { qty: Number(e.target.value) || 0 })} className="rounded-xl" placeholder="จำนวน" />
                  <Input value={r.unit} onChange={(e) => patchRow(i, { unit: e.target.value })} className="rounded-xl" placeholder="หน่วย" />
                  <Input value={String(r.price ?? "")} inputMode="decimal" onChange={(e) => patchRow(i, { price: Number(e.target.value) || 0 })} className="rounded-xl" placeholder="ราคา" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-4 shadow-card grid gap-3 md:grid-cols-2">
          <div><Label>ชื่อผู้ติดต่อ</Label><Input className="rounded-xl mt-1" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} /></div>
          <div><Label>โรงเรียน / หน่วยงาน</Label><Input className="rounded-xl mt-1" value={form.school_name} onChange={(e) => setForm((f) => ({ ...f, school_name: e.target.value }))} /></div>
          <div><Label>เบอร์โทร</Label><Input className="rounded-xl mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div className="md:col-span-2"><Label>หมายเหตุถึงร้าน</Label><Textarea rows={2} className="rounded-xl mt-1" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
        </div>

        <Button
          className="rounded-xl w-full md:w-auto min-h-12 text-base"
          disabled={submitting || items.length === 0}
          onClick={submit}
          data-testid="excel-submit"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          ส่งไฟล์นี้ให้ร้าน ({items.length} รายการ)
        </Button>
      </div>
    </CustomerLayout>
  );
}
