import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileDown, AlertTriangle, CheckCircle2, X, FileSpreadsheet, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseImportFile,
  validateImportRows,
  commitImport,
  downloadTemplate,
  downloadTemplateCSV,
  decodeCsvBuffer,
  sha256File,
  type ImportRow,
  type ValidationReport,
  type ImportSummary,
  type ImportProgress,
} from "@/lib/productTemplate";

export default function ProductCsvImportDialog({
  open, onOpenChange, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [fileHash, setFileHash] = useState<string>("");
  const [encoding, setEncoding] = useState<string>("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [progressInfo, setProgressInfo] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportSummary | null>(null);

  function reset() {
    setRows([]); setFileName(""); setFileSize(0); setFileHash(""); setEncoding("");
    setParseErrors([]); setReport(null);
    setProgress(0); setProgressMsg(""); setProgressInfo({ done: 0, total: 0 }); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pickFile(file: File) {
    setFileName(file.name);
    setFileSize(file.size);
    setResult(null);
    try {
      // detect encoding (CSV only) for transparency in preview
      if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
        try {
          const buf = await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer();
          setEncoding(decodeCsvBuffer(buf).encoding);
        } catch { setEncoding(""); }
      } else {
        setEncoding("xlsx/xls");
      }
      try { setFileHash(await sha256File(file)); } catch { /* ignore */ }
      const { rows: parsed, errors } = await parseImportFile(file);
      setRows(parsed);
      setParseErrors(errors);
      // Load existing category names for "new category" stats
      const { data: cats } = await supabase.from("categories").select("name");
      const names = (cats ?? []).map((c: any) => c.name as string);
      setReport(validateImportRows(parsed, names));
      if (!parsed.length && !errors.length) toast.error("ไม่พบข้อมูลในไฟล์");
      else if (parsed.length) toast.success(`อ่าน ${parsed.length} แถวเรียบร้อย`);
    } catch (e: any) {
      setParseErrors([e?.message || "อ่านไฟล์ไม่สำเร็จ"]);
      setRows([]); setReport(null);
      toast.error("อ่านไฟล์ไม่สำเร็จ");
    }
  }

  async function run() {
    if (!rows.length) return;
    setRunning(true); setProgress(0); setProgressMsg("เริ่มดำเนินการ…");
    const toastId = `import-${Date.now()}`;

    // Create live job row so /admin/imports can show real-time progress
    let jobId: string | null = null;
    let lastWrite = 0;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: job } = await supabase.from("import_jobs").insert({
        user_id: user?.id,
        filename: fileName || null,
        file_size: fileSize || null,
        file_hash: fileHash || null,
        total_rows: rows.length,
        stage: "prepare",
        message: "เริ่มดำเนินการ",
      }).select("id").single();
      jobId = (job as any)?.id ?? null;
    } catch { /* ignore — non-fatal */ }

    const onProg = (p: ImportProgress) => {
      const pct = p.total > 0 ? Math.min(99, Math.round((p.done / p.total) * 100)) : 0;
      setProgress(pct);
      setProgressInfo({ done: p.done, total: p.total });
      const stageLabel = p.stage === "delete" ? "ลบ" : p.stage === "upsert" ? "เพิ่ม/อัปเดต" : p.stage === "done" ? "เสร็จสิ้น" : "เตรียม";
      const msg = p.message || `${stageLabel} ${p.done}/${p.total}`;
      setProgressMsg(msg);
      // mirror in toast so user can close dialog and keep watching
      toast.loading(`นำเข้าสินค้า — ${stageLabel} ${p.done}/${p.total}`, { id: toastId });
      // throttle DB updates to ~750ms or on stage change / done
      const now = Date.now();
      if (jobId && (p.stage === "done" || now - lastWrite >= 750)) {
        lastWrite = now;
        void supabase.from("import_jobs").update({
          processed_rows: p.done,
          total_rows: p.total,
          stage: p.stage,
          message: msg,
        }).eq("id", jobId);
      }
    };
    try {
      const summary = await commitImport(rows, onProg);
      setResult(summary);
      setProgress(100);
      if (jobId) {
        await supabase.from("import_jobs").update({
          processed_rows: rows.length,
          total_rows: rows.length,
          added: summary.added,
          updated: summary.updated,
          deleted: summary.deleted,
          failed: summary.failed,
          stage: "done",
          message: `เสร็จสิ้น (เพิ่ม ${summary.added} / อัปเดต ${summary.updated} / ลบ ${summary.deleted}${summary.failed ? ` / ผิด ${summary.failed}` : ""})`,
          finished_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
      // Log import
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("import_logs").insert({
          user_id: user?.id,
          filename: fileName,
          file_size: fileSize || null,
          file_hash: fileHash || null,
          total_rows: rows.length,
          added: summary.added,
          updated: summary.updated,
          deleted: summary.deleted,
          failed: summary.failed,
          warnings_count: report?.warnings.length ?? 0,
          errors_count: summary.errors.length,
          row_results: summary.rows.slice(0, 200) as any,
          validation: {
            encoding,
            stats: report?.stats ?? null,
            warnings: report?.warnings.slice(0, 50) ?? [],
            errors: report?.errors.slice(0, 50) ?? [],
          } as any,
        });
      } catch { /* ignore */ }

      const ok = summary.added + summary.updated + summary.deleted;
      toast.dismiss(toastId);
      if (!summary.failed) toast.success(`นำเข้าเรียบร้อย (เพิ่ม ${summary.added} / อัปเดต ${summary.updated} / ลบ ${summary.deleted})`);
      else toast.warning(`เสร็จสิ้น สำเร็จ ${ok} / ล้มเหลว ${summary.failed}`);
      onDone();
    } catch (e: any) {
      toast.dismiss(toastId);
      if (jobId) {
        await supabase.from("import_jobs").update({
          stage: "error",
          message: e?.message || "นำเข้าล้มเหลว",
          error: e?.message || "นำเข้าล้มเหลว",
          finished_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
      toast.error(e?.message || "นำเข้าล้มเหลว");
    } finally {
      setRunning(false);
    }
  }

  const blocked = !rows.length || (report?.errors.length ?? 0) > 0 || parseErrors.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o && !running) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>นำเข้าสินค้า (Excel / CSV)</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>รองรับไฟล์ <b>.xlsx, .xls, .csv</b> — หัวคอลัมน์ภาษาไทย (<code className="bg-muted px-1 rounded">รหัสสินค้า, ชื่อสินค้า, หน่วยนับ, หมวดหมู่, สต๊อก, ราคาทุน, ราคามาตรฐาน, ราคา +10%, ราคา +15%, ราคา +20%</code>) หรืออังกฤษก็ได้</p>
          <p>ระบบจะ <b>เพิ่ม/อัปเดต</b> ตามรหัสสินค้า (action = add) หรือ <b>ลบ</b> เมื่อ action = delete · สร้างหมวดหมู่ที่ไม่มีให้อัตโนมัติ · ตั้งราคาทุนและราคากลุ่ม +10/+15/+20 ให้</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()} disabled={running}>
            <Upload className="w-4 h-4 mr-1" /> เลือกไฟล์
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={downloadTemplate} disabled={running}>
            <FileSpreadsheet className="w-4 h-4 mr-1" /> เทมเพลต Excel
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={downloadTemplateCSV} disabled={running}>
            <FileDown className="w-4 h-4 mr-1" /> เทมเพลต CSV
          </Button>
          {rows.length > 0 && !running && (
            <Button variant="ghost" className="rounded-xl" onClick={reset}><X className="w-4 h-4 mr-1" /> ล้าง</Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
        </div>

        {fileName && (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            <span>📄 {fileName}</span>
            <span>{rows.length} แถว</span>
            {fileSize > 0 && <span>{(fileSize / 1024).toFixed(1)} KB</span>}
            {encoding && <span>encoding: <code className="bg-muted px-1 rounded">{encoding}</code></span>}
            {fileHash && <span className="font-mono">sha256: {fileHash.slice(0, 12)}…</span>}
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <div className="font-medium mb-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> อ่านไฟล์ไม่ผ่าน</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {parseErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {report && (
          <div className="rounded-xl border border-border p-3 text-xs space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">ทั้งหมด {report.stats.total}</Badge>
              <Badge className="bg-success/15 text-success border-success/30">เพิ่ม/อัปเดต {report.stats.add}</Badge>
              <Badge className="bg-destructive/15 text-destructive border-destructive/30">ลบ {report.stats.delete}</Badge>
              {report.stats.newCategories.length > 0 && (
                <Badge className="bg-primary/15 text-primary border-primary/30">หมวดใหม่ {report.stats.newCategories.length}</Badge>
              )}
              {report.stats.duplicates > 0 && (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">code ซ้ำ {report.stats.duplicates}</Badge>
              )}
            </div>
            {report.errors.length > 0 && (
              <details open className="text-destructive">
                <summary className="cursor-pointer font-medium">ข้อผิดพลาด ({report.errors.length})</summary>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-auto pl-4 list-disc">
                  {report.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
            {report.warnings.length > 0 && (
              <details className="text-amber-700">
                <summary className="cursor-pointer">คำเตือน ({report.warnings.length})</summary>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-auto pl-4 list-disc">
                  {report.warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="border border-border rounded-xl overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">action</th>
                  <th className="text-left p-2">รหัส</th>
                  <th className="text-left p-2">ชื่อ</th>
                  <th className="text-left p-2">หน่วย</th>
                  <th className="text-left p-2">หมวด</th>
                  <th className="text-right p-2">สต๊อก</th>
                  <th className="text-right p-2">ราคา</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 text-muted-foreground">{r._row ?? i + 1}</td>
                    <td className="p-2">{r.action}</td>
                    <td className="p-2 font-mono">{r.code}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.unit}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2 text-right">{r.stock ?? ""}</td>
                    <td className="p-2 text-right">{r.standard_price ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div className="p-2 text-xs text-muted-foreground">…และอีก {rows.length - 50} แถว</div>}
          </div>
        )}

        {running && (
          <div>
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
              <span>{progressMsg || "กำลังนำเข้า…"} ({progressInfo.done}/{progressInfo.total}) — {progress}%</span>
              <Button type="button" size="sm" variant="ghost" className="rounded-xl h-7" onClick={() => onOpenChange(false)}>
                <Minimize2 className="w-3 h-3 mr-1" /> ทำงานเบื้องหลัง
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" /> เพิ่ม {result.added}</Badge>
              <Badge className="bg-primary/15 text-primary border-primary/30">อัปเดต {result.updated}</Badge>
              <Badge variant="outline">ลบ {result.deleted}</Badge>
              {result.failed > 0 && <Badge className="bg-destructive/15 text-destructive border-destructive/30"><AlertTriangle className="w-3 h-3 mr-1" /> ล้มเหลว {result.failed}</Badge>}
            </div>
            {result.errors.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-destructive">ดูข้อผิดพลาด ({result.errors.length})</summary>
                <ul className="mt-1 space-y-0.5 max-h-40 overflow-auto pl-4 list-disc">
                  {result.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="rounded-xl" disabled={running} onClick={() => { onOpenChange(false); reset(); }}>ปิด</Button>
          <Button className="rounded-xl bg-gradient-primary text-primary-foreground" disabled={blocked || running} onClick={run}>
            เริ่มนำเข้า
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}