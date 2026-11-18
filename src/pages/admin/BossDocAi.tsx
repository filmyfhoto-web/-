import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Loader2, Paperclip, RotateCcw, Copy, FileText, Send, AlertTriangle, CheckCircle2, Plus, Trash2, X, Eye } from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import BossDocPreview from "@/components/boss/BossDocPreview";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  computeTotals, emptyResult, lineAmount, normalizeResult, round2, toCopyText, verifyResult,
  type BossItem, type BossResult, type BossDocumentType, type BossVatMode,
} from "@/lib/bossDocument";

const SYSTEM_VERSION = "POS v1.2.0";

const SHOPS: { slug: "colorlab" | "printing"; name: string }[] = [
  { slug: "colorlab", name: "ร้านนัฐภรณ์ คัลเลอร์แล็ป" },
  { slug: "printing", name: "ร้านนัฐภรณ์ การพิมพ์" },
];

const DOC_TYPES: { value: BossDocumentType; label: string }[] = [
  { value: "quotation", label: "ใบเสนอราคา" },
  { value: "delivery", label: "ใบส่งของ" },
  { value: "receipt", label: "ใบเสร็จรับเงิน" },
];

const VAT_MODES: { value: BossVatMode; label: string }[] = [
  { value: "none", label: "ไม่คิด VAT" },
  { value: "exclusive", label: "ไม่รวม VAT (บวกทีหลัง)" },
  { value: "inclusive", label: "รวม VAT แล้ว (ถอด VAT)" },
];

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.xlsx,.xls,.csv";
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "บอส" — ผู้ช่วยออกเอกสารด้วย AI (อ่านไฟล์ → แก้ไข → ส่งเข้าโฟลว์เอกสารเดิม) */
export default function BossDocAi() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [shop, setShop] = useState<"colorlab" | "printing">("colorlab");
  const [documentType, setDocumentType] = useState<BossDocumentType>("quotation");
  const [vatMode, setVatMode] = useState<BossVatMode>("exclusive");
  const [vatRate, setVatRate] = useState(7);
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("บอส ช่วยออกใบเสนอราคาจากไฟล์นี้ให้หน่อย ขอโหมดไม่รวม VAT บวกทีหลังนะ");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const [result, setResult] = useState<BossResult | null>(null);
  const [override, setOverride] = useState<string>("");
  /** ต้องดูตัวอย่างเอกสารก่อนเสมอ: "pos" = ส่งเข้า POS, "create" = สร้างเอกสาร, "view" = ดูอย่างเดียว */
  const [previewMode, setPreviewMode] = useState<null | "pos" | "create" | "view">(null);

  const shopName = SHOPS.find((s) => s.slug === shop)!.name;
  const docLabel = DOC_TYPES.find((d) => d.value === documentType)!.label;

  const totals = useMemo(
    () => (result ? computeTotals(result.items, result.vatMode, result.vatRate) : null),
    [result],
  );
  const check = useMemo(() => (result ? verifyResult(result) : null), [result]);
  const canIssue = !!result && result.items.length > 0 && (check?.ok || override.trim().length > 2);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 5));
  }

  async function runBoss() {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("shop", shop);
      form.append("documentType", documentType);
      form.append("vatMode", vatMode);
      form.append("vatRate", String(vatRate));
      files.forEach((f) => form.append("files", f));

      const { data, error: fnErr } = await supabase.functions.invoke("boss-doc-ai", { body: form });
      const payload: any = data ?? (fnErr as any)?.context ?? null;
      if (fnErr && !payload?.result) {
        let detail = "";
        try { detail = JSON.stringify(payload ?? {}); } catch { /* ignore */ }
        throw new Error(fnErr.message + (detail && detail !== "{}" ? ` — ${detail}` : ""));
      }
      if (payload?.error) throw new Error(payload.message || payload.error);

      const raw = payload?.result ?? {};
      const merged = normalizeResult(
        emptyResult({
          documentType: (raw.documentType as BossDocumentType) || documentType,
          shop,
          vatMode: (raw.vatMode as BossVatMode) || vatMode,
          vatRate: Number(raw.vatRate ?? vatRate) || 0,
          customer: {
            name: raw.customer?.name ?? "",
            organization: raw.customer?.organization ?? "",
            taxId: raw.customer?.taxId ?? "",
            address: raw.customer?.address ?? "",
            phone: raw.customer?.phone ?? "",
          },
          items: (Array.isArray(raw.items) ? raw.items : []).map((it: any) => ({
            description: String(it?.description ?? ""),
            quantity: Number(it?.quantity ?? 0),
            unit: String(it?.unit ?? ""),
            unitPrice: Number(it?.unitPrice ?? 0),
            amount: Number(it?.amount ?? 0),
            needsReview: !!it?.needsReview,
          })),
          subtotal: Number(raw.subtotal ?? 0),
          vatAmount: Number(raw.vatAmount ?? 0),
          grandTotal: Number(raw.grandTotal ?? 0),
          notes: String(raw.notes ?? ""),
          warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
        }),
      );
      setResult(merged);
      setDocumentType(merged.documentType);
      setVatMode(merged.vatMode);
      setVatRate(merged.vatRate);
      setOverride("");
      toast.success("บอสอ่านเอกสารเสร็จแล้ว — ตรวจทานก่อนสร้างเอกสารนะครับ");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setError(
        msg.includes("missing_secret") || msg.includes("ผู้ให้บริการ AI")
          ? { title: "ยังไม่ได้ตั้งค่าผู้ให้บริการ AI", detail: "ผู้ดูแลระบบต้องตั้งค่า LOVABLE_API_KEY ก่อนใช้งานบอส" }
          : { title: "บอสอ่านเอกสารไม่สำเร็จ", detail: msg },
      );
    } finally {
      setLoading(false);
    }
  }

  /** ทุกครั้งที่แก้ไข ให้คำนวณยอดใหม่ทันที */
  function patch(next: Partial<BossResult>) {
    setResult((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...next };
      const t = computeTotals(merged.items, merged.vatMode, merged.vatRate);
      return { ...merged, subtotal: t.subtotal, vatAmount: t.vatAmount, grandTotal: t.grandTotal, arithmeticVerified: true };
    });
  }

  function patchItem(idx: number, next: Partial<BossItem>) {
    if (!result) return;
    const items = result.items.map((it, i) => (i === idx ? { ...it, ...next } : it));
    patch({ items: items.map((it) => ({ ...it, amount: lineAmount(it) })) });
  }

  /** ส่งข้อมูลเข้าโฟลว์ออกเอกสารเดิม (สำหรับ ?copy=1 ของ DocumentForm) */
  function handoff(newTab: boolean) {
    if (!result) return;
    const priceType = vatMode === "none" ? "no_vat" : vatMode === "inclusive" ? "include_vat" : "exclude_vat";
    sessionStorage.setItem(
      "rds_copy_doc",
      JSON.stringify({
        doc: {
          document_type: result.documentType,
          paper_size: "A4",
          template: "modern",
          vat_mode: result.vatMode,
          vat_rate: result.vatRate,
          price_type: priceType,
          customer_name: result.customer.name || result.customer.organization,
          customer_phone: result.customer.phone,
          customer_address: result.customer.address,
          customer_tax_id: result.customer.taxId,
          notes: [result.notes, override ? `ยืนยันข้ามการตรวจเลข: ${override}` : ""].filter(Boolean).join("\n"),
          project_name: result.customer.organization || "",
        },
        items: result.items.map((it) => ({
          name: it.description,
          description: "",
          price: round2(it.unitPrice),
          quantity: Number(it.quantity) || 0,
          unit: it.unit,
        })),
      }),
    );
    const url = `/receipts/${shop}/documents/new?copy=1&type=${result.documentType}`;
    if (newTab) window.open(url, "_blank", "noopener");
    else navigate(url);
  }

  function confirmPreview() {
    const mode = previewMode;
    setPreviewMode(null);
    if (mode === "pos") handoff(true);
    else if (mode === "create") handoff(false);
  }

  function reset() {
    setResult(null);
    setFiles([]);
    setError(null);
    setOverride("");
    setPreviewMode(null);
  }

  return (
    <AdminLayout>
      <SeoHead title="บอส — ผู้ช่วยออกเอกสาร" description="AI ช่วยอ่านบิล/ไฟล์งาน แล้วเตรียมข้อมูลออกเอกสาร" path="/admin/boss" />
      <div className="space-y-5 max-w-5xl">
        <header className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-2.5"><Bot className="w-6 h-6 text-primary" /></div>
          <div className="flex-1 min-w-[12rem]">
            <h1 className="text-2xl font-bold">บอส — ผู้ช่วยออกเอกสาร</h1>
            <p className="text-sm text-muted-foreground">แนบไฟล์บิล/ไฟล์งาน แล้วสั่งเป็นภาษาไทยได้เลย</p>
          </div>
          <Badge variant="secondary" className="text-xs">{SYSTEM_VERSION}</Badge>
        </header>

        {/* ---- ตั้งค่าคำสั่ง ---- */}
        <section className="rounded-2xl border bg-card p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>ร้าน/สาขา</Label>
              <Select value={shop} onValueChange={(v) => setShop(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SHOPS.map((s) => <SelectItem key={s.slug} value={s.slug}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ประเภทเอกสาร</Label>
              <Select value={documentType} onValueChange={(v) => { setDocumentType(v as BossDocumentType); if (result) patch({ documentType: v as BossDocumentType }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>โหมด VAT</Label>
              <Select value={vatMode} onValueChange={(v) => { setVatMode(v as BossVatMode); if (result) patch({ vatMode: v as BossVatMode }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VAT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>อัตรา VAT (%)</Label>
              <Input
                type="number" inputMode="decimal" min={0} max={30} step={0.5} value={vatRate}
                disabled={vatMode === "none"}
                onChange={(e) => { const v = Number(e.target.value) || 0; setVatRate(v); if (result) patch({ vatRate: v }); }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>ไฟล์แนบ (รูป JPG/PNG/WebP, PDF, Excel/CSV — สูงสุด 5 ไฟล์)</Label>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <Paperclip className="w-4 h-4 mr-1.5" /> เลือกไฟล์
              </Button>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-xl border bg-muted/40 px-2.5 py-1.5 text-xs max-w-full">
                  {f.type.startsWith("image/") && (
                    <img src={URL.createObjectURL(f)} alt={f.name} className="w-8 h-8 rounded object-cover" />
                  )}
                  <span className="truncate max-w-[10rem]">{f.name}</span>
                  <button type="button" aria-label={`ลบ ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>คำสั่งถึงบอส</Label>
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="บอส ช่วยออกใบเสนอราคาจากไฟล์นี้ให้หน่อย ขอโหมดไม่รวม VAT บวกทีหลังนะ" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runBoss} disabled={loading || (!prompt.trim() && files.length === 0)}>
              {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Bot className="w-4 h-4 mr-1.5" />}
              {loading ? "บอสกำลังอ่านเอกสาร…" : "ให้บอสอ่านเอกสาร"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={loading}><RotateCcw className="w-4 h-4 mr-1.5" /> เริ่มใหม่</Button>
          </div>

          {loading && (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground" role="status">
              กำลังส่งไฟล์ให้บอสอ่าน แล้วคำนวณยอดซ้ำด้วยระบบ — โปรดรอสักครู่
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
              <div className="font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error.title}</div>
              {error.detail && <p className="mt-1 text-muted-foreground break-words">{error.detail}</p>}
            </div>
          )}
        </section>

        {/* ---- ผลการแกะข้อมูล ---- */}
        {result && totals && check && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold">ผลการแกะข้อมูล</h2>

            <div className="rounded-2xl border bg-card p-4 grid gap-3 sm:grid-cols-2">
              {([
                ["ชื่อลูกค้า", "name"], ["หน่วยงาน", "organization"], ["เลขผู้เสียภาษี", "taxId"], ["โทรศัพท์", "phone"],
              ] as const).map(([label, key]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input value={result.customer[key]} onChange={(e) => patch({ customer: { ...result.customer, [key]: e.target.value } })} />
                </div>
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>ที่อยู่</Label>
                <Textarea rows={2} value={result.customer.address} onChange={(e) => patch({ customer: { ...result.customer, address: e.target.value } })} />
              </div>
            </div>

            {/* ตารางรายการ — desktop */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="p-2 w-12">ลำดับ</th><th className="p-2 text-left">รายการสินค้า</th>
                      <th className="p-2 w-24">จำนวน</th><th className="p-2 w-24">หน่วย</th>
                      <th className="p-2 w-28">ราคา/หน่วย</th><th className="p-2 w-28 text-right">จำนวนเงิน</th><th className="p-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((it, i) => (
                      <tr key={i} className={it.needsReview ? "bg-amber-50/60" : undefined}>
                        <td className="p-2 text-center text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          <Input value={it.description} onChange={(e) => patchItem(i, { description: e.target.value })} />
                          {it.needsReview && <span className="mt-1 inline-block text-[11px] text-amber-700">ต้องตรวจสอบ</span>}
                        </td>
                        <td className="p-2"><Input type="number" inputMode="decimal" value={it.quantity} onChange={(e) => patchItem(i, { quantity: Number(e.target.value) || 0 })} /></td>
                        <td className="p-2"><Input value={it.unit} onChange={(e) => patchItem(i, { unit: e.target.value })} /></td>
                        <td className="p-2"><Input type="number" inputMode="decimal" value={it.unitPrice} onChange={(e) => patchItem(i, { unitPrice: Number(e.target.value) || 0 })} /></td>
                        <td className="p-2 text-right tabular-nums font-medium">{baht(lineAmount(it))}</td>
                        <td className="p-2">
                          <Button type="button" variant="ghost" size="icon" aria-label={`ลบรายการที่ ${i + 1}`} onClick={() => patch({ items: result.items.filter((_, j) => j !== i) })}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ตารางรายการ — มือถือแบบการ์ด */}
              <div className="md:hidden divide-y">
                {result.items.map((it, i) => (
                  <div key={i} className={`p-3 space-y-2 ${it.needsReview ? "bg-amber-50/60" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">รายการที่ {i + 1}</span>
                      <Button type="button" variant="ghost" size="icon" aria-label={`ลบรายการที่ ${i + 1}`} onClick={() => patch({ items: result.items.filter((_, j) => j !== i) })}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input value={it.description} placeholder="รายการสินค้า" onChange={(e) => patchItem(i, { description: e.target.value })} />
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" inputMode="decimal" value={it.quantity} onChange={(e) => patchItem(i, { quantity: Number(e.target.value) || 0 })} />
                      <Input value={it.unit} placeholder="หน่วย" onChange={(e) => patchItem(i, { unit: e.target.value })} />
                      <Input type="number" inputMode="decimal" value={it.unitPrice} onChange={(e) => patchItem(i, { unitPrice: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="text-right text-sm font-medium tabular-nums">{baht(lineAmount(it))} บาท</div>
                    {it.needsReview && <div className="text-[11px] text-amber-700">ต้องตรวจสอบ</div>}
                  </div>
                ))}
              </div>

              <div className="p-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => patch({ items: [...result.items, { description: "", quantity: 1, unit: "", unitPrice: 0, amount: 0 }] })}>
                  <Plus className="w-4 h-4 mr-1.5" /> เพิ่มแถว
                </Button>
              </div>
            </div>

            {/* สรุปยอด */}
            <div className="rounded-2xl border bg-card p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>รวมเป็นเงิน (Subtotal)</span><span className="tabular-nums">{baht(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>VAT ({result.vatMode === "none" ? "ไม่คิด" : `${result.vatRate}%`})</span><span className="tabular-nums">{baht(totals.vatAmount)}</span></div>
              <div className="flex justify-between font-bold text-base pt-1.5 border-t"><span>ยอดสุทธิ (Grand Total)</span><span className="tabular-nums">{baht(totals.grandTotal)}</span></div>
            </div>

            {/* แถบตรวจสอบเลข */}
            <div className={`rounded-2xl border p-4 space-y-2 text-sm ${check.ok ? "border-emerald-300 bg-emerald-50/60" : "border-amber-400 bg-amber-50/70"}`} role="status">
              <div className="font-semibold flex items-center gap-1.5">
                {check.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                แถบตรวจสอบเลข
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>ผลรวมรายการ {check.subtotalMatches ? "ตรงกับ Subtotal" : "ไม่ตรงกับ Subtotal"}</li>
                <li>ฐานคิด VAT: {check.vatBaseLabel}</li>
                <li>Grand Total {check.grandTotalMatches ? "ถูกต้องตามสูตรของโหมด VAT" : "ไม่ตรงตามสูตรของโหมด VAT"}</li>
              </ul>
              {result.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-amber-800">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              )}
              {!check.ok && (
                <div className="space-y-1.5">
                  <Label htmlFor="boss-override">ยืนยันข้ามการตรวจ (ระบุเหตุผล)</Label>
                  <Input id="boss-override" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="เช่น ยอดในบิลต้นทางปัดเศษไว้แล้ว" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Textarea rows={2} value={result.notes} onChange={(e) => patch({ notes: e.target.value })} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(toCopyText(result, shopName, docLabel)); toast.success("คัดลอกข้อมูลแล้ว"); }}>
                <Copy className="w-4 h-4 mr-1.5" /> คัดลอกข้อมูล
              </Button>
              <Button variant="outline" onClick={() => setPreviewMode("view")}>
                <Eye className="w-4 h-4 mr-1.5" /> ดูตัวอย่างเอกสาร
              </Button>
              <Button variant="outline" disabled={!canIssue} onClick={() => setPreviewMode("pos")}>
                <Send className="w-4 h-4 mr-1.5" /> ส่งเข้า POS
              </Button>
              <Button disabled={!canIssue} onClick={() => setPreviewMode("create")}>
                <FileText className="w-4 h-4 mr-1.5" /> สร้าง{docLabel}
              </Button>
              <Button variant="ghost" onClick={reset}><RotateCcw className="w-4 h-4 mr-1.5" /> เริ่มใหม่</Button>
            </div>
            {!canIssue && <p className="text-xs text-amber-700">ตัวเลขยังไม่ตรง — แก้ไขรายการ หรือระบุเหตุผลเพื่อยืนยันข้ามการตรวจก่อนสร้างเอกสาร</p>}
          </section>
        )}

        {/* ---- กล่องดูตัวอย่างเอกสาร (บังคับดูก่อนสร้าง/ส่งเข้า POS) ---- */}
        <Dialog open={!!previewMode && !!result} onOpenChange={(open) => { if (!open) setPreviewMode(null); }}>
          <DialogContent className="max-w-[860px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ตัวอย่าง{docLabel}</DialogTitle>
              <DialogDescription>ตรวจรูปแบบและตัวเลขให้เรียบร้อยก่อนดำเนินการต่อ</DialogDescription>
            </DialogHeader>
            {result && <BossDocPreview result={result} shopName={shopName} docLabel={docLabel} />}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => setPreviewMode(null)}>กลับไปแก้ไข</Button>
              {previewMode === "pos" && (
                <Button onClick={confirmPreview}><Send className="w-4 h-4 mr-1.5" /> ยืนยัน ส่งเข้า POS</Button>
              )}
              {previewMode === "create" && (
                <Button onClick={confirmPreview}><FileText className="w-4 h-4 mr-1.5" /> ยืนยัน สร้าง{docLabel}</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
