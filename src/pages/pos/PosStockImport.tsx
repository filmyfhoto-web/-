import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Upload, FileSpreadsheet, FileDown, AlertTriangle, CheckCircle2,
  Loader2, X, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  downloadPosTemplate,
  parsePosImportFile,
  validatePosRows,
  commitPosImport,
  loadExistingProductRefs,
  buildErrorReportCSV,
  type PosImportReport,
  type PosImportRow,
} from "@/lib/posProductImport";
import {
  downloadPosSkuTemplate,
  detectPosImportKind,
  parsePosSkuImportFile,
  validatePosSkuRows,
  commitPosSkuImport,
  loadExistingParentSkus,
  loadAllVariantBarcodes,
  buildSkuErrorReportCSV,
  type PosSkuReport,
  type PosSkuVariantRow,
} from "@/lib/posProductImport";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Mode = "create" | "edit";

export default function PosStockImport() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("create");
  const [kind, setKind] = useState<"normal" | "sku">("normal");
  const [rows, setRows] = useState<PosImportRow[]>([]);
  const [skuRows, setSkuRows] = useState<PosSkuVariantRow[]>([]);
  const [fatal, setFatal] = useState<string[]>([]);
  const [report, setReport] = useState<PosImportReport | null>(null);
  const [skuReport, setSkuReport] = useState<PosSkuReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; perRow: any[] } | null>(null);
  const [page, setPage] = useState(1);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importLockRef = useRef(false);

  const pageSize = 25;

  function reset() {
    setRows([]); setSkuRows([]); setFatal([]); setReport(null); setSkuReport(null);
    setFileName(""); setKind("normal");
    setResult(null); setProgress(null); setPage(1);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function ingest(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("รองรับเฉพาะไฟล์ .xlsx หรือ .xls");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`ไฟล์ใหญ่เกิน ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB`);
      return;
    }
    setParsing(true); setResult(null);
    try {
      setFileName(file.name);
      const detected = await detectPosImportKind(file);
      setKind(detected === "sku" ? "sku" : "normal");
      if (detected === "sku") {
        const parsed = await parsePosSkuImportFile(file);
        setFatal(parsed.fatal);
        setSkuRows(parsed.rows);
        setRows([]); setReport(null);
        if (parsed.rows.length) {
          const codes = Array.from(new Set(parsed.rows.map((r) => r.parent_code).filter(Boolean)));
          const [existingParents, existingBarcodes] = await Promise.all([
            loadExistingParentSkus(codes),
            loadAllVariantBarcodes(),
          ]);
          const rep = validatePosSkuRows(parsed.rows, {
            mode, existingParents, existingBarcodes,
          });
          setSkuReport(rep);
          toast.success(`อ่านไฟล์ SKU: ${rep.totals.parents} สินค้าหลัก / ${rep.totals.variants} ตัวเลือก`);
        } else {
          setSkuReport(null);
        }
      } else {
        const parsed = await parsePosImportFile(file);
        setFatal(parsed.fatal);
        setRows(parsed.rows);
        setSkuRows([]); setSkuReport(null);
        if (parsed.rows.length) {
          const existing = await loadExistingProductRefs();
          const rep = validatePosRows(parsed.rows, { mode, existing });
          setReport(rep);
          toast.success(`อ่านไฟล์แล้ว ${parsed.rows.length} แถว`);
        } else {
          setReport(null);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setParsing(false);
    }
  }

  async function revalidate(newMode: Mode) {
    setMode(newMode);
    if (!rows.length && !skuRows.length) return;
    setParsing(true);
    try {
      if (kind === "sku") {
        const codes = Array.from(new Set(skuRows.map((r) => r.parent_code).filter(Boolean)));
        const [existingParents, existingBarcodes] = await Promise.all([
          loadExistingParentSkus(codes),
          loadAllVariantBarcodes(),
        ]);
        setSkuReport(validatePosSkuRows(skuRows, { mode: newMode, existingParents, existingBarcodes }));
      } else {
        const existing = await loadExistingProductRefs();
        setReport(validatePosRows(rows, { mode: newMode, existing }));
      }
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    if (importLockRef.current) return;
    if (kind === "sku" ? !skuReport : !report) return;
    importLockRef.current = true;
    setImporting(true); setConfirmOpen(false);
    try {
      if (kind === "sku" && skuReport) {
        const res = await commitPosSkuImport(mode, skuReport, (p) => setProgress(p));
        const okCount = res.parentsCreated + res.parentsUpdated;
        const varCount = res.variantsCreated + res.variantsUpdated;
        setResult({
          imported: okCount,
          failed: res.failedGroups,
          perRow: res.perGroup.map((g) => ({
            row: g.parent_code, status: g.status, message: g.message,
          })),
        });
        if (res.failedGroups === 0) {
          toast.success(`นำเข้าสำเร็จ ${okCount} สินค้าหลัก / ${varCount} ตัวเลือก`);
        } else {
          toast.warning(`นำเข้า ${okCount} สินค้าหลัก / ${res.failedGroups} กลุ่มล้มเหลว`);
        }
      } else if (report) {
        const res = await commitPosImport(mode, report, (p) => setProgress(p));
        setResult(res);
        if (res.failed === 0) {
          toast.success(`นำเข้าสำเร็จ ${res.imported} รายการ`);
        } else {
          toast.warning(`นำเข้า ${res.imported} สำเร็จ / ${res.failed} ล้มเหลว`);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "นำเข้าล้มเหลว");
    } finally {
      setImporting(false);
      // release lock after short delay to guard double-click
      setTimeout(() => { importLockRef.current = false; }, 500);
    }
  }

  const totals = kind === "sku"
    ? {
        total: skuReport?.totals.variants ?? 0,
        valid: skuReport?.totals.valid ?? 0,
        error: skuReport?.totals.error ?? 0,
        duplicate: skuReport?.totals.duplicate ?? 0,
      }
    : (report?.totals ?? { total: 0, valid: 0, error: 0, duplicate: 0 });
  const canImport =
    (kind === "sku" ? !!skuReport && (skuReport.totals.valid > 0) : !!report && totals.valid > 0) &&
    !importing && fatal.length === 0;

  const pageRows = useMemo(() => {
    if (!report) return [];
    return report.rows.slice((page - 1) * pageSize, page * pageSize);
  }, [report, page]);
  const totalPages = report ? Math.max(1, Math.ceil(report.rows.length / pageSize)) : 1;

  function downloadErrors() {
    const csv = kind === "sku" && skuReport
      ? buildSkuErrorReportCSV(skuReport)
      : report
        ? buildErrorReportCSV(report)
        : "";
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pos-import-errors-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="p-3 md:p-5 max-w-[1600px] mx-auto" data-testid="pos-stock-import">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/pos/stock" data-testid="pos-import-back">
              <ArrowLeft className="h-4 w-4 mr-1" /> กลับสต๊อก
            </Link>
          </Button>
          <h2 className="text-lg md:text-xl font-bold">นำเข้าสินค้าจากไฟล์ Excel</h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="rounded-full" data-testid="pos-import-download-btn">
              <FileDown className="h-4 w-4 mr-1" /> ดาวน์โหลดแบบฟอร์ม Excel
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => downloadPosTemplate("general")} data-testid="pos-import-tpl-general">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> แบบทั่วไป
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadPosTemplate("barcode")} data-testid="pos-import-tpl-barcode">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> แบบมีบาร์โค้ด
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadPosSkuTemplate()} data-testid="pos-import-tpl-sku">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> แบบสินค้า SKU
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={mode} onValueChange={(v) => revalidate(v as Mode)}>
        <TabsList>
          <TabsTrigger value="create" data-testid="pos-import-tab-create">เพิ่มสินค้าใหม่</TabsTrigger>
          <TabsTrigger value="edit" data-testid="pos-import-tab-edit">แก้ไขสินค้าที่มีอยู่</TabsTrigger>
        </TabsList>

        <TabsContent value={mode} className="mt-4 space-y-4">
          <Card
            className={`p-6 border-2 border-dashed transition ${drag ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault(); setDrag(false);
              const f = e.dataTransfer.files?.[0]; if (f) void ingest(f);
            }}
            data-testid="pos-import-dropzone"
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">ลากไฟล์มาวาง หรือกดเลือกไฟล์</p>
                <p className="text-xs text-muted-foreground">รองรับ .xlsx / .xls (สูงสุด 10 MB)</p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing || importing}
                  data-testid="pos-import-pick"
                >
                  <Upload className="h-4 w-4 mr-1" /> เลือกไฟล์
                </Button>
                {(rows.length > 0 || skuRows.length > 0 || fileName) && (
                  <Button variant="outline" onClick={reset} disabled={importing}>
                    <X className="h-4 w-4 mr-1" /> ยกเลิก
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                data-testid="pos-import-file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void ingest(f); }}
              />
              {fileName && <p className="text-xs text-muted-foreground">📄 {fileName}</p>}
            </div>
          </Card>

          {fatal.length > 0 && (
            <Card className="p-3 border-destructive/40 bg-destructive/10 text-destructive text-sm">
              <div className="font-medium flex items-center gap-1 mb-1">
                <AlertTriangle className="h-4 w-4" /> อ่านไฟล์ไม่ผ่าน
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {fatal.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Card>
          )}

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจสอบข้อมูล…
            </div>
          )}

          {kind === "sku" && skuReport && (
            <Card className="p-3 md:p-4" data-testid="pos-import-preview-sku">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="outline">สินค้าหลัก {skuReport.totals.parents}</Badge>
                <Badge variant="outline">ตัวเลือกรวม {skuReport.totals.variants}</Badge>
                <Badge className="bg-emerald-100 text-emerald-800 border-0">ใช้ได้ {skuReport.totals.valid}</Badge>
                <Badge className="bg-rose-100 text-rose-800 border-0">ผิดพลาด {skuReport.totals.error}</Badge>
                <Badge className="bg-amber-100 text-amber-800 border-0">ซ้ำ {skuReport.totals.duplicate}</Badge>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadErrors} disabled={skuReport.totals.error === 0}>
                    <FileDown className="h-4 w-4 mr-1" /> ดาวน์โหลดรายงานความผิดพลาด
                  </Button>
                  <Button
                    disabled={!canImport}
                    onClick={() => setConfirmOpen(true)}
                    data-testid="pos-import-run-sku"
                  >
                    เริ่มนำเข้า
                  </Button>
                </div>
              </div>
              <div className="space-y-3 max-h-[560px] overflow-auto">
                {skuReport.groups.map((g) => (
                  <div key={g.parent_code} className="border rounded-md">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 text-sm">
                      <span className="font-medium">{g.parent_code}</span>
                      <span className="text-muted-foreground">{g.parent_name || "—"}</span>
                      <Badge variant="outline" className="ml-auto">
                        {g.variants.length} ตัวเลือก
                      </Badge>
                      {g.status === "error" && <Badge className="bg-rose-100 text-rose-800 border-0">ผิดพลาด</Badge>}
                      {g.status === "warning" && <Badge className="bg-amber-100 text-amber-800 border-0">เตือน</Badge>}
                      {g.status === "ok" && <Badge className="bg-emerald-100 text-emerald-800 border-0">พร้อม</Badge>}
                    </div>
                    {g.errors.length > 0 && (
                      <div className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50">
                        {g.errors.join(" · ")}
                      </div>
                    )}
                    <table className="w-full text-xs">
                      <thead className="bg-muted/20">
                        <tr>
                          <th className="text-left px-2 py-1">แถว</th>
                          <th className="text-left px-2 py-1">SKU</th>
                          <th className="text-left px-2 py-1">คุณสมบัติ</th>
                          <th className="text-left px-2 py-1">บาร์โค้ด</th>
                          <th className="text-right px-2 py-1">สต๊อก</th>
                          <th className="text-right px-2 py-1">ราคา</th>
                          <th className="text-left px-2 py-1">คำเตือน/ผิดพลาด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.variants.map((v) => (
                          <tr key={v.row._row}
                            className={v.status === "error" ? "bg-rose-50/60" : v.status === "warning" ? "bg-amber-50/60" : ""}>
                            <td className="px-2 py-1 text-muted-foreground">{v.row._row}</td>
                            <td className="px-2 py-1 font-mono">{v.row.sku || "-"}</td>
                            <td className="px-2 py-1">
                              {v.row.attrs.map((a) => `${a.name}=${a.value}`).join(", ")}
                            </td>
                            <td className="px-2 py-1 font-mono">{v.row.barcode || "-"}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{v.row.stock ?? "-"}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{v.row.price ?? "-"}</td>
                            <td className="px-2 py-1">{[...v.errors, ...v.warnings].join(" · ") || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {kind === "normal" && report && (
            <Card className="p-3 md:p-4" data-testid="pos-import-preview">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="outline">ทั้งหมด {totals.total}</Badge>
                <Badge className="bg-emerald-100 text-emerald-800 border-0">ใช้ได้ {totals.valid}</Badge>
                <Badge className="bg-rose-100 text-rose-800 border-0">ผิดพลาด {totals.error}</Badge>
                <Badge className="bg-amber-100 text-amber-800 border-0">ซ้ำ {totals.duplicate}</Badge>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadErrors} disabled={totals.error === 0}>
                    <FileDown className="h-4 w-4 mr-1" /> ดาวน์โหลดรายงานความผิดพลาด
                  </Button>
                  <Button
                    disabled={!canImport}
                    onClick={() => setConfirmOpen(true)}
                    data-testid="pos-import-run"
                  >
                    เริ่มนำเข้า
                  </Button>
                </div>
              </div>

              <div className="overflow-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5">แถว</th>
                      <th className="text-left px-2 py-1.5">สถานะ</th>
                      <th className="text-left px-2 py-1.5">รหัสสินค้า</th>
                      <th className="text-left px-2 py-1.5">ชื่อสินค้า</th>
                      <th className="text-left px-2 py-1.5">หมวด</th>
                      <th className="text-right px-2 py-1.5">จำนวน</th>
                      <th className="text-right px-2 py-1.5">ราคา</th>
                      <th className="text-left px-2 py-1.5">บาร์โค้ด</th>
                      <th className="text-left px-2 py-1.5">คำเตือน/ผิดพลาด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.row._row}
                        className={r.status === "error" ? "bg-rose-50/60" : r.status === "warning" ? "bg-amber-50/60" : ""}>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.row._row}</td>
                        <td className="px-2 py-1.5">
                          {r.status === "ok" && <Badge variant="outline" className="bg-emerald-50 text-emerald-700">พร้อม</Badge>}
                          {r.status === "warning" && <Badge variant="outline" className="bg-amber-100 text-amber-800">เตือน</Badge>}
                          {r.status === "error" && <Badge variant="outline" className="bg-rose-100 text-rose-800">ผิดพลาด</Badge>}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs">{r.row.code || "-"}</td>
                        <td className="px-2 py-1.5">{r.row.name || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-1.5">{r.row.category || "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.row.stock ?? "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.row.standard_price ?? "-"}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">
                          {r.row.barcode ? r.row.barcode : (r.row.barcode_mode ? `โหมด ${r.row.barcode_mode}` : "-")}
                        </td>
                        <td className="px-2 py-1.5 text-xs">
                          {[...r.errors, ...r.warnings].join(" · ") || "-"}
                        </td>
                      </tr>
                    ))}
                    {pageRows.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">ไม่มีข้อมูล</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs mt-2">
                  <span className="text-muted-foreground">หน้า {page} / {totalPages}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {importing && (
            <Card className="p-3">
              <div className="flex items-center justify-between text-sm mb-2">
                <span>กำลังนำเข้า…</span>
                <span className="tabular-nums">{progress?.done ?? 0} / {progress?.total ?? 0}</span>
              </div>
              <Progress value={progress ? (progress.done / Math.max(1, progress.total)) * 100 : 0} />
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการนำเข้า</DialogTitle>
            <DialogDescription>
              จะนำเข้าทั้งหมด {totals.valid} รายการ ({mode === "create" ? "เพิ่มใหม่" : "แก้ไขที่มีอยู่"}).
              แถวที่ผิดพลาด {totals.error} รายการจะถูกข้าม
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>ยกเลิก</Button>
            <Button onClick={runImport} data-testid="pos-import-confirm">ยืนยันนำเข้า</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> นำเข้าเสร็จสิ้น
            </DialogTitle>
            <DialogDescription>
              สำเร็จ {result?.imported ?? 0} รายการ · ล้มเหลว {result?.failed ?? 0} รายการ
            </DialogDescription>
          </DialogHeader>
          {(result?.failed ?? 0) > 0 && (
            <div className="max-h-40 overflow-auto text-xs border rounded p-2 space-y-0.5">
              {result?.perRow.filter((r) => r.status === "failed").slice(0, 50).map((r) => (
                <div key={r.row}>แถว {r.row}: {r.message}</div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setResult(null); reset(); }} data-testid="pos-import-again">
              <RotateCw className="h-4 w-4 mr-1" /> นำเข้าไฟล์ใหม่
            </Button>
            <Button onClick={() => nav("/pos/stock")} data-testid="pos-import-back-stock">
              กลับหน้าสต๊อก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
