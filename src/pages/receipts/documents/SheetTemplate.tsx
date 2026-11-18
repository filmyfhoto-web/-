import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Copy, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { storeBasePath, useStoreSlug } from "../useStore";

// Must match EXPECTED_HEADERS in supabase/functions/rds-google-sync/index.ts
const HEADERS = [
  "เลขที่", "วันที่", "ประเภท", "ลูกค้า", "เบอร์โทร", "เลขผู้เสียภาษี",
  "ก่อนส่วนลด", "ส่วนลด", "ยอดก่อน VAT", "VAT", "ยอดรวม",
  "หัก ณ ที่จ่าย", "สุทธิ", "วิธีชำระ", "สถานะชำระ", "สถานะเอกสาร", "เวลา sync",
];

// Sample rows for testing — same column order as HEADERS
const SAMPLE_ROWS: string[][] = [
  ["RC-2026-0001", "2026-06-24", "ใบเสร็จรับเงิน", "บริษัท ตัวอย่าง จำกัด", "0812345678", "0105557000111",
   "1000.00", "100.00", "900.00", "63.00", "963.00", "0.00", "963.00", "เงินสด", "ชำระแล้ว", "ออกแล้ว", "2026-06-24 10:15:00"],
  ["DN-2026-0002", "2026-06-24", "ใบส่งของ", "ร้านทดสอบ", "0898765432", "",
   "500.00", "0.00", "500.00", "35.00", "535.00", "0.00", "535.00", "โอนเงิน", "ค้างชำระ", "ออกแล้ว", "2026-06-24 11:00:00"],
  ["QT-2026-0003", "2026-06-24", "ใบเสนอราคา", "คุณลูกค้า ทดลอง", "0900000000", "",
   "2000.00", "200.00", "1800.00", "126.00", "1926.00", "57.78", "1868.22", "เครดิต", "รอชำระ", "ฉบับร่าง", "2026-06-24 12:30:00"],
];

export default function SheetTemplate() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const storeSlug = useStoreSlug();

  // Persist tab name per-store so each shop can keep its own preferred tab.
  // Edge function still reads from "Sheet1" — this lets the user prep an
  // xlsx with a custom name and then rename to Sheet1 on import if needed.
  const tabKey = `rds:xlsxTabName:${storeSlug ?? "default"}`;
  const [tabName, setTabName] = useState<string>("Sheet1");
  useEffect(() => {
    try {
      const v = localStorage.getItem(tabKey);
      if (v) setTabName(v);
    } catch { /* noop */ }
  }, [tabKey]);
  function saveTabName(v: string) {
    const clean = (v || "Sheet1").replace(/[\\\/\?\*\[\]:]/g, "").slice(0, 31) || "Sheet1";
    setTabName(clean);
    try { localStorage.setItem(tabKey, clean); } catch { /* noop */ }
  }

  const csv = useMemo(() => {
    // Prefix BOM so Excel/Google Sheets detects UTF-8 Thai correctly
    return "\ufeff" + HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
  }, []);

  const csvWithSample = useMemo(() => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [HEADERS.map(esc).join(",")];
    for (const row of SAMPLE_ROWS) lines.push(row.map(esc).join(","));
    return "\ufeff" + lines.join("\n") + "\n";
  }, []);

  const tsv = useMemo(() => HEADERS.join("\t"), []);

  function download(content: string, filename: string, msg: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "ดาวน์โหลดสำเร็จ", description: msg });
  }
  const downloadCsv = () => download(csv, "rds-google-sheets-template.csv", "เทมเพลตเปล่า: นำเข้า/เปิดด้วย Google Sheets แล้วใช้ Sheet1 ได้เลย");
  const downloadSample = () => download(csvWithSample, "rds-google-sheets-template-sample.csv", `เทมเพลต + ตัวอย่าง ${SAMPLE_ROWS.length} แถว สำหรับทดสอบก่อนซิงก์จริง`);

  function buildXlsx(includeSample: boolean, filename: string, msg: string) {
    const aoa: string[][] = includeSample ? [HEADERS, ...SAMPLE_ROWS] : [HEADERS];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Auto-ish column widths based on max length
    ws["!cols"] = HEADERS.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...aoa.slice(1).map((r) => (r[i] ?? "").toString().length),
      );
      return { wch: Math.min(28, Math.max(10, maxLen + 2)) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tabName || "Sheet1");
    XLSX.writeFile(wb, filename);
    toast({ title: "ดาวน์โหลด .xlsx สำเร็จ", description: `${msg} (แท็บ: ${tabName})` });
  }
  const downloadXlsxEmpty = () =>
    buildXlsx(false, "rds-google-sheets-template.xlsx", "เปิดด้วย Excel / Google Sheets แล้วใช้แท็บ Sheet1 ได้เลย");
  const downloadXlsxSample = () =>
    buildXlsx(true, "rds-google-sheets-template-sample.xlsx", `รวมตัวอย่าง ${SAMPLE_ROWS.length} แถวสำหรับทดสอบก่อนซิงก์จริง`);

  async function copyHeaders() {
    try {
      await navigator.clipboard.writeText(tsv);
      toast({ title: "คัดลอกหัวตารางแล้ว", description: "วาง (Ctrl+V) ที่เซลล์ A1 ใน Google Sheets" });
    } catch {
      toast({ title: "คัดลอกไม่สำเร็จ", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(`${storeBasePath(storeSlug)}/documents`)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> กลับ
        </Button>
        <h1 className="text-xl font-semibold">เทมเพลต Google Sheets มาตรฐาน 17 คอลัมน์</h1>
      </div>

      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          ดาวน์โหลดหรือคัดลอกหัวตารางนี้ แล้ววางที่แถวที่ 1 (A1) ของ <b>Sheet1</b> ใน Google Sheets ของร้าน
          ก่อนกดซิงก์ทุกครั้ง เพื่อให้คอลัมน์ตรงกันและไม่เกิดข้อผิดพลาด <i>header mismatch</i>
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <Label htmlFor="xlsx-tab-name" className="text-xs">ชื่อแท็บใน .xlsx</Label>
            <Input
              id="xlsx-tab-name"
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              onBlur={(e) => saveTabName(e.target.value)}
              maxLength={31}
              placeholder="Sheet1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              บันทึกอัตโนมัติต่อร้าน · ระบบซิงก์ยังคงอ่านจากแท็บชื่อ <code>Sheet1</code> เท่านั้น —
              หากตั้งชื่ออื่น ให้เปลี่ยนกลับเป็น Sheet1 ก่อนซิงก์
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => saveTabName("Sheet1")}>
            รีเซ็ตเป็น Sheet1
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadXlsxSample}>
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลด .xlsx (เทมเพลต + ตัวอย่าง {SAMPLE_ROWS.length} แถว)
          </Button>
          <Button onClick={downloadXlsxEmpty} variant="secondary">
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลด .xlsx (หัวเปล่า)
          </Button>
          <Button onClick={downloadCsv}>
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลดเทมเพลตเปล่า (CSV)
          </Button>
          <Button onClick={downloadSample} variant="secondary">
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลดเทมเพลต + ตัวอย่าง ({SAMPLE_ROWS.length} แถว)
          </Button>
          <Button variant="outline" onClick={copyHeaders}>
            <Copy className="w-4 h-4 mr-1" /> คัดลอกหัวตาราง (TSV)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          แนะนำให้ใช้ไฟล์ <b>.xlsx</b> เพื่อรองรับภาษาไทยและตั้งชื่อแท็บเป็น <code>Sheet1</code> ให้อัตโนมัติ —
          อัปโหลดเข้า Google Sheets แล้วเปิดใช้ได้ทันที จากนั้นล้างแถวตัวอย่างก่อนซิงก์จริง
        </p>
        <p className="text-xs text-muted-foreground">
          เมื่อตั้งค่า Google Sheets ของร้านเรียบร้อย ระบบจะ <b>ซิงก์อัตโนมัติ</b> ทุกครั้งหลังบันทึกเอกสาร — ไม่ต้องกดซิงก์เอง
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">คอลัมน์ทั้งหมด ({HEADERS.length})</h2>
        <div className="overflow-x-auto border rounded">
          <table className="text-sm w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-2 py-1 text-left w-12">#</th>
                <th className="px-2 py-1 text-left w-20">คอลัมน์</th>
                <th className="px-2 py-1 text-left">ชื่อหัวตาราง</th>
              </tr>
            </thead>
            <tbody>
              {HEADERS.map((h, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">{i + 1}</td>
                  <td className="px-2 py-1 font-mono">{String.fromCharCode(65 + i)}</td>
                  <td className="px-2 py-1">{h}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-2 text-sm">
        <h2 className="font-medium">วิธีใช้</h2>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>เปิด Google Sheets ที่ตั้งค่าให้ร้าน (Settings → Google Sheets URL)</li>
          <li>ดาวน์โหลด CSV แล้ว File → Import → Replace spreadsheet เลือกไฟล์นี้ <i>หรือ</i> กด "คัดลอกหัวตาราง" แล้ววางที่ A1</li>
          <li>ตรวจสอบให้ชื่อแท็บเป็น <code>Sheet1</code></li>
          <li>กลับไปกด "ซิงก์ Google Drive/Sheets" จากหน้ารายการเอกสารได้เลย</li>
        </ol>
      </Card>
    </div>
  );
}