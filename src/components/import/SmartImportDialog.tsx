import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { parseDelimited, parseFreeform, guessMapping, toNumber, type TargetField, type ImportedRow } from "@/lib/smartImportParser";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, ClipboardPaste, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface SmartImportRow {
  product_name: string;
  product_code?: string;
  qty: number;
  price: number;
  note?: string;
}

interface SmartImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rows: SmartImportRow[]) => void | Promise<void>;
  title?: string;
  description?: string;
}

const FIELD_LABELS: Record<TargetField | "", string> = {
  "": "— ไม่นำเข้า —",
  product_name: "ชื่อสินค้า",
  product_code: "รหัสสินค้า",
  qty: "จำนวน",
  price: "ราคา",
  note: "หมายเหตุ",
};

/**
 * Reusable Smart Import dialog.
 *
 * Step 1  paste text or upload .csv / .tsv / .xlsx
 * Step 2  preview + edit + column mapping
 * Step 3  confirm  → returns validated SmartImportRow[]
 */
export function SmartImportDialog({ open, onOpenChange, onConfirm, title, description }: SmartImportDialogProps) {
  const [text, setText] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetField | "">>({});
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setText(""); setColumns([]); setRows([]); setMapping({});
  };

  const applyParse = (cols: string[], rs: ImportedRow[]) => {
    setColumns(cols);
    setRows(rs);
    const m: Record<string, TargetField | ""> = {};
    for (const c of cols) m[c] = guessMapping(c);
    setMapping(m);
  };

  const parseText = () => {
    if (!text.trim()) { toast.error("กรุณาวางข้อมูลก่อน"); return; }
    const delim = parseDelimited(text);
    if (delim.rows.length > 0 && delim.columns.length > 1) {
      applyParse(delim.columns, delim.rows);
    } else {
      const free = parseFreeform(text);
      applyParse(free.columns, free.rows);
    }
  };

  const onFile = async (f: File) => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any;
      if (!aoa.length) { toast.error("ไฟล์ว่าง"); return; }
      const header = aoa[0].map((c, i) => String(c || `col_${i + 1}`));
      const body = aoa.slice(1).map((line) => {
        const r: ImportedRow = {};
        header.forEach((h, i) => { r[h] = String(line[i] ?? ""); });
        return r;
      });
      applyParse(header, body);
    } else {
      const txt = await f.text();
      setText(txt);
      const delim = parseDelimited(txt);
      applyParse(delim.columns, delim.rows);
    }
  };

  const validated = useMemo<{ ok: SmartImportRow[]; bad: number }>(() => {
    const nameCol = Object.entries(mapping).find(([, v]) => v === "product_name")?.[0];
    const codeCol = Object.entries(mapping).find(([, v]) => v === "product_code")?.[0];
    const qtyCol = Object.entries(mapping).find(([, v]) => v === "qty")?.[0];
    const priceCol = Object.entries(mapping).find(([, v]) => v === "price")?.[0];
    const noteCol = Object.entries(mapping).find(([, v]) => v === "note")?.[0];
    const ok: SmartImportRow[] = [];
    let bad = 0;
    for (const r of rows) {
      const name = (nameCol ? r[nameCol] : "").trim();
      const code = codeCol ? r[codeCol]?.trim() : undefined;
      if (!name && !code) { bad++; continue; }
      const qty = toNumber(qtyCol ? r[qtyCol] : "1") || 1;
      const price = toNumber(priceCol ? r[priceCol] : "0");
      ok.push({ product_name: name || code || "", product_code: code, qty, price, note: noteCol ? r[noteCol] : undefined });
    }
    return { ok, bad };
  }, [rows, mapping]);

  const confirm = async () => {
    if (validated.ok.length === 0) { toast.error("ยังไม่มีรายการที่นำเข้าได้"); return; }
    setBusy(true);
    try {
      await onConfirm(validated.ok);
      toast.success(`นำเข้า ${validated.ok.length} รายการสำเร็จ${validated.bad ? ` (ข้าม ${validated.bad})` : ""}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> {title || "นำเข้ารายการ (Smart Import)"}</DialogTitle>
          <DialogDescription>{description || "วางข้อความจาก LINE / Excel หรืออัปโหลดไฟล์ ตรวจสอบก่อนยืนยัน"}</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"ตัวอย่าง:\nชื่อสินค้า\tจำนวน\tราคา\nเสื้อยืด M\t2\t250\nกางเกง\t1\t890\n\nหรือแบบอิสระ:\nเสื้อ M x 2 = 250"}
              className="min-h-[180px] font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={parseText} className="gap-1"><ClipboardPaste className="w-4 h-4" /> วิเคราะห์ข้อความ</Button>
              <label className="inline-flex">
                <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
                <span className="inline-flex items-center gap-1 rounded-md border border-input bg-background hover:bg-accent px-3 h-9 text-sm cursor-pointer"><Upload className="w-4 h-4" /> เลือกไฟล์ CSV / Excel</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> {validated.ok.length} รายการพร้อมนำเข้า</Badge>
              {validated.bad > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> ข้าม {validated.bad}</Badge>}
              <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={reset}><Trash2 className="w-4 h-4" /> เริ่มใหม่</Button>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="p-2 text-left align-top border-b">
                        <div className="font-mono text-[11px] text-muted-foreground truncate mb-1">{c}</div>
                        <select
                          value={mapping[c] ?? ""}
                          onChange={(e) => setMapping({ ...mapping, [c]: e.target.value as TargetField | "" })}
                          className="w-full h-7 rounded border bg-background text-xs px-1"
                        >
                          {Object.entries(FIELD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, ri) => (
                    <tr key={ri} className="border-b last:border-0 hover:bg-muted/20">
                      {columns.map((c) => (
                        <td key={c} className="p-1">
                          <Input
                            value={r[c] ?? ""}
                            onChange={(e) => { const nr = [...rows]; nr[ri] = { ...r, [c]: e.target.value }; setRows(nr); }}
                            className="h-7 text-xs"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && <div className="text-xs text-muted-foreground p-2">แสดง 200 แถวแรกจาก {rows.length}</div>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>ยกเลิก</Button>
          <Button onClick={confirm} disabled={busy || validated.ok.length === 0}>
            ยืนยันนำเข้า {validated.ok.length > 0 ? `(${validated.ok.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}