import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import ProductInput from "./ProductInput";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import type { DocItem } from "./useDocumentForm";
import { saveDraft, loadDraft, clearDraft, draftHasContent } from "../lib/drafts";
import { toast } from "@/hooks/use-toast";
import { smartParseText, smartParseMatrix, applyMapping, type ParseMeta, type ParseError, type ParseResult } from "./smartParse";
import { loadImportHistory, pushImportHistory, type ImportHistoryEntry } from "./importHistory";
import { tbl } from "../lib/tbl";

function parseSheet(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
        resolve(smartParseMatrix(matrix));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

export default function SmartImportDialog({
  open,
  onOpenChange,
  onImport,
  storeId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (rows: Partial<DocItem>[]) => void;
  storeId?: string | null;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Partial<DocItem>[]>([]);
  const [meta, setMeta] = useState<ParseMeta | null>(null);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(false);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [lastSource, setLastSource] = useState<{ source: "paste" | "file"; fileName?: string } | null>(null);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [matched, setMatched] = useState<Record<number, string | null>>({});
  const [products, setProducts] = useState<
    { id: string; name: string; sku: string | null; price: number; unit: string | null }[]
  >([]);
  const initRef = useRef(false);
  const skipDirtyRef = useRef(true);

  useEffect(() => {
    if (!open || !storeId) return;
    supabase
      .from(tbl("products") as any)
      .select("id,name,sku,price,unit")
      .eq("store_id", storeId)
      .limit(2000)
      .then(({ data }) => setProducts(((data as any[]) ?? []) as any));
    setHistory(loadImportHistory(storeId));
  }, [open, storeId]);

  // Restore import draft when dialog opens
  useEffect(() => {
    if (!open || !storeId) return;
    initRef.current = false;
    skipDirtyRef.current = true;
    (async () => {
      try {
        const payload = await loadDraft(storeId, "import");
        if (payload && draftHasContent("import", payload)) {
          if (typeof payload.text === "string") setText(payload.text);
          if (Array.isArray(payload.preview)) setPreview(payload.preview);
          if (payload.matched) setMatched(payload.matched);
          toast({ title: "กู้คืนข้อมูลนำเข้าที่ค้างไว้" });
        }
      } catch { /* noop */ }
      setTimeout(() => { skipDirtyRef.current = false; initRef.current = true; }, 0);
    })();
  }, [open, storeId]);

  // Autosave import draft
  useEffect(() => {
    if (!open || !storeId || !initRef.current || skipDirtyRef.current) return;
    if (!text && preview.length === 0) return;
    const h = window.setTimeout(async () => {
      const result = await saveDraft(storeId, "import", { text, preview, matched });
      if (!result.synced && result.local) {
        toast({ title: "เก็บข้อมูลนำเข้าไว้ในเครื่องแล้ว", description: "ยังซิงก์ขึ้นระบบไม่ได้ แต่ข้อมูลยังไม่หาย" });
      }
    }, 800);
    return () => window.clearTimeout(h);
  }, [text, preview, matched, open, storeId]);

  function autoMatch(rows: Partial<DocItem>[]) {
    const m: Record<number, string | null> = {};
    rows.forEach((r, i) => {
      const n = (r.name ?? "").toLowerCase().trim();
      if (!n) { m[i] = null; return; }
      const hit =
        products.find((p) => p.name.toLowerCase() === n || (p.sku && p.sku.toLowerCase() === n)) ??
        products.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()));
      m[i] = hit?.id ?? null;
    });
    setMatched(m);
  }

  function showResult(r: ParseResult, source: { source: "paste" | "file"; fileName?: string }) {
    setPreview(r.rows as Partial<DocItem>[]);
    setMeta(r.meta);
    setMatrix(r.matrix);
    setHasHeader(r.hasHeader);
    setErrors(r.errors);
    setLastSource(source);
    autoMatch(r.rows as Partial<DocItem>[]);
  }

  function changeMapping(role: keyof ParseMeta["mapping"], newIdx: number) {
    if (!meta) return;
    const cur = meta.mapping;
    // -1 → unset (only for optional roles like amount)
    if (newIdx < 0) {
      const next = { ...cur };
      if (role === "amount") delete (next as any).amount;
      const re = applyMapping(matrix, next, hasHeader);
      setMeta({ ...meta, mapping: next, rowCount: re.rows.length });
      setPreview(re.rows as Partial<DocItem>[]);
      setErrors(re.errors);
      autoMatch(re.rows as Partial<DocItem>[]);
      return;
    }
    const old = cur[role];
    const swapRole = (Object.keys(cur) as (keyof ParseMeta["mapping"])[]).find(
      (k) => k !== role && cur[k] === newIdx,
    );
    const next: ParseMeta["mapping"] = { ...cur, [role]: newIdx };
    if (swapRole && typeof old === "number" && old >= 0) {
      (next as any)[swapRole] = old; // swap to keep mapping unique
    }
    const re = applyMapping(matrix, next, hasHeader);
    setMeta({ ...meta, mapping: next, rowCount: re.rows.length });
    setPreview(re.rows as Partial<DocItem>[]);
    setErrors(re.errors);
    autoMatch(re.rows as Partial<DocItem>[]);
  }

  function commit() {
    const out = preview.map((r, i) => {
      const pid = matched[i];
      const p = pid ? products.find((x) => x.id === pid) : null;
      const fallbackUnit = "ชิ้น";
      if (!p) return { ...r, product_id: null, unit: (r.unit && String(r.unit).trim()) || fallbackUnit };
      return {
        ...r,
        product_id: p.id,
        name: p.name,
        unit: (r.unit && String(r.unit).trim()) || p.unit || fallbackUnit,
        price: r.price ?? p.price,
      };
    });
    onImport(out);
    // record history before reset
    if (storeId && lastSource) {
      const entry: ImportHistoryEntry = {
        id: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        at: Date.now(),
        source: lastSource.source,
        fileName: lastSource.fileName,
        delimiter: meta?.delimiter,
        hadHeader: meta?.hasHeader,
        rowCount: out.length,
        errorCount: errors.length,
        sample: out.slice(0, 5).map((r) => String(r.name ?? "")),
        items: out.map((r) => ({
          name: String(r.name ?? ""),
          price: Number(r.price ?? 0),
          quantity: Number(r.quantity ?? 1),
          unit: String(r.unit ?? ""),
        })),
      };
      pushImportHistory(storeId, entry);
      setHistory(loadImportHistory(storeId));
    }
    setText(""); setPreview([]); setMatched({}); setMeta(null);
    setMatrix([]); setErrors([]); setLastSource(null); setHasHeader(false);
    if (storeId) clearDraft(storeId, "import").catch(() => {});
    onOpenChange(false);
  }

  function reimportFromHistory(entry: ImportHistoryEntry) {
    onImport(entry.items as Partial<DocItem>[]);
    onOpenChange(false);
    toast({ title: `นำเข้าซ้ำ ${entry.items.length} รายการ` });
  }

  const colCount = matrix.length ? Math.max(...matrix.map((r) => r.length)) : 0;
  const colOptions = useMemo(() => Array.from({ length: colCount }, (_, i) => i), [colCount]);
  const sampleHeader = hasHeader ? matrix[0] ?? [] : [];

  // Reverse lookup: which document role (if any) is currently assigned to
  // each source column. Lets us show the dropdown options with the real
  // field names ("รายการ", "จำนวน", …) instead of generic "คอลัมน์ 1/2/3"
  // which made it easy to swap data into the wrong column.
  const ROLE_LABEL: Record<string, string> = {
    name: "รายการ",
    quantity: "จำนวน",
    unit: "หน่วย",
    price: "ราคาต่อหน่วย",
    amount: "จำนวนเงิน",
  };
  const colRoleLabel = useMemo(() => {
    const out: (string | null)[] = Array.from({ length: colCount }, () => null);
    if (!meta) return out;
    (Object.keys(meta.mapping) as (keyof ParseMeta["mapping"])[]).forEach((role) => {
      const idx = meta.mapping[role];
      if (typeof idx === "number" && idx >= 0 && idx < colCount) {
        out[idx] = ROLE_LABEL[role] ?? null;
      }
    });
    return out;
  }, [meta, colCount]);

  const columnLabel = (i: number) => {
    const role = colRoleLabel[i];
    const header = sampleHeader[i];
    if (role && header) return `${role} — ${header}`;
    if (role) return role;
    if (header) return String(header);
    return `ไม่ได้ใช้ (#${i + 1})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Smart Import — นำเข้ารายการ</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="paste">
          <TabsList>
            <TabsTrigger value="paste">วาง (Paste)</TabsTrigger>
            <TabsTrigger value="file">อัปโหลด .xlsx / .csv</TabsTrigger>
            <TabsTrigger value="history"><Clock className="h-3.5 w-3.5 mr-1" />ประวัติ ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="paste" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              วางได้ทุกรูปแบบ — Excel, Google Sheets, Numbers, Word, PDF, แชต ระบบจะจับคอลัมน์ <b>ชื่อ · ราคา · จำนวน · หน่วย</b> ให้อัตโนมัติ ไม่ว่าจะคั่นด้วย TAB, จุลภาค, ;, |, หรือเว้นวรรค
            </p>
            <Textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`ถ่ายเอกสาร\t2\tแผ่น\t100\t200\nปริ้นสี A4\t10\tแผ่น\t15\t150`}
              className="font-mono text-sm"
            />
            <Button
              variant="secondary"
              onClick={() => {
                const r = smartParseText(text);
                showResult(r, { source: "paste" });
              }}
            >
              Preview
            </Button>
            {meta && meta.rowCount > 0 && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">ตัวคั่น: {meta.delimiter}</Badge>
                <Badge variant="outline">หัวตาราง: {meta.hasHeader ? "มี" : "เดา"}</Badge>
                <Badge variant="outline">พบ {meta.rowCount} รายการ</Badge>
                {errors.length > 0 && <Badge variant="destructive">ข้ามไม่ได้ {errors.length} แถว</Badge>}
              </div>
            )}
          </TabsContent>
          <TabsContent value="file" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              อัปโหลด .xlsx/.csv — ระบบจะจับคอลัมน์ให้อัตโนมัติแม้ไม่มีหัวตาราง
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const r = await parseSheet(f);
                  showResult(r, { source: "file", fileName: f.name });
                } catch { /* noop */ }
              }}
            />
          </TabsContent>
          <TabsContent value="history" className="space-y-2 pt-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการนำเข้าในเครื่องนี้</p>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded border border-border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{h.source === "file" ? `ไฟล์: ${h.fileName ?? "—"}` : "วาง"}</Badge>
                        <span className="text-muted-foreground">{new Date(h.at).toLocaleString("th-TH")}</span>
                        <Badge variant="secondary">{h.rowCount} รายการ</Badge>
                        {h.errorCount > 0 && <Badge variant="destructive">ข้าม {h.errorCount}</Badge>}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => reimportFromHistory(h)}>นำเข้าซ้ำ</Button>
                    </div>
                    {h.sample.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {h.sample.join(" · ")}{h.rowCount > h.sample.length ? " …" : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {meta && colCount > 0 && (
          <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
            <div className="text-xs font-medium">ปรับการแมปคอลัมน์ (ถ้าระบบเดาผิด)</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(["name","quantity","unit","price","amount"] as const).map((role) => (
                <div key={role} className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">
                    {role === "name" ? "รายการ" : role === "quantity" ? "จำนวน" : role === "unit" ? "หน่วย" : role === "price" ? "ราคาต่อหน่วย" : "จำนวนเงิน (ไม่บังคับ)"}
                  </div>
                  <Select
                    value={String(meta.mapping[role] ?? -1)}
                    onValueChange={(v) => changeMapping(role, Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {role === "amount" && (
                        <SelectItem value="-1" className="text-xs">— ไม่ใช้ —</SelectItem>
                      )}
                      {colOptions.map((i) => (
                        <SelectItem key={i} value={String(i)} className="text-xs">
                          {columnLabel(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              อ่านไม่ได้ {errors.length} แถว
            </div>
            <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
              {errors.slice(0, 10).map((e, i) => (
                <li key={i} className="font-mono">
                  <span className="text-muted-foreground">บรรทัด {e.line}:</span>{" "}
                  <span>{e.raw}</span>{" "}
                  <span className="text-destructive">— {e.reason}</span>
                </li>
              ))}
              {errors.length > 10 && <li className="text-muted-foreground">…และอีก {errors.length - 10} แถว</li>}
            </ul>
            <div className="text-[11px] text-muted-foreground">
              ตัวอย่างที่อ่านได้: <code>ชื่อ [tab] ราคา [tab] จำนวน [tab] หน่วย</code> · <code>ชื่อ,ราคา,จำนวน,หน่วย</code> · <code>กระดาษ A4 ฿120 x5 รีม</code>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden max-h-[40vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">รายการ/รายละเอียดพัสดุ</th>
                  <th className="p-2 w-20 text-right">จำนวน</th>
                  <th className="p-2 w-20">หน่วย</th>
                  <th className="p-2 w-24 text-right">ราคาต่อหน่วย</th>
                  <th className="p-2 w-24 text-right">จำนวนเงิน</th>
                  <th className="p-2 w-20 text-center">จับคู่</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-1">
                      <ProductInput
                        storeId={storeId ?? undefined}
                        value={r.name ?? ""}
                        onChange={(v) => setPreview((p) => p.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                        onPick={(pk) => {
                          setPreview((p) => p.map((x, j) => (j === i ? { ...x, name: pk.name, price: Number(pk.price) || x.price || 0, unit: x.unit || (pk.unit ?? "") } : x)));
                          setMatched((m) => ({ ...m, [i]: pk.id }));
                        }}
                      />
                    </td>
                    <td className="p-1">
                      <Input type="number" value={r.quantity ?? 1} onChange={(e) => setPreview((p) => p.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} className="text-right" />
                    </td>
                    <td className="p-1">
                      <Input value={r.unit ?? ""} onChange={(e) => setPreview((p) => p.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                    </td>
                    <td className="p-1">
                      <Input type="number" value={r.price ?? 0} onChange={(e) => setPreview((p) => p.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} className="text-right" />
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {((Number(r.price) || 0) * (Number(r.quantity) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-1 text-center">
                      {matched[i] ? <Badge className="text-[10px]">เจอ</Badge> : <Badge variant="outline" className="text-[10px]">ใหม่</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={!preview.length} onClick={commit}>นำเข้า {preview.length} รายการ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}