import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Send,
  Copy,
  Plus,
  Trash2,
  X,
  Lock,
  History,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { openLine } from "@/lib/line";
import {
  buildFullMessage,
  buildShortMessage,
  buildTsvMessage,
  clearDraft,
  computeTotals,
  draftHasContent,
  emptyItem,
  emptyState,
  fmtTHB,
  getSubmission,
  listSubmissionsByPhone,
  loadDraft,
  modeTitle,
  normPhone,
  phoneRegex,
  quickOrderSchema,
  saveDraft,
  saveSubmission,
  type QuickOrderMode,
  type QuickOrderState,
  type QuickOrderSubmission,
} from "@/lib/quickOrderStore";

export type { QuickOrderMode };

function shopKey(): string {
  if (typeof window === "undefined") return "default";
  return window.location.pathname || "default";
}

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export function QuickOrderDialog({
  lineUrl,
  onClose,
}: {
  lineUrl: string | null;
  onClose: () => void;
}) {
  const sKey = shopKey();
  const [state, setState] = useState<QuickOrderState>(() => emptyState());
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [readOnly, setReadOnly] = useState(false);
  const [viewedSubmission, setViewedSubmission] =
    useState<QuickOrderSubmission | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<
    { savedAt: number; state: QuickOrderState } | null
  >(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<QuickOrderSubmission[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Load draft prompt on open
  useEffect(() => {
    const d = loadDraft(sKey);
    if (d && draftHasContent(d.state)) {
      setDraftPrompt(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave draft (debounced) when not read-only
  useEffect(() => {
    if (readOnly) return;
    if (!draftHasContent(state)) return;
    const t = window.setTimeout(() => {
      saveDraft(sKey, state);
      setSavedAt(Date.now());
    }, 500);
    return () => window.clearTimeout(t);
  }, [state, readOnly, sKey]);

  // Refresh history when phone changes
  useEffect(() => {
    if (readOnly) return;
    const list = listSubmissionsByPhone(sKey, state.phone);
    setHistory(list);
  }, [state.phone, sKey, readOnly]);

  const totals = useMemo(() => computeTotals(state), [state]);

  const validation = useMemo(() => {
    const r = quickOrderSchema.safeParse({
      name: state.name,
      phone: state.phone,
      items: state.items,
    });
    const errs: Record<string, string> = {};
    if (!r.success) {
      for (const iss of r.error.issues) {
        const k = iss.path[0] as string;
        if (!errs[k]) errs[k] = iss.message;
      }
    }
    return { ok: r.success, errs };
  }, [state.name, state.phone, state.items]);

  function patch(p: Partial<QuickOrderState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function updateItem(idx: number, p: Partial<QuickOrderState["items"][number]>) {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...p } : it)),
    }));
  }
  function addItem() {
    setState((p) => ({ ...p, items: [...p.items, emptyItem()] }));
  }
  function removeItem(idx: number) {
    setState((p) => ({
      ...p,
      items:
        p.items.length <= 1
          ? [emptyItem()]
          : p.items.filter((_, i) => i !== idx),
    }));
  }

  function handleLoadDraft() {
    if (!draftPrompt) return;
    setState(draftPrompt.state);
    setSavedAt(draftPrompt.savedAt);
    setDraftPrompt(null);
    toast.success("โหลดร่างเรียบร้อย");
  }
  function handleDiscardDraft() {
    clearDraft(sKey);
    setDraftPrompt(null);
  }

  function openHistorical(id: string) {
    const rec = getSubmission(sKey, id);
    if (!rec) return;
    setState(rec.state);
    setReadOnly(true);
    setViewedSubmission(rec);
  }
  function backToEdit() {
    setReadOnly(false);
    setViewedSubmission(null);
    setState(emptyState());
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`คัดลอก${label}แล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  function focusFirstError() {
    if (validation.errs.name) nameRef.current?.focus();
    else if (validation.errs.phone) phoneRef.current?.focus();
  }

  async function submitToLine() {
    // mark all touched
    setTouched({ name: true, phone: true, items: true });
    if (!validation.ok) {
      const msg =
        validation.errs.name ||
        validation.errs.phone ||
        validation.errs.items ||
        "กรอกข้อมูลไม่ครบ";
      toast.error(msg);
      focusFirstError();
      return;
    }
    const short = buildShortMessage(state, totals);
    try {
      await navigator.clipboard.writeText(short);
    } catch {
      /* noop */
    }
    saveSubmission(sKey, {
      phone: state.phone,
      name: state.name,
      mode: state.mode,
      state,
      totals,
    });
    clearDraft(sKey);
    toast.success("บันทึกใบสั่งแล้ว — คัดลอกข้อความและเปิด LINE ให้อัตโนมัติ");
    if (lineUrl) openLine(lineUrl);
    onClose();
  }

  const showErr = (k: string) => touched[k] && validation.errs[k];
  const disabled = readOnly;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b bg-gradient-to-r from-orange-50 via-white to-orange-50">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0"
              aria-label="ปิด"
            >
              <X className="w-4 h-4" /> ปิด
            </button>
            <div className="text-lg md:text-2xl font-bold truncate">
              {modeTitle(state.mode)}
            </div>
            {readOnly && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                <Lock className="w-3 h-3" /> อ่านอย่างเดียว
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {savedAt && !readOnly && (
              <span className="hidden md:inline text-xs text-muted-foreground">
                บันทึกร่าง {fmtWhen(savedAt)}
              </span>
            )}
            <Select
              value={state.mode}
              onValueChange={(v) => patch({ mode: v as QuickOrderMode })}
              disabled={disabled}
            >
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quote">ใบเสนอราคา</SelectItem>
                <SelectItem value="work_order">ใบสั่งจ้าง</SelectItem>
                <SelectItem value="delivery">ใบส่งของ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Read-only banner */}
        {readOnly && viewedSubmission && (
          <div className="px-4 md:px-6 py-3 border-b bg-amber-50 text-amber-900 text-sm flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                ใบนี้ส่งให้ร้านแล้วเมื่อ {fmtWhen(viewedSubmission.submittedAt)} —
                หากต้องการแก้ไข กรุณาทัก LINE แอดมิน
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={backToEdit}>
                สร้างใบใหม่
              </Button>
              {lineUrl && (
                <Button size="sm" onClick={() => openLine(lineUrl)}>
                  ทัก LINE แอดมิน
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Draft prompt */}
        {draftPrompt && !readOnly && (
          <div className="px-4 md:px-6 py-3 border-b bg-blue-50 text-blue-900 text-sm flex flex-wrap items-center gap-2 justify-between">
            <span>พบร่างที่ยังไม่ได้ส่ง เมื่อ {fmtWhen(draftPrompt.savedAt)}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={handleDiscardDraft}>
                เริ่มใหม่
              </Button>
              <Button size="sm" onClick={handleLoadDraft}>
                โหลดร่าง
              </Button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto px-4 md:px-6 py-4 space-y-5">
          {/* History for this phone */}
          {!readOnly && history.length > 0 && (
            <section className="rounded-2xl border bg-card shadow-sm p-3">
              <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <History className="w-4 h-4" /> ประวัติที่ส่งไปแล้ว ({history.length})
              </div>
              <ul className="divide-y">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {modeTitle(h.mode)} · {h.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtWhen(h.submittedAt)} · สุทธิ {fmtTHB(h.totals.grand)}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openHistorical(h.id)}>
                      ดู
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Customer */}
          <section className="rounded-2xl border bg-card shadow-sm p-4">
            <div className="text-sm font-semibold mb-3">ข้อมูลลูกค้า</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">ชื่อลูกค้า *</Label>
                <Input
                  ref={nameRef}
                  value={state.name}
                  disabled={disabled}
                  onChange={(e) => patch({ name: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="ชื่อ-สกุล"
                  className={showErr("name") ? "border-destructive" : ""}
                />
                {showErr("name") && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {validation.errs.name}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">เบอร์โทรศัพท์ *</Label>
                <Input
                  ref={phoneRef}
                  value={state.phone}
                  disabled={disabled}
                  onChange={(e) => patch({ phone: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  placeholder="08xxxxxxxx"
                  inputMode="tel"
                  className={showErr("phone") ? "border-destructive" : ""}
                />
                {showErr("phone") && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {validation.errs.phone}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">บริษัท / โรงเรียน</Label>
                <Input
                  value={state.company}
                  disabled={disabled}
                  onChange={(e) => patch({ company: e.target.value })}
                  placeholder="ชื่อหน่วยงาน"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">เลขผู้เสียภาษี (ถ้ามี)</Label>
                <Input
                  value={state.taxId}
                  disabled={disabled}
                  onChange={(e) => patch({ taxId: e.target.value })}
                  placeholder="0-0000-00000-00-0"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">ที่อยู่</Label>
                <Input
                  value={state.address}
                  disabled={disabled}
                  onChange={(e) => patch({ address: e.target.value })}
                  placeholder="ที่อยู่จัดส่ง/ออกใบกำกับ"
                />
              </div>
            </div>
          </section>

          {/* Items */}
          <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold border-b">
              รายการสินค้า / งาน *
            </div>

            <div className="hidden md:block">
              <div className="grid grid-cols-[36px_1fr_90px_90px_120px_130px_44px] gap-2 px-4 py-2 text-xs font-medium bg-[hsl(var(--table-header,var(--muted)))] text-[hsl(var(--table-header-fg,var(--foreground)))]">
                <div>#</div>
                <div>รายการ</div>
                <div className="text-right">จำนวน</div>
                <div>หน่วย</div>
                <div className="text-right">ราคา/หน่วย</div>
                <div className="text-right">ยอดรวม</div>
                <div></div>
              </div>
              {state.items.map((it, i) => {
                const q = parseFloat(it.qty) || 0;
                const p = parseFloat(it.price) || 0;
                return (
                  <div
                    key={i}
                    className="grid grid-cols-[36px_1fr_90px_90px_120px_130px_44px] gap-2 px-4 py-2 items-center border-t"
                  >
                    <div className="text-sm text-muted-foreground">{i + 1}</div>
                    <Input value={it.name} disabled={disabled} onChange={(e) => updateItem(i, { name: e.target.value })} placeholder="ชื่อสินค้า/งาน" />
                    <Input value={it.qty} disabled={disabled} onChange={(e) => updateItem(i, { qty: e.target.value })} inputMode="decimal" className="text-right" />
                    <Input value={it.unit} disabled={disabled} onChange={(e) => updateItem(i, { unit: e.target.value })} placeholder="เช่น ชิ้น" />
                    <Input value={it.price} disabled={disabled} onChange={(e) => updateItem(i, { price: e.target.value })} inputMode="decimal" className="text-right" placeholder="0.00" />
                    <div className="text-right text-sm tabular-nums">{fmtTHB(q * p)}</div>
                    <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => removeItem(i)} aria-label="ลบ">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="md:hidden divide-y">
              {state.items.map((it, i) => {
                const q = parseFloat(it.qty) || 0;
                const p = parseFloat(it.price) || 0;
                return (
                  <div key={i} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">รายการที่ {i + 1}</div>
                      <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => removeItem(i)} aria-label="ลบ">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <Input value={it.name} disabled={disabled} onChange={(e) => updateItem(i, { name: e.target.value })} placeholder="ชื่อสินค้า/งาน" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={it.qty} disabled={disabled} onChange={(e) => updateItem(i, { qty: e.target.value })} inputMode="decimal" placeholder="จำนวน" />
                      <Input value={it.unit} disabled={disabled} onChange={(e) => updateItem(i, { unit: e.target.value })} placeholder="หน่วย" />
                    </div>
                    <Input value={it.price} disabled={disabled} onChange={(e) => updateItem(i, { price: e.target.value })} inputMode="decimal" placeholder="ราคา/หน่วย" />
                    <div className="text-right text-sm tabular-nums">รวม: {fmtTHB(q * p)}</div>
                  </div>
                );
              })}
            </div>

            {!disabled && (
              <div className="p-3 border-t">
                <Button type="button" variant="outline" onClick={addItem} className="w-full md:w-auto">
                  <Plus className="w-4 h-4 mr-1.5" /> เพิ่มรายการ
                </Button>
              </div>
            )}
            {touched.items && validation.errs.items && (
              <div className="px-4 pb-3 text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {validation.errs.items}
              </div>
            )}
          </section>

          {/* Note + summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="rounded-2xl border bg-card shadow-sm p-4">
              <div className="text-sm font-semibold mb-2">หมายเหตุถึงร้าน</div>
              <Textarea rows={5} disabled={disabled} value={state.note} onChange={(e) => patch({ note: e.target.value })} placeholder="รายละเอียดเพิ่มเติม เช่น วันที่ต้องการ, ที่อยู่จัดส่ง" />
            </section>
            <section className="rounded-2xl border bg-card shadow-sm p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ยอดรวม</span>
                <span className="tabular-nums">{fmtTHB(totals.subtotal)}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ส่วนลด</span>
                  <span className="tabular-nums text-destructive">-{fmtTHB(totals.discount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={state.discountKind}
                    onValueChange={(v) => patch({ discountKind: v as "pct" | "amt" })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-[92px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pct">%</SelectItem>
                      <SelectItem value="amt">บาท</SelectItem>
                    </SelectContent>
                  </Select>
                  {state.discountKind === "pct" ? (
                    <Input
                      value={state.discountPct}
                      disabled={disabled}
                      onChange={(e) => patch({ discountPct: e.target.value })}
                      className="h-8 text-right"
                      inputMode="decimal"
                    />
                  ) : (
                    <Input
                      value={state.discountAmt}
                      disabled={disabled}
                      onChange={(e) => patch({ discountAmt: e.target.value })}
                      className="h-8 text-right"
                      inputMode="decimal"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs">VAT</div>
                <RadioGroup
                  value={state.vatMode}
                  onValueChange={(v) => patch({ vatMode: v as "none" | "add" | "incl" })}
                  disabled={disabled}
                  className="grid grid-cols-3 gap-1.5 text-xs"
                >
                  <label className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="none" /> <span>ไม่มี</span>
                  </label>
                  <label className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="add" /> <span>แยกนอก</span>
                  </label>
                  <label className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="incl" /> <span>รวมใน</span>
                  </label>
                </RadioGroup>
                {state.vatMode !== "none" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      ฐาน / VAT
                    </span>
                    <span className="tabular-nums">
                      {fmtTHB(totals.base)} / {fmtTHB(totals.vat)}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t pt-2 flex justify-between text-base font-semibold">
                <span>ยอดสุทธิ</span>
                <span className="tabular-nums text-primary">{fmtTHB(totals.grand)}</span>
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="border-t bg-background px-4 md:px-6 py-3 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Copy className="w-4 h-4 mr-1.5" /> คัดลอก
                  <ChevronDown className="w-3.5 h-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => copyText(buildShortMessage(state, totals), "แบบสั้น (LINE)")}
                >
                  แบบสั้น (LINE)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => copyText(buildFullMessage(state, totals), "แบบเต็ม (เอกสาร)")}
                >
                  แบบเต็ม (เอกสาร)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => copyText(buildTsvMessage(state), "ตาราง (TSV)")}
                >
                  ตาราง (วาง Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={submitToLine} disabled={!validation.ok}>
              <Send className="w-4 h-4 mr-1.5" /> ส่งผ่าน LINE แอดมิน
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Re-export utils so old imports still resolve.
export { phoneRegex, normPhone };
export default QuickOrderDialog;