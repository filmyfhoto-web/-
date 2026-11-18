import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Paperclip, Sparkles, X, AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { normalizeResult, type BossResult } from "@/lib/bossDocument";
import type { RdsStore } from "../types";
import type { DocFormState } from "./useDocumentForm";
import {
  AI_SUPPORTED_HINT,
  isAiReadableFile,
  mapAiResultToForm,
  unsupportedFileMessage,
  type AiDocMapping,
} from "./aiDocAssist";

const EXAMPLES = [
  "โรงเรียนบ้านใหม่ กระดาษ A4 20 รีม รีมละ 120 บาท ส่งที่ ต.ในเวียง อ.เมือง จ.น่าน โทร 054-000000",
  "ออกใบเสนอราคาให้เทศบาลตำบลเชียงกลาง ปากกา 10 ด้าม ด้ามละ 5 บาท สมุด 20 เล่ม เล่มละ 25 บาท",
];

export default function AiDocAssistantDialog({
  open,
  onOpenChange,
  store,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  store: RdsStore | null;
  current: Pick<DocFormState, "paper_size" | "template" | "document_date">;
  onApply: (mapping: AiDocMapping, meta: { fileNames: string[]; prompt: string }) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState<AiDocMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const fileNames = useMemo(() => files.map((f) => f.name), [files]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    Array.from(list).forEach((f) => {
      if (!isAiReadableFile(f)) {
        toast({ title: "ไฟล์ไม่รองรับ", description: unsupportedFileMessage(f), variant: "destructive" });
        return;
      }
      accepted.push(f);
    });
    if (accepted.length) setFiles((cur) => [...cur, ...accepted]);
  }

  function reset() {
    setPrompt("");
    setFiles([]);
    setMapping(null);
    setError(null);
  }

  async function run() {
    if (!prompt.trim() && files.length === 0) {
      setError("พิมพ์คำสั่ง หรือแนบไฟล์อย่างน้อย 1 ไฟล์");
      return;
    }
    setBusy(true);
    setError(null);
    setMapping(null);
    try {
      const fd = new FormData();
      fd.append("prompt", prompt.trim());
      // กฎเหล็ก: ขอเป็นใบเสนอราคาเสมอ (และบังคับซ้ำอีกชั้นตอน map)
      fd.append("documentType", "quotation");
      fd.append("shop", store?.slug ?? "");
      fd.append("vatMode", store?.vat_enabled ? "exclusive" : "none");
      fd.append("vatRate", String(store?.vat_enabled ? Number(store?.default_vat_rate ?? 7) : 0));
      files.forEach((f) => fd.append("files", f, f.name));

      const { data, error: fnError } = await supabase.functions.invoke("boss-doc-ai", { body: fd });
      if (fnError) throw new Error(fnError.message);
      const result = (data as { result?: BossResult })?.result;
      if (!result) throw new Error((data as { message?: string })?.message ?? "AI ตอบกลับไม่สมบูรณ์");

      const normalized = normalizeResult({
        ...result,
        items: Array.isArray(result.items) ? result.items : [],
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      } as BossResult);
      setMapping(mapAiResultToForm(normalized, store, current));
    } catch (e) {
      setError((e as Error)?.message ?? "อ่านข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI ผู้ช่วยออกเอกสาร
          </DialogTitle>
          <DialogDescription>
            พิมพ์บอก AI หรือแนบไฟล์ให้ AI อ่าน แล้วนำข้อมูลลง “ใบเสนอราคา (ฉบับร่าง)” ของร้าน
            {store ? ` ${store.name}` : ""} — ทุกงานต้องเริ่มจากใบเสนอราคาก่อนเสมอ
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">พิมพ์บอก AI</div>
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="เช่น ออกใบเสนอราคาให้โรงเรียนบ้านใหม่ กระดาษ A4 20 รีม รีมละ 120 บาท"
            />
            <div className="space-y-1 text-xs text-muted-foreground">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="block w-full text-left hover:text-foreground"
                  onClick={() => setPrompt(ex)}
                >
                  • {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="mr-1.5 h-4 w-4" /> แนบไฟล์ให้ AI อ่าน
              </Button>
              <span className="text-xs text-muted-foreground">รองรับ {AI_SUPPORTED_HINT} (แนบได้หลายไฟล์)</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,application/pdf,.pdf,.docx,.xlsx,.xls,.csv,.txt"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1">
                    {f.name}
                    <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>อ่านข้อมูลไม่สำเร็จ</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mapping && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-semibold">AI พบข้อมูลดังนี้</div>

              {mapping.notices.length > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>ข้อกำหนดของระบบ</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {mapping.notices.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-1 text-sm sm:grid-cols-2">
                <div>ลูกค้า/หน่วยงาน: {mapping.patch.customer_name || "— ยังไม่พบข้อมูล"}</div>
                <div>เบอร์โทร: {mapping.patch.customer_phone || "— ยังไม่พบข้อมูล"}</div>
                <div className="sm:col-span-2">ที่อยู่: {mapping.patch.customer_address || "— ยังไม่พบข้อมูล"}</div>
                <div>เลขผู้เสียภาษี: {mapping.patch.customer_tax_id || "— ยังไม่พบข้อมูล"}</div>
                <div>ชื่อโครงการ: {mapping.patch.project_name || "— ยังไม่พบข้อมูล"}</div>
                <div>
                  ภาษี: {mapping.patch.vat_mode === "none" ? "ไม่คิด VAT" : `VAT ${mapping.patch.vat_rate}%`} (ตามค่าของร้าน)
                </div>
                <div>ประเภทเอกสาร: ใบเสนอราคา (ฉบับร่าง)</div>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">รายการสินค้า ({mapping.items.length})</div>
                {mapping.items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">— ยังไม่พบรายการในข้อความ/ไฟล์</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left font-normal">รายการ</th>
                          <th className="text-right font-normal">จำนวน</th>
                          <th className="text-left font-normal">หน่วย</th>
                          <th className="text-right font-normal">ราคา/หน่วย</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapping.items.map((it, i) => (
                          <tr key={i} className="border-t">
                            <td>{it.name}</td>
                            <td className="text-right">{it.quantity}</td>
                            <td>{it.unit || "-"}</td>
                            <td className="text-right">{Number(it.price ?? 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {mapping.patch.notes && <div className="text-sm">หมายเหตุ: {mapping.patch.notes}</div>}

              {(mapping.missing.length > 0 || mapping.needsReviewCount > 0) && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>ต้องตรวจสอบก่อนบันทึก</AlertTitle>
                  <AlertDescription>
                    {mapping.needsReviewCount > 0 && <div>รายการที่ AI ไม่มั่นใจ: {mapping.needsReviewCount} รายการ</div>}
                    {mapping.missing.length > 0 && <div>ยังไม่พบข้อมูล: {mapping.missing.join(", ")}</div>}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            ปิด
          </Button>
          <Button variant="outline" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            {mapping ? "อ่านใหม่อีกครั้ง" : "ให้ AI อ่านข้อมูล"}
          </Button>
          <Button
            disabled={!mapping || busy}
            onClick={() => {
              if (!mapping) return;
              onApply(mapping, { fileNames, prompt: prompt.trim() });
              onOpenChange(false);
              reset();
            }}
          >
            นำลงใบเสนอราคา
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
