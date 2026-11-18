import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, ClipboardPaste, Sparkles } from "lucide-react";
import {
  parseDelimited, parseFreeform, guessMapping, toNumber,
  type ParsedImport, type TargetField,
} from "@/lib/smartImportParser";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (rows: Array<{ product_name: string; product_code?: string; qty: number; price: number; note?: string }>) => Promise<void> | void;
}

const TARGET_LABEL: Record<TargetField | "", string> = {
  "": "— ข้าม —",
  product_name: "ชื่อสินค้า",
  product_code: "รหัส",
  qty: "จำนวน",
  price: "ราคา/หน่วย",
  note: "หมายเหตุ",
};

const CSV_SAMPLE = `สินค้า,จำนวน,ราคา
เสื้อยืด M,2,250
กางเกงยีนส์,1,890`;

const TEXT_SAMPLE = `เสื้อยืด M x 2 = 250
กางเกงยีนส์ x 1 = 890
รหัส A01 ผ้าลาย 3 ชิ้น 120`;

export default function SmartImportDialog({ open, onOpenChange, onImport }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<"csv" | "text">("csv");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedImport>({ columns: [], rows: [] });
  const [mapping, setMapping] = useState<Record<string, TargetField | "">>({});
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep(1); setText(""); setParsed({ columns: [], rows: [] }); setMapping({}); setBusy(false);
  }

  function onFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(f, "utf-8");
  }

  function analyze() {
    if (!text.trim()) { toast.error("กรุณาวางข้อมูลก่อน"); return; }
    const p = mode === "csv" ? parseDelimited(text) : parseFreeform(text);
    if (!p.rows.length) { toast.error("ไม่พบข้อมูลที่นำเข้าได้"); return; }
    setParsed(p);
    const m: Record<string, TargetField | ""> = {};
    p.columns.forEach((c) => { m[c] = guessMapping(c); });
    setMapping(m);
    setStep(2);
  }

  const preview = useMemo(() => {
    return parsed.rows.slice(0, 10).map((r) => {
      const out: Record<TargetField, string> = { product_name: "", product_code: "", qty: "", price: "", note: "" };
      for (const col of parsed.columns) {
        const target = mapping[col];
        if (target) out[target as TargetField] = r[col] ?? "";
      }
      return out;
    });
  }, [parsed, mapping]);

  const totalRows = parsed.rows.length;
  const totalAmount = useMemo(() => {
    return parsed.rows.reduce((s, r) => {
      const q = toNumber(r[Object.keys(mapping).find((k) => mapping[k] === "qty") || ""] || "0");
      const p = toNumber(r[Object.keys(mapping).find((k) => mapping[k] === "price") || ""] || "0");
      return s + q * p;
    }, 0);
  }, [parsed, mapping]);

  async function doImport() {
    setBusy(true);
    try {
      const nameCol = Object.keys(mapping).find((k) => mapping[k] === "product_name");
      if (!nameCol) { toast.error("ต้องแมปคอลัมน์ 'ชื่อสินค้า' อย่างน้อยหนึ่งคอลัมน์"); setBusy(false); return; }
      const rows = parsed.rows.map((r) => {
        const getBy = (t: TargetField) => {
          const col = Object.keys(mapping).find((k) => mapping[k] === t);
          return col ? r[col] : "";
        };
        return {
          product_name: (getBy("product_name") || "").trim(),
          product_code: (getBy("product_code") || "").trim() || undefined,
          qty: toNumber(getBy("qty") || "1") || 1,
          price: toNumber(getBy("price") || "0"),
          note: (getBy("note") || "").trim() || undefined,
        };
      }).filter((r) => r.product_name);
      if (!rows.length) { toast.error("ไม่พบชื่อสินค้าที่ใช้ได้"); setBusy(false); return; }
      await onImport(rows);
      toast.success(`นำเข้า ${rows.length} รายการเรียบร้อย`);
      reset(); onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "นำเข้าไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Smart Import — นำเข้ารายการสินค้า
          </DialogTitle>
          <DialogDescription>
            ขั้นที่ {step} จาก 3 — {step === 1 ? "เลือกรูปแบบและวางข้อมูล" : step === 2 ? "แมปฟิลด์ต้นทางกับปลายทาง" : "ตรวจสอบและยืนยัน"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="csv"><FileText className="w-4 h-4 mr-1" /> CSV / ตาราง</TabsTrigger>
              <TabsTrigger value="text"><ClipboardPaste className="w-4 h-4 mr-1" /> ข้อความที่วาง</TabsTrigger>
            </TabsList>
            <TabsContent value="csv" className="space-y-2">
              <Input type="file" accept=".csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="rounded-xl" />
              <div className="text-xs text-muted-foreground">หรือวางข้อมูล CSV ด้านล่าง (รองรับตัวคั่น: `,` `\t` `;` `|`)</div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="rounded-xl font-mono text-xs" placeholder={CSV_SAMPLE} />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">ตัวอย่างไฟล์ CSV</summary>
                <pre className="mt-1 bg-muted rounded-lg p-2 whitespace-pre-wrap">{CSV_SAMPLE}</pre>
              </details>
            </TabsContent>
            <TabsContent value="text" className="space-y-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="rounded-xl font-mono text-xs" placeholder={TEXT_SAMPLE} />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">ตัวอย่างข้อความ</summary>
                <pre className="mt-1 bg-muted rounded-lg p-2 whitespace-pre-wrap">{TEXT_SAMPLE}</pre>
              </details>
            </TabsContent>
          </Tabs>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">แมปคอลัมน์ต้นทาง (ซ้าย) ให้ตรงกับฟิลด์ปลายทาง (ขวา) — ระบบเดาให้อัตโนมัติ</div>
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 bg-muted/50 text-xs font-medium p-2">
                <div>คอลัมน์ต้นทาง</div><div>ปลายทาง</div>
              </div>
              {parsed.columns.map((c) => (
                <div key={c} className="grid grid-cols-2 items-center p-2 border-t border-border text-sm">
                  <div className="font-mono text-xs">{c}</div>
                  <Select value={mapping[c] || ""} onValueChange={(v) => setMapping((m) => ({ ...m, [c]: v as TargetField }))}>
                    <SelectTrigger className="rounded-lg h-8"><SelectValue placeholder="เลือก..." /></SelectTrigger>
                    <SelectContent>
                      {(["", "product_name", "product_code", "qty", "price", "note"] as (TargetField | "")[]).map((t) => (
                        <SelectItem key={t || "skip"} value={t}>{TARGET_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">พรีวิว 10 แถวแรกจากทั้งหมด <b>{totalRows}</b> แถว · ยอดรวมประมาณ <b>฿{totalAmount.toLocaleString("th-TH")}</b></div>
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50"><tr>
                  <th className="text-left p-2">ชื่อ</th><th className="text-left p-2">รหัส</th>
                  <th className="text-right p-2">จำนวน</th><th className="text-right p-2">ราคา</th><th className="text-left p-2">หมายเหตุ</th>
                </tr></thead>
                <tbody>{preview.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{r.product_name}</td><td className="p-2">{r.product_code}</td>
                    <td className="p-2 text-right">{r.qty}</td><td className="p-2 text-right">{r.price}</td><td className="p-2">{r.note}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>ย้อนกลับ</Button>}
          {step === 1 && <Button onClick={analyze}><Upload className="w-4 h-4 mr-1" /> วิเคราะห์</Button>}
          {step === 2 && <Button onClick={() => setStep(3)}>ถัดไป — พรีวิว</Button>}
          {step === 3 && <Button onClick={doImport} disabled={busy} className="bg-gradient-primary text-primary-foreground">
            {busy ? "กำลังนำเข้า..." : `นำเข้า ${totalRows} รายการ`}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}