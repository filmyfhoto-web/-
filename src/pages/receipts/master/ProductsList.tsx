import { useEffect, useMemo, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Wand2, Camera, ScanText, Upload, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { useDebounced } from "./useDebounced";
import { downloadXlsx } from "@/lib/xlsx";
import * as XLSX from "xlsx";
import CameraCaptureDialog, { type CaptureResult } from "@/components/products/CameraCaptureDialog";
import { tbl } from "../lib/tbl";

interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  price: number;
  cost: number;
  unit: string | null;
  stock_qty: number | null;
  is_active: boolean;
  image_url: string | null;
}

interface Cat {
  id: string;
  name: string;
}

const EMPTY: Omit<Product, "id"> = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category_id: null,
  price: 0,
  cost: 0,
  unit: "",
  stock_qty: 0,
  is_active: true,
  image_url: null,
};

const NONE = "__none__";

function SignedImg({ path, alt }: { path: string | null | undefined; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path) return;
    if (/^https?:\/\//i.test(path)) { setUrl(path); return; }
    supabase.storage.from("product-images").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);
  if (!path) {
    return (
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-muted-foreground" title="ไม่มีรูป">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="h-10 w-10 rounded bg-muted overflow-hidden">
      {url ? <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" /> : null}
    </div>
  );
}

export default function ProductsList() {
  const { store } = useCurrentStore();
  const storeId = store?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [catFilter, setCatFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFocus, setCameraFocus] = useState<"barcode" | "name" | "full">("full");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data: cats } = useQuery({
    queryKey: ["rds_cats_for_products", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("categories") as any)
        .select("id,name")
        .eq("store_id", storeId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Cat[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["rds_products_list", storeId, debounced, catFilter],
    enabled: !!storeId,
    queryFn: async () => {
      let q = supabase
        .from(tbl("products") as any)
        .select("id,sku,barcode,name,description,category_id,price,cost,unit,stock_qty,is_active,image_url")
        .eq("store_id", storeId!)
        .order("name")
        .limit(500);
      if (debounced) q = q.or(`name.ilike.%${debounced}%,sku.ilike.%${debounced}%,barcode.ilike.%${debounced}%`);
      if (catFilter !== "all") q = q.eq("category_id", catFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const ch = liveChannel(`prod-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tbl("products"), filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["rds_products_list", storeId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeId, qc]);

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (stockFilter === "all") return list;
    return list.filter((p) => {
      const s = Number(p.stock_qty ?? 0);
      if (stockFilter === "out") return s <= 0;
      if (stockFilter === "low") return s > 0 && s <= 5;
      if (stockFilter === "ok") return s > 5;
      return true;
    });
  }, [data, stockFilter]);

  const catName = (id: string | null) =>
    cats?.find((c) => c.id === id)?.name ?? "-";

  function startNew() {
    setEditing(null);
    setForm(EMPTY);
    setImgFile(null);
    setImgPreview(null);
    setOpen(true);
  }
  function startEdit(p: Product) {
    setEditing(p);
    setForm({
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      name: p.name,
      description: p.description ?? "",
      category_id: p.category_id,
      price: Number(p.price),
      cost: Number(p.cost),
      unit: p.unit ?? "",
      stock_qty: p.stock_qty == null ? null : Number(p.stock_qty),
      is_active: p.is_active,
      image_url: p.image_url ?? null,
    });
    setImgFile(null);
    setImgPreview(null);
    setOpen(true);
  }

  async function save() {
    if (!storeId || !form.name.trim()) {
      toast.error("กรุณากรอกชื่อสินค้า");
      return;
    }
    setSaving(true);
    try {
      // ตรวจรหัสบาร์โค้ดซ้ำในร้านเดียวกัน
      const bc = (form.barcode || "").trim();
      if (bc) {
        let dupQ = supabase
          .from(tbl("products") as any)
          .select("id,name")
          .eq("store_id", storeId)
          .eq("barcode", bc)
          .limit(1);
        if (editing) dupQ = dupQ.neq("id", editing.id);
        const { data: dup, error: dupErr } = await dupQ;
        if (dupErr) throw dupErr;
        if (dup && dup.length) {
          toast.error(`รหัสบาร์โค้ดนี้มีอยู่แล้ว: ${(dup[0] as any).name}`);
          setSaving(false);
          return;
        }
      }
      const payload = {
        sku: form.sku || null,
        barcode: bc || null,
        name: form.name.trim(),
        description: form.description || null,
        category_id: form.category_id || null,
        price: Number(form.price) || 0,
        cost: Number(form.cost) || 0,
        unit: form.unit || null,
        stock_qty: form.stock_qty == null || form.stock_qty === ("" as any) ? null : Number(form.stock_qty),
        is_active: form.is_active,
        image_url: form.image_url,
      };
      let productId: string | undefined = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from(tbl("products") as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase
          .from(tbl("products") as any)
          .insert({ ...payload, store_id: storeId })
          .select("id")
          .single();
        if (error) throw error;
        productId = (ins as any).id;
      }
      // อัปโหลดรูปสินค้า (ถ้ามี)
      if (imgFile && productId) {
        const ext = (imgFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${storeId}/${productId}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("product-images").upload(path, imgFile, { upsert: true, contentType: imgFile.type });
        if (up.error) throw up.error;
        const { error: upErr } = await supabase.from(tbl("products") as any).update({ image_url: path }).eq("id", productId);
        if (upErr) throw upErr;
      }
      toast.success(editing ? "บันทึกแล้ว" : "เพิ่มสินค้าแล้ว");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["rds_products_list", storeId] });
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    const { error } = await supabase
      .from(tbl("products") as any)
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rds_products_list", storeId] });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from(tbl("products") as any).delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else toast.success("ลบแล้ว");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["rds_products_list", storeId] });
  }

  function exportExcel() {
    const rows = (data ?? []).map((p) => ({
      รหัส: p.sku ?? "",
      บาร์โค้ด: p.barcode ?? "",
      ชื่อ: p.name,
      หมวดหมู่: catName(p.category_id),
      หน่วย: p.unit ?? "",
      ราคา: Number(p.price),
      ต้นทุน: Number(p.cost),
      คงเหลือ: p.stock_qty,
      ใช้งาน: p.is_active ? "Y" : "N",
    }));
    downloadXlsx(`products_${storeId?.slice(0, 6)}`, { สินค้า: rows });
  }

  async function importExcel(file: File) {
    if (!storeId) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    const payload = json
      .map((r) => ({
        store_id: storeId,
        sku: String(r["รหัส"] ?? r["sku"] ?? "").trim() || null,
        barcode: String(r["บาร์โค้ด"] ?? r["barcode"] ?? "").trim() || null,
        name: String(r["ชื่อ"] ?? r["name"] ?? "").trim(),
        unit: String(r["หน่วย"] ?? r["unit"] ?? "").trim() || null,
        price: Number(String(r["ราคา"] ?? r["price"] ?? 0).replace(/[,\s฿]/g, "")) || 0,
        cost: Number(String(r["ต้นทุน"] ?? r["cost"] ?? 0).replace(/[,\s฿]/g, "")) || 0,
        stock_qty:
          r["คงเหลือ"] === "" || r["คงเหลือ"] == null ? null : Number(r["คงเหลือ"]),
        is_active: String(r["ใช้งาน"] ?? r["active"] ?? "Y").toUpperCase() !== "N",
      }))
      .filter((r) => r.name);
    if (!payload.length) {
      toast.error("ไม่พบข้อมูล");
      return;
    }
    const { error } = await supabase.from(tbl("products") as any).insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(`นำเข้า ${payload.length} รายการ`);
      qc.invalidateQueries({ queryKey: ["rds_products_list", storeId] });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">สินค้า</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportExcel}>ส่งออก Excel</Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importExcel(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium cursor-pointer hover:bg-accent">
              นำเข้า Excel
            </span>
          </label>
          <Button onClick={startNew}>
            <Plus className="h-4 w-4 mr-1" /> เพิ่มสินค้า
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="ค้นหา ชื่อ / รหัส / บาร์โค้ด"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวด</SelectItem>
              {cats?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              <SelectItem value="ok">ปกติ</SelectItem>
              <SelectItem value="low">ต่ำ (≤5)</SelectItem>
              <SelectItem value="out">หมด</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">ไม่พบสินค้า</p>
        ) : (
          <>
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map((p) => {
              const stock = p.stock_qty == null ? null : Number(p.stock_qty);
              return (
                <div key={p.id} className="py-3 flex gap-3">
                  <SignedImg path={p.image_url} alt={p.name} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.sku || "—"}{p.barcode ? ` · ${p.barcode}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {catName(p.category_id)}{p.unit ? ` · ${p.unit}` : ""}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">
                        ฿{Number(p.price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                      {stock == null ? null : stock <= 0 ? (
                        <Badge variant="destructive">หมด</Badge>
                      ) : stock <= 5 ? (
                        <Badge className="bg-amber-500 hover:bg-amber-500">{stock} (ต่ำ)</Badge>
                      ) : (
                        <span className="text-xs">คงเหลือ {stock}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                        <span className="text-muted-foreground">{p.is_active ? "เปิดขาย" : "ปิด"}</span>
                      </div>
                      <div className="flex">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">รูป</th>
                  <th className="py-2 pr-3">รหัส</th>
                  <th className="py-2 pr-3">บาร์โค้ด</th>
                  <th className="py-2 pr-3">ชื่อ</th>
                  <th className="py-2 pr-3">หมวดหมู่</th>
                  <th className="py-2 pr-3">หน่วย</th>
                  <th className="py-2 pr-3 text-right">ราคา</th>
                  <th className="py-2 pr-3 text-right">คงเหลือ</th>
                  <th className="py-2 pr-3 text-center">ใช้งาน</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const stock = p.stock_qty == null ? null : Number(p.stock_qty);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-3"><SignedImg path={p.image_url} alt={p.name} /></td>
                      <td className="py-2 pr-3 font-mono text-xs">{p.sku || "-"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{p.barcode || "-"}</td>
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="py-2 pr-3">{catName(p.category_id)}</td>
                      <td className="py-2 pr-3">{p.unit || "-"}</td>
                      <td className="py-2 pr-3 text-right">{Number(p.price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 pr-3 text-right">
                        {stock == null ? (
                          <span className="text-muted-foreground">-</span>
                        ) : stock <= 0 ? (
                          <Badge variant="destructive">หมด</Badge>
                        ) : stock <= 5 ? (
                          <Badge className="bg-amber-500 hover:bg-amber-500">{stock} (ต่ำ)</Badge>
                        ) : (
                          <span>{stock}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setToDelete(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>รหัสสินค้า</Label>
              <Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="กรอกหรือสแกน" />
            </div>
            <div className="space-y-1">
              <Label>หน่วย</Label>
              <Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>บาร์โค้ด</Label>
              <div className="flex gap-2">
                <Input
                  value={form.barcode ?? ""}
                  inputMode="numeric"
                  placeholder="สแกนหรือพิมพ์เลขบาร์โค้ด (เว้นว่างได้)"
                  onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/[^0-9]/g, "") })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setCameraFocus("barcode"); setCameraOpen(true); }}
                  title="สแกนบาร์โค้ดด้วยกล้อง"
                >
                  <Camera className="h-4 w-4 mr-1" /> สแกน
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // สร้างบาร์โค้ดเองแบบ 13 หลัก ใช้ตัวเลข 0-9 เท่านั้น
                    let code = "2"; // นำหน้าด้วย 2 = in-store use
                    for (let i = 0; i < 12; i++) code += Math.floor(Math.random() * 10);
                    setForm({ ...form, barcode: code });
                  }}
                >
                  <Wand2 className="h-4 w-4 mr-1" /> สร้างรหัส
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">กด "สแกน" เพื่อใช้กล้องอ่านบาร์โค้ด หรือ "สร้างรหัส" เพื่อสร้างเลข 13 หลักอัตโนมัติ</p>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>ชื่อสินค้า *</Label>
              <div className="flex gap-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setCameraFocus("name"); setCameraOpen(true); }}
                  title="สแกนชื่อจากฉลาก (OCR)"
                >
                  <ScanText className="h-4 w-4 mr-1" /> สแกนชื่อ
                </Button>
              </div>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>รูปสินค้า</Label>
              <div className="flex items-start gap-3">
                <div className="h-24 w-24 rounded border border-border bg-muted overflow-hidden flex items-center justify-center">
                  {imgPreview ? (
                    <img src={imgPreview} alt="ตัวอย่างรูปสินค้า" className="h-full w-full object-cover" />
                  ) : form.image_url ? (
                    <SignedImg path={form.image_url} alt={form.name} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">ไม่มีรูป</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (imgPreview) URL.revokeObjectURL(imgPreview);
                        setImgFile(f);
                        setImgPreview(URL.createObjectURL(f));
                      }
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (imgPreview) URL.revokeObjectURL(imgPreview);
                        setImgFile(f);
                        setImgPreview(URL.createObjectURL(f));
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="h-4 w-4 mr-1" /> ถ่ายรูปสินค้า
                  </Button>
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> เลือกรูปจากเครื่อง
                  </Button>
                  {(imgPreview || form.image_url) && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (imgPreview) URL.revokeObjectURL(imgPreview);
                        setImgFile(null);
                        setImgPreview(null);
                        setForm({ ...form, image_url: null });
                      }}
                    >
                      ลบรูป
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">รูปจะถูกบันทึกหลังกด "บันทึก" และแสดงในตารางสินค้า</p>
            </div>
            <div className="space-y-1">
              <Label>หมวดหมู่</Label>
              <Select
                value={form.category_id ?? NONE}
                onValueChange={(v) => setForm({ ...form, category_id: v === NONE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือกหมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— ไม่ระบุ —</SelectItem>
                  {cats?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>สถานะ</Label>
              <div className="h-10 flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <span className="text-sm">{form.is_active ? "ใช้งาน" : "ปิดใช้งาน"}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>ราคา</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>ต้นทุน</Label>
              <Input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>สต็อกคงเหลือ (เว้นว่าง = ไม่นับสต็อก)</Label>
              <Input
                type="number"
                step="1"
                value={form.stock_qty ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stock_qty: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>รายละเอียด</Label>
              <Textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบสินค้า?</AlertDialogTitle>
            <AlertDialogDescription>
              ยืนยันการลบ "{toDelete?.name}" หากสินค้านี้เคยอยู่ในเอกสาร การลบอาจไม่สำเร็จ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        focus={cameraFocus}
        onCapture={(r: CaptureResult) => {
          if (cameraFocus === "barcode" && r.barcode) {
            setForm((f) => ({ ...f, barcode: String(r.barcode).replace(/[^0-9]/g, "") }));
            toast.success("สแกนบาร์โค้ดสำเร็จ");
          } else if (cameraFocus === "name") {
            if (r.name) {
              setForm((f) => ({ ...f, name: r.name! }));
              toast.success("อ่านชื่อสินค้าสำเร็จ");
            } else {
              toast.error("ไม่พบข้อความ กรุณากรอกชื่อสินค้าเอง");
            }
          }
          setCameraOpen(false);
        }}
      />
    </div>
  );
}