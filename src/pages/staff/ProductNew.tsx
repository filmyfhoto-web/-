import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Save, Send, ScanLine, ListChecks, X, AlertTriangle, ExternalLink, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { logScan, loadProductDefaults, saveProductDefaults, type ScanProductDefaults } from "@/lib/scanLog";
import CameraCaptureDialog, { type CaptureResult } from "@/components/products/CameraCaptureDialog";

const CONT_MODE_KEY = "product_new_continuous_mode";

export default function StaffProductNew() {
  const { user, canEditProduct, isStaff } = useAuth();
  const nav = useNavigate();
  const [cats, setCats] = useState<any[]>([]);
  const [priceGroups, setPriceGroups] = useState<any[]>([]);
  const [defaults, setDefaults] = useState<ScanProductDefaults>(loadProductDefaults());
  const [showDefaults, setShowDefaults] = useState(false);
  const [continuous, setContinuous] = useState<boolean>(() => {
    try { return localStorage.getItem(CONT_MODE_KEY) === "1"; } catch { return false; }
  });
  const [nextCode, setNextCode] = useState<string>("");
  const [form, setForm] = useState({
    name: "", code: "", barcode: "", category_id: "", unit: "ชิ้น",
    storage_location: "", stock: "0", low_stock_threshold: "0",
    description: "", note: ""
  });
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [camFocus, setCamFocus] = useState<"barcode" | "name" | "full">("full");
  const [queue, setQueue] = useState<CaptureResult[]>([]);
  const [duplicate, setDuplicate] = useState<CaptureResult["duplicate"]>(null);

  useEffect(() => {
    supabase.from("categories").select("id,name").order("name").then(({ data }) => setCats(data || []));
    if (isStaff) {
      supabase.from("price_groups").select("id,name").order("sort_order").then(({ data }) => setPriceGroups(data || []));
    }
    refreshNextCode();
  }, [isStaff]);

  async function refreshNextCode() {
    try {
      const { data } = await supabase.rpc("peek_next_fy_code" as any);
      if (typeof data === "string") setNextCode(data);
    } catch { /* ignore */ }
  }

  function toggleContinuous(v: boolean) {
    setContinuous(v);
    try { localStorage.setItem(CONT_MODE_KEY, v ? "1" : "0"); } catch {}
  }

  // apply defaults (stock/low/unit/category) to the empty form on first mount
  useEffect(() => {
    setForm((f) => ({
      ...f,
      stock: String(defaults.stock ?? 0),
      low_stock_threshold: String(defaults.low_stock_threshold ?? 0),
      unit: defaults.unit || f.unit,
      category_id: defaults.category_id || f.category_id,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateDefaults(p: Partial<ScanProductDefaults>) {
    const next = { ...defaults, ...p };
    setDefaults(next);
    saveProductDefaults(p);
  }

  function openCamera(focus: "barcode" | "name" | "full") {
    setCamFocus(focus);
    setCamOpen(true);
  }

  if (!canEditProduct) {
    return <StaffLayout><Card className="p-6 rounded-2xl">บัญชีคุณไม่มีสิทธิ์เพิ่มสินค้า กรุณาติดต่อแอดมิน</Card></StaffLayout>;
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImgFile(f); setImgPreview(URL.createObjectURL(f));
  }

  function handleCapture(r: CaptureResult) {
    if (r.file) setImgFile(r.file);
    if (r.previewUrl) setImgPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return r.previewUrl!; });
    setForm((f) => ({
      ...f,
      name: r.name || f.name,
      barcode: r.barcode || f.barcode,
      unit: r.unit || f.unit,
      category_id: r.category_id || f.category_id,
    }));
    setDuplicate(r.duplicate || null);
    if (r.duplicate) {
      toast.warning(`บาร์โค้ดซ้ำกับ "${r.duplicate.name}" — โปรดตรวจสอบก่อนบันทึก`);
    } else if (r.name || r.barcode) {
      toast.success("ดึงข้อมูลจากรูปแล้ว");
    }
  }

  function handleQueueComplete(items: CaptureResult[]) {
    setQueue(items);
    if (items.length > 0) {
      loadFromQueue(items[0], items);
    }
    toast.success(`คิว ${items.length} รายการ — กรอกข้อมูลทีละชิ้น`);
  }

  function loadFromQueue(item: CaptureResult, fullQueue?: CaptureResult[]) {
    setForm((f) => ({
      ...f,
      name: item.name || "",
      barcode: item.barcode || "",
      unit: item.unit || defaults.unit || f.unit,
      category_id: item.category_id || defaults.category_id || "",
      stock: String(defaults.stock ?? 0),
      low_stock_threshold: String(defaults.low_stock_threshold ?? 0),
    }));
    setDuplicate(item.duplicate || null);
    const list = fullQueue || queue;
    setQueue(list.filter((q) => q.barcode !== item.barcode));
  }

  function dropFromQueue(barcode?: string) {
    if (!barcode) return;
    setQueue((q) => q.filter((x) => x.barcode !== barcode));
  }

  async function save(asDraft: boolean) {
    if (!form.name.trim()) { toast.error("กรุณากรอกชื่อสินค้า"); return; }
    setBusy(true);
    try {
      if (duplicate) {
        const ok = window.confirm(
          `บาร์โค้ดนี้ซ้ำกับสินค้า "${duplicate.name}" ที่มีอยู่แล้ว ยืนยันเพิ่มเป็นสินค้าใหม่หรือไม่?`,
        );
        if (!ok) { setBusy(false); return; }
      }
      const payload: any = {
        name: form.name.trim(),
        // เว้นว่างไว้ให้ trigger DB เติมรหัส FYxxxxx อัตโนมัติ
        code: form.code.trim() || null,
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        unit: form.unit || null,
        storage_location: form.storage_location || null,
        description: form.description || null,
        stock: Number(form.stock) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        status: asDraft ? "draft" : "pending_review",
        active: true,
      };
      if (defaults.standard_price != null && defaults.standard_price > 0) {
        payload.standard_price = defaults.standard_price;
      }
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      const pid = data.id;
      // apply default group price (admin/owner only — RPC enforces)
      if (isStaff && defaults.group_price_id && defaults.group_price != null && defaults.group_price > 0) {
        await supabase.rpc("admin_set_group_price", {
          p_product_id: pid,
          p_group_id: defaults.group_price_id,
          p_price: defaults.group_price,
        }).then(({ error }) => { if (error) console.warn("set group price failed", error); });
      }
      logScan("scan_product_saved", {
        product_id: pid,
        name: payload.name,
        barcode: payload.barcode,
        was_duplicate_warned: !!duplicate,
        applied_defaults: {
          standard_price: payload.standard_price ?? null,
          group_price_id: defaults.group_price_id,
          group_price: defaults.group_price,
        },
      });

      if (imgFile) {
        const path = `${pid}/${Date.now()}-${imgFile.name}`;
        const up = await supabase.storage.from("product-images").upload(path, imgFile, { upsert: false });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        await supabase.rpc("staff_submit_product_image", {
          p_product_id: pid, p_url: pub.publicUrl, p_storage_path: path, p_note: form.note || null,
        });
      }

      if (form.note?.trim()) {
        await supabase.from("product_notes").insert({
          product_id: pid, kind: "other", note: form.note, created_by: user!.id,
        });
      }

      toast.success(asDraft ? "บันทึกเป็นร่างแล้ว" : "ส่งให้แอดมินตรวจสอบแล้ว");
      // อัปเดตพรีวิวรหัสถัดไป
      refreshNextCode();
      if (queue.length > 0) {
        // load next queued item, stay on page
        const next = queue[0];
        setQueue((q) => q.slice(1));
        setImgFile(null);
        setImgPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });
        loadFromQueue(next);
      } else if (continuous) {
        // โหมดลงต่อเนื่อง: reset ฟอร์มและเปิดกล้องต่อทันที
        setForm((f) => ({
          name: "", code: "", barcode: "",
          category_id: defaults.category_id || f.category_id,
          unit: defaults.unit || "ชิ้น",
          storage_location: "", description: "", note: "",
          stock: String(defaults.stock ?? 0),
          low_stock_threshold: String(defaults.low_stock_threshold ?? 0),
        }));
        setImgFile(null);
        setImgPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });
        setDuplicate(null);
        setTimeout(() => openCamera("full"), 150);
      } else {
        nav("/staff/pending");
      }
    } catch (e: any) {
      toast.error(e.message || "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function bulkSaveQueue(items: CaptureResult[]) {
    if (!items.length) return;
    setBusy(true);
    let ok = 0, skip = 0, fail = 0;
    for (const it of items) {
      try {
        if (it.duplicate) { skip++; logScan("scan_barcode_skipped", { barcode: it.barcode, duplicate_name: it.duplicate.name }); continue; }
        if (!it.name?.trim()) { skip++; continue; }
        const payload: any = {
          name: it.name!.trim(),
            // เว้นว่างไว้ให้ trigger DB เติมรหัส FYxxxxx อัตโนมัติ
            code: null,
          barcode: it.barcode?.trim() || null,
          category_id: it.category_id || defaults.category_id || null,
          unit: it.unit || defaults.unit || "ชิ้น",
          stock: defaults.stock ?? 0,
          low_stock_threshold: defaults.low_stock_threshold ?? 0,
          status: "pending_review",
          active: true,
        };
        if (defaults.standard_price != null && defaults.standard_price > 0) {
          payload.standard_price = defaults.standard_price;
        }
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        const pid = data.id;
        if (isStaff && defaults.group_price_id && defaults.group_price != null && defaults.group_price > 0) {
          await supabase.rpc("admin_set_group_price", {
            p_product_id: pid,
            p_group_id: defaults.group_price_id,
            p_price: defaults.group_price,
          });
        }
        logScan("scan_product_saved", { product_id: pid, name: payload.name, barcode: payload.barcode, bulk: true });
        ok++;
      } catch (e: any) {
        fail++;
        console.warn("bulk save failed", it.barcode, e);
      }
    }
    setBusy(false);
    setQueue([]);
    toast.success(`บันทึก ${ok} รายการ${skip ? ` · ข้าม ${skip}` : ""}${fail ? ` · ผิดพลาด ${fail}` : ""}`);
    if (ok > 0) nav("/staff/pending");
  }

  return (
    <StaffLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">เพิ่มสินค้าใหม่</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowDefaults((v) => !v)}>
              <Settings2 className="w-4 h-4 mr-1" /> ค่าเริ่มต้น
            </Button>
          </div>
        </div>
        <Card className="p-3 rounded-2xl flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Switch id="cont-mode" checked={continuous} onCheckedChange={toggleContinuous} />
            <Label htmlFor="cont-mode" className="cursor-pointer">
              โหมดลงต่อเนื่อง
              <span className="text-xs text-muted-foreground ml-2">
                {continuous ? "บันทึกแล้วเปิดกล้องตัวถัดไปทันที" : "บันทึกแล้วไปหน้า Pending"}
              </span>
            </Label>
          </div>
          {nextCode && (
            <div className="text-xs text-muted-foreground">
              รหัสถัดไป: <span className="font-mono font-semibold text-primary">{nextCode}</span>
            </div>
          )}
        </Card>
        {showDefaults && (
          <Card className="p-4 rounded-2xl border-primary/30 bg-primary/5 space-y-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> ค่าเริ่มต้นเมื่อบันทึกสินค้าจากคิวสแกน
            </div>
            <p className="text-xs text-muted-foreground">ค่าเหล่านี้จะใช้กับสินค้าใหม่ทุกตัวที่บันทึกผ่านคิวสแกน (จดจำในเครื่องนี้)</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>สต๊อกเริ่มต้น</Label>
                <Input type="number" value={defaults.stock} onChange={(e) => updateDefaults({ stock: Number(e.target.value) || 0 })} className="rounded-xl mt-1" />
              </div>
              <div>
                <Label>เตือนเมื่อต่ำกว่า</Label>
                <Input type="number" value={defaults.low_stock_threshold} onChange={(e) => updateDefaults({ low_stock_threshold: Number(e.target.value) || 0 })} className="rounded-xl mt-1" />
              </div>
              <div>
                <Label>หน่วยนับเริ่มต้น</Label>
                <Input value={defaults.unit} onChange={(e) => updateDefaults({ unit: e.target.value })} className="rounded-xl mt-1" />
              </div>
              <div>
                <Label>หมวดหมู่เริ่มต้น</Label>
                <Select value={defaults.category_id || ""} onValueChange={(v) => updateDefaults({ category_id: v || null })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="— ไม่กำหนด —" /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>ราคามาตรฐาน (บาท)</Label>
                <Input
                  type="number" step="0.01"
                  value={defaults.standard_price ?? ""}
                  placeholder="ไม่กำหนด"
                  onChange={(e) => updateDefaults({ standard_price: e.target.value === "" ? null : Number(e.target.value) })}
                  className="rounded-xl mt-1"
                />
              </div>
              {isStaff && (
                <>
                  <div>
                    <Label>กลุ่มราคา (เฉพาะแอดมิน)</Label>
                    <Select value={defaults.group_price_id || ""} onValueChange={(v) => updateDefaults({ group_price_id: v || null })}>
                      <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="— ไม่กำหนด —" /></SelectTrigger>
                      <SelectContent>{priceGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>ราคาตามกลุ่มที่เลือก (บาท)</Label>
                    <Input
                      type="number" step="0.01"
                      value={defaults.group_price ?? ""}
                      placeholder="ไม่กำหนด"
                      disabled={!defaults.group_price_id}
                      onChange={(e) => updateDefaults({ group_price: e.target.value === "" ? null : Number(e.target.value) })}
                      className="rounded-xl mt-1"
                    />
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
        {queue.length > 0 && (
          <Card className="p-3 rounded-2xl bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <ListChecks className="w-4 h-4" /> มีบาร์โค้ดในคิว {queue.length} รายการ
            </div>
            <ul className="space-y-1">
              {queue.map((q, i) => (
                <li key={(q.barcode || "") + i} className="flex items-center justify-between gap-2 text-xs bg-background rounded px-2 py-1">
                  <span className="font-mono">{q.barcode}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {q.duplicate ? `ซ้ำ: ${q.duplicate.name}` : q.name || "—"}
                  </span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => loadFromQueue(q)}>
                    กรอกถัดไป
                  </Button>
                  <button onClick={() => dropFromQueue(q.barcode)} className="p-1 hover:bg-muted rounded">
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {duplicate && (
          <Card className="p-3 rounded-2xl border-destructive/40 bg-destructive/5">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <div className="flex-1">
                บาร์โค้ดซ้ำกับสินค้าที่มีอยู่: <span className="font-semibold">{duplicate.name}</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                  <span className="text-muted-foreground">ตรวจสอบให้แน่ใจก่อนบันทึก หรือเปลี่ยนบาร์โค้ดใหม่</span>
                  <a
                    href={duplicate.table === "products" ? `/admin/products?id=${duplicate.id}` : `/receipts/products?id=${duplicate.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:no-underline inline-flex items-center gap-1 text-destructive"
                  >
                    <ExternalLink className="w-3 h-3" /> เปิดดูสินค้า "{duplicate.name}"
                  </a>
                </div>
              </div>
            </div>
          </Card>
        )}
        <Card className="p-4 rounded-2xl space-y-4">
          <div>
            <Label>รูปสินค้า</Label>
            <div className="mt-1 flex items-center gap-3">
              <label className="w-24 h-24 rounded-xl border-2 border-dashed border-border grid place-items-center cursor-pointer bg-muted overflow-hidden">
                {imgPreview ? <img src={imgPreview} alt="รูปสินค้า" className="w-full h-full object-cover" />
                  : <Camera className="w-7 h-7 text-muted-foreground" />}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickImage} />
              </label>
              <div className="flex-1 space-y-2">
                <Button type="button" variant="outline" className="rounded-xl w-full" onClick={() => openCamera("full")}>
                  <ScanLine className="w-4 h-4 mr-1" /> ถ่ายรูป + สแกนบาร์โค้ด + อ่านชื่อ
                </Button>
                <div className="text-[11px] text-muted-foreground">ลบพื้นหลังในเครื่อง · AI ดึงชื่อสินค้า · ส่งให้แอดมินตรวจสอบ</div>
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>ชื่อสินค้า *</Label>
              <div className="mt-1 flex gap-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl flex-1" />
                <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0" title="ใช้กล้องถ่ายชื่อสินค้า (AI อ่าน)" onClick={() => openCamera("name")}>
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>SKU / รหัสสินค้า</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder={nextCode ? `เว้นว่าง = ${nextCode} อัตโนมัติ` : "เว้นว่าง = รันอัตโนมัติ FYxxxxx"}
                className="rounded-xl mt-1"
              />
            </div>
            <div>
              <Label>บาร์โค้ด</Label>
              <div className="mt-1 flex gap-2">
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="rounded-xl flex-1" />
                <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0" title="ใช้กล้องสแกนบาร์โค้ด/รหัสสินค้า" onClick={() => openCamera("barcode")}>
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div><Label>หมวดหมู่</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="เลือกหมวด" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>หน่วยนับ</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="ด้าม / รีม / กล่อง" className="rounded-xl mt-1" /></div>
            <div><Label>สต็อกเริ่มต้น</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="rounded-xl mt-1" /></div>
            <div><Label>เตือนเมื่อต่ำกว่า</Label>
              <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className="rounded-xl mt-1" /></div>
            <div className="sm:col-span-2"><Label>ตำแหน่งจัดเก็บ</Label>
              <Input value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })} placeholder="ชั้น/แถว/กล่อง" className="rounded-xl mt-1" /></div>
            <div className="sm:col-span-2"><Label>รายละเอียดสินค้า</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl mt-1" rows={3} /></div>
            <div className="sm:col-span-2"><Label>หมายเหตุ</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="rounded-xl mt-1" rows={2} /></div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" disabled={busy} className="rounded-xl flex-1" onClick={() => save(true)}>
              <Save className="w-4 h-4 mr-1" /> บันทึกเป็นร่าง
            </Button>
            <Button disabled={busy} className="rounded-xl flex-1" onClick={() => save(false)}>
              <Send className="w-4 h-4 mr-1" /> ส่งให้แอดมินตรวจสอบ
            </Button>
          </div>
        </Card>
      </div>
      <CameraCaptureDialog
        open={camOpen}
        onOpenChange={setCamOpen}
        focus={camFocus}
        onCapture={handleCapture}
        onQueueComplete={handleQueueComplete}
        onBulkSave={bulkSaveQueue}
      />
    </StaffLayout>
  );
}