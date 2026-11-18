import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ImageOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adjustStock, makeIdempotencyKey, previewAfter, type StockAdjustMode,
} from "@/lib/stockAdjust";

export interface QuickAdjustProduct {
  id: string;
  name: string;
  code?: string | null;
  unit?: string | null;
  image_url?: string | null;
  stock: number;
  has_variants?: boolean;
  is_linked_wrapper?: boolean;
  base_id?: string | null;
  base_name?: string | null;
}

interface Variant {
  id: string;
  sku: string | null;
  name: string | null;
  stock: number;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
  product: QuickAdjustProduct | null;
  onDone?: () => void;
  onOpenBase?: (baseId: string) => void;
}

const REASONS: Array<{ v: string; label: string }> = [
  { v: "recount", label: "ตรวจนับ" },
  { v: "damaged", label: "สินค้าเสียหาย" },
  { v: "receive_in", label: "รับเข้า" },
  { v: "issue_use", label: "เบิกใช้" },
  { v: "other", label: "อื่น ๆ" },
];

export default function QuickAdjustStockDialog({ open, onOpenChange, product, onDone, onOpenBase }: Props) {
  const [mode, setMode] = useState<StockAdjustMode>("add");
  const [qty, setQty] = useState<number>(1);
  const [reason, setReason] = useState("recount");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const idemRef = useRef<string>("");

  useEffect(() => {
    if (!open || !product) return;
    setMode("add"); setQty(1); setReason("recount"); setReference(""); setNote("");
    setVariantId(""); setVariants([]);
    idemRef.current = makeIdempotencyKey();
    if (product.has_variants) {
      supabase.from("product_variants")
        .select("id, sku, name, stock, active")
        .eq("product_id", product.id).eq("active", true).order("sku")
        .then(({ data }) => setVariants((data ?? []) as Variant[]));
    }
  }, [open, product]);

  const currentBefore = useMemo(() => {
    if (!product) return 0;
    if (product.has_variants) {
      const v = variants.find((x) => x.id === variantId);
      return Number(v?.stock ?? 0);
    }
    return Number(product.stock);
  }, [product, variants, variantId]);

  const after = useMemo(() => previewAfter(currentBefore, mode, Number(qty) || 0), [currentBefore, mode, qty]);

  if (!product) return null;

  const isWrapper = !!product.is_linked_wrapper;

  async function submit() {
    if (!product) return;
    if (isWrapper) return;
    if (product.has_variants && !variantId) { toast.error("กรุณาเลือก SKU"); return; }
    if (qty <= 0) { toast.error("จำนวนต้องมากกว่า 0"); return; }
    if (after < 0) { toast.error("สต๊อกไม่พอ (ไม่สามารถติดลบได้)"); return; }
    setBusy(true);
    try {
      await adjustStock({
        productId: product.id,
        variantId: product.has_variants ? variantId : null,
        mode, qty: Number(qty), reason, reference: reference || null, note: note || null,
        idempotencyKey: idemRef.current,
      });
      toast.success("ปรับสต๊อกสำเร็จ");
      setConfirmOpen(false);
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      const msg = e?.message || "ผิดพลาด";
      if (String(msg).includes("wrapper_stock_locked")) toast.error("สินค้านี้ผูกกับหน่วยเล็ก — ต้องปรับที่หน่วยเล็ก");
      else if (String(msg).includes("forbidden")) toast.error("ไม่มีสิทธิ์ปรับสต๊อก");
      else toast.error(`ปรับสต๊อกไม่สำเร็จ: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="pos-quick-adjust">
          <DialogHeader>
            <DialogTitle>ปรับสต๊อกด่วน</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded bg-muted grid place-items-center overflow-hidden shrink-0">
              {product.image_url
                ? <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                : <ImageOff className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{product.name}</div>
              <div className="text-xs text-muted-foreground">
                {product.code || "—"} · หน่วย {product.unit || "-"} · คงเหลือ {currentBefore}
              </div>
            </div>
          </div>

          {isWrapper ? (
            <div className="rounded border border-primary/30 bg-accent dark:bg-violet-950/30 p-3 text-sm text-violet-900 dark:text-violet-100 space-y-2">
              <div>สินค้านี้เป็น <b>สินค้าสัมพันธ์</b> — สต๊อกคำนวณจากหน่วยเล็ก <b>{product.base_name}</b></div>
              <div>ต้องปรับสต๊อกที่สินค้าหน่วยเล็กแทน</div>
              {product.base_id && onOpenBase && (
                <Button size="sm" onClick={() => { onOpenBase(product.base_id!); onOpenChange(false); }}>
                  ไปที่สินค้าหน่วยเล็ก <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          ) : (
            <>
              {product.has_variants && (
                <div>
                  <Label className="text-xs">เลือก SKU *</Label>
                  <Select value={variantId} onValueChange={setVariantId}>
                    <SelectTrigger data-testid="pos-adjust-variant">
                      <SelectValue placeholder="— เลือก SKU —" />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.sku || v.name || v.id.slice(0, 6)} · คงเหลือ {v.stock}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {(["add","reduce","set"] as StockAdjustMode[]).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={mode === m ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode(m)}
                    data-testid={`pos-adjust-mode-${m}`}
                  >
                    {m === "add" ? "เพิ่ม" : m === "reduce" ? "ลด" : "ตั้งยอด"}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">จำนวน *</Label>
                  <Input type="number" min={0} value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} data-testid="pos-adjust-qty" />
                </div>
                <div>
                  <Label className="text-xs">เหตุผล</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">อ้างอิง (เลขเอกสาร/ผู้อนุมัติ)</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">หมายเหตุ</Label>
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border p-3 bg-muted/40 text-sm flex items-center justify-between" data-testid="pos-adjust-preview">
                <span>ก่อน: <b>{currentBefore}</b></span>
                <ArrowRight className="h-4 w-4" />
                <span>หลัง: <b className={after < 0 ? "text-rose-600" : "text-emerald-700"}>{after}</b></span>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            {!isWrapper && (
              <Button
                disabled={busy || (product.has_variants && !variantId) || qty <= 0 || after < 0}
                onClick={() => setConfirmOpen(true)}
                data-testid="pos-adjust-confirm"
              >
                ปรับสต๊อก
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการปรับสต๊อก</AlertDialogTitle>
            <AlertDialogDescription>
              {product.name} — {mode === "add" ? "เพิ่ม" : mode === "reduce" ? "ลด" : "ตั้งยอดเป็น"} {qty}
              {" "}({currentBefore} → {after})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={submit}>ยืนยัน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
