import AdminLayout from "@/components/layout/AdminLayout";
import { liveChannel } from "@/lib/realtimeChannel";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Package, Upload, Star, ListChecks, Camera, ScanLine, ScanText, Wand2, FileUp, LayoutGrid, List as ListIcon, RotateCcw, Archive, Link as LinkIcon, AlertTriangle, RefreshCw, ChevronDown, Settings2, X, Crop } from "lucide-react";
import { buildProductUrl, copyToClipboard } from "@/lib/productLink";
import { fmtTHB } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import BulkActionBar from "@/components/BulkActionBar";
import CameraCaptureDialog, { type CaptureResult } from "@/components/products/CameraCaptureDialog";
import PhotoBarcodeDialog from "@/components/PhotoBarcodeDialog";
import SyncStatusCard from "@/components/admin/SyncStatusCard";
import ProductCsvImportDialog from "./ProductCsvImportDialog";
import ProductRelationsSections from "@/components/products/ProductRelationsSections";
import UnitsManagerDialog from "@/components/products/UnitsManagerDialog";
import ImageResizeDialog from "@/components/products/ImageResizeDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tag, ImageOff } from "lucide-react";
import { saveProduct, ProductSaveError } from "@/lib/productSave";
import ProductForm from "@/components/products/ProductForm";

const BUCKET = "product-images";
// Cap the per-product gallery so a single item can't balloon storage costs
// and so the edit dialog grid stays a single scroll-free row on mobile.
const MAX_GALLERY = 5;
// low_stock_threshold defaults to 5 so new products always have a sensible alert level.
const EMPTY = { code: "", barcode: "", name: "", category_id: null as string | null, product_line: "other" as "colorlab" | "print" | "other", description: "", unit: "ชิ้น", image_url: "", stock: 0, low_stock_threshold: 5, cost_price: 0, standard_price: 0, active: true };

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME.includes(file.type)) return "รองรับเฉพาะไฟล์ JPG / PNG / WEBP";
  if (file.size > MAX_IMAGE_BYTES) return "ไฟล์เกิน 10MB — กรุณาย่อรูปก่อนอัปโหลด";
  return null;
}

type Store = { id: string; name: string };

function randomNumericCode(len = 13) {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

async function getSignedImage(path: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

async function compressImage(file: File, maxDim = 1600): Promise<Blob> {
  if (file.size < 1_500_000) return file;
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale); height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("compress fail")), "image/jpeg", 0.85);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function AdminProducts() {
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [gallery, setGallery] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const mainFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFocus, setCameraFocus] = useState<"barcode" | "name" | "full">("full");
  const [photoBcOpen, setPhotoBcOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [shopMap, setShopMap] = useState<Record<string, string[]>>({}); // product_id -> [store_id]
  const [formShopIds, setFormShopIds] = useState<string[]>([]);
  const [shopFilter, setShopFilter] = useState<string>("all"); // 'all' | store_id
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [priceGroups, setPriceGroups] = useState<{ id: string; name: string; markup_percent: number }[]>([]);
  const [groupPriceMap, setGroupPriceMap] = useState<Record<string, Record<string, number>>>({}); // product_id -> group_id -> price
  const [customerPriceCount, setCustomerPriceCount] = useState<Record<string, number>>({});
  // มุมมองราคา: "base" = ราคาฐาน (standard_price), หรือเลือก group id เพื่อดูราคาตามกลุ่ม %
  const [priceView, setPriceView] = useState<string>("base");
  const [showTrash, setShowTrash] = useState(false);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [unitMgrOpen, setUnitMgrOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [migrateCat, setMigrateCat] = useState<null | { cat: { id: string; name: string }; count: number; targetId: string }>(null);
  const [catFilter, setCatFilter] = useState<string>("all");
  // UI-only stock/status filter — reads real `stock` / `low_stock_threshold`, never mutates them.
  // ?status=low จากลิงก์ด่วนบนแดชบอร์ด (all | active | inactive | low | out)
  const initialStatus = (() => {
    const q = new URLSearchParams(window.location.search).get("status");
    return q && ["all", "active", "inactive", "low", "out"].includes(q) ? q : "all";
  })();
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);
  const catImgInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmDel, setConfirmDel] = useState<null | {
    id: string; name: string;
    loading: boolean;
    usage?: { order_item_count: number; document_item_count: number; stock_remaining: number };
    error?: string;
  }>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [imageResizeOpen, setImageResizeOpen] = useState(false);
  const [imageResizeSource, setImageResizeSource] = useState<Blob | string | null>(null);
  // Crop target: "main" (single) or "gallery" (queue). Existing thumb-recrop
  // reuses "main". Files selected from disk / camera route through the crop
  // dialog *before* they hit uploadMain / uploadGallery.
  const [cropTarget, setCropTarget] = useState<"main" | "gallery">("main");
  const [galleryQueue, setGalleryQueue] = useState<File[]>([]);

  function beginMainCrop(fileOrBlob: Blob) {
    const vErr = fileOrBlob instanceof File ? validateImageFile(fileOrBlob) : null;
    if (vErr) { toast.error(vErr); return; }
    setCropTarget("main");
    setImageResizeSource(fileOrBlob);
    setImageResizeOpen(true);
  }
  function beginGalleryCrop(files: FileList) {
    if (!files.length) return;
    for (const f of Array.from(files)) {
      const vErr = validateImageFile(f);
      if (vErr) { toast.error(`${f.name}: ${vErr}`); return; }
    }
    const remaining = Math.max(0, MAX_GALLERY - gallery.length);
    if (remaining <= 0) {
      toast.error(`แกลเลอรีมีรูปครบ ${MAX_GALLERY} รูปแล้ว — กรุณาลบรูปเก่าก่อนอัปโหลดใหม่`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    if (files.length > remaining) toast.warning(`อัปโหลดได้อีก ${remaining} รูปเท่านั้น`);
    setCropTarget("gallery");
    setGalleryQueue(picked);
    setImageResizeSource(picked[0]);
    setImageResizeOpen(true);
  }
  async function handleCroppedMain(blob: Blob) {
    const file = new File([blob], `crop-${Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
    await uploadMain(file);
  }
  async function handleCroppedGallery(blob: Blob) {
    const [head, ...rest] = galleryQueue;
    const name = head?.name?.replace(/\.[^.]+$/, "") || `crop-${Date.now()}`;
    const file = new File([blob], `${name}.jpg`, { type: blob.type || "image/jpeg" });
    await uploadGalleryOne(file);
    if (rest.length) {
      setGalleryQueue(rest);
      setImageResizeSource(rest[0]);
      setImageResizeOpen(true);
    } else {
      setGalleryQueue([]);
    }
  }
  function handleCropConfirm(blob: Blob) {
    if (cropTarget === "gallery") return handleCroppedGallery(blob);
    return handleCroppedMain(blob);
  }
  function handleCropOpenChange(o: boolean) {
    setImageResizeOpen(o);
    if (!o) {
      // Cancel — abandon any remaining gallery queue; ImageCropPanel already
      // revokes its own object URLs on unmount.
      setGalleryQueue([]);
      setImageResizeSource(null);
    }
  }
  function openMainImageResize() {
    if (!form.image_url) return;
    setCropTarget("main");
    setImageResizeSource(form.image_url);
    setImageResizeOpen(true);
  }

  async function generateBarcode() {
    for (let i = 0; i < 10; i++) {
      const code = randomNumericCode(13);
      const { data } = await supabase.from("products").select("id").eq("barcode", code).maybeSingle();
      if (!data) {
        setForm((f: any) => ({ ...f, barcode: code }));
        toast.success("สร้างรหัสแล้ว");
        return;
      }
    }
    toast.error("สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  function groupPriceFor(productId: string, std: number, markup: number, override?: number) {
    if (override != null && !isNaN(override)) return override;
    if (std > 0) return Math.round(std * (1 + markup / 100) * 100) / 100;
    return null;
  }
  // ใช้ตัดสินว่าจะโชว์ราคาไหนใน "ราคาหลัก" ของสินค้าตามที่ผู้ใช้เลือกจาก dropdown มุมมองราคา
  function displayPriceFor(p: any): { label: string; value: number | null } {
    const std = Number(p.standard_price ?? 0);
    if (priceView === "base") return { label: "ราคาฐาน", value: std || null };
    const g = priceGroups.find((x) => x.id === priceView);
    if (!g) return { label: "ราคาฐาน", value: std || null };
    const override = groupPriceMap[p.id]?.[g.id];
    const v = groupPriceFor(p.id, std, Number(g.markup_percent ?? 0), override);
    return { label: `${g.name} (+${g.markup_percent}%)`, value: v };
  }
  function TierPrices({ p, compact = false }: { p: any; compact?: boolean }) {
    const std = Number(p.standard_price ?? 0);
    return (
      <div className={`flex flex-wrap gap-1 ${compact ? "" : "mt-1"}`}>
        {priceGroups.map((g) => {
          const override = groupPriceMap[p.id]?.[g.id];
          const v = groupPriceFor(p.id, std, Number(g.markup_percent ?? 0), override);
          if (v == null) return null;
          return (
            <Badge key={g.id} variant="outline" className="text-[10px]" title={`${g.name} (+${g.markup_percent}%)${override != null ? " · กำหนดเอง" : ""}`}>
              {g.name}: {fmtTHB(v)}{override != null && <span className="ml-0.5">*</span>}
            </Badge>
          );
        })}
        {customerPriceCount[p.id] > 0 && (
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            ราคาลูกค้า {customerPriceCount[p.id]} ราย
          </Badge>
        )}
      </div>
    );
  }

  function openCamera(focus: "barcode" | "name" | "full") {
    setCameraFocus(focus); setCameraOpen(true);
  }

  async function handleCapture(r: CaptureResult) {
    if (cameraFocus === "barcode") {
      const bc = (r.barcode || "").replace(/\D/g, "");
      if (bc) {
        const { data: dupe } = await supabase.from("products").select("id,name").eq("barcode", bc).maybeSingle();
        if (dupe && dupe.id !== editing) {
          toast.error(`บาร์โค้ดนี้มีอยู่แล้ว: ${dupe.name}`);
        } else {
          setForm((f: any) => ({ ...f, barcode: bc }));
          toast.success("สแกนบาร์โค้ดสำเร็จ");
        }
      } else {
        toast.error("ไม่พบบาร์โค้ด กรุณากรอกเอง");
      }
    } else if (cameraFocus === "name") {
      if (r.name && r.name.trim()) {
        setForm((f: any) => ({ ...f, name: r.name }));
        toast.success("อ่านชื่อสินค้าสำเร็จ");
      } else {
        toast.error("ไม่พบข้อความ กรุณากรอกชื่อสินค้าเอง");
      }
    } else if (cameraFocus === "full" && r.file) {
      beginMainCrop(r.file);
    }
  }

  async function load() {
    setLoadingList(true);
    setLoadError(null);
    const errors: string[] = [];
    try {
      const [productsRes, categoriesRes, costsRes, shopsRes, priceGroupsRes, groupPricesRes, customerPricesRes] = await Promise.all([
        supabase.from("products").select("*, categories(name)")
          .filter("deleted_at", showTrash ? "not.is" : "is", null)
          .order("name"),
        supabase.from("categories").select("*").order("name"),
        supabase.from("product_costs").select("product_id, cost_price"),
        supabase.from("product_shops").select("product_id, store_id"),
        supabase.from("price_groups").select("id, name, markup_percent").order("name"),
        supabase.from("group_prices").select("product_id, price_group_id, price"),
        supabase.from("customer_prices").select("product_id"),
      ]);

      if (productsRes.error) {
        errors.push("สินค้า");
        setItems([]);
      } else {
        if (costsRes.error) errors.push("ต้นทุน");
        const costRows = costsRes.error ? [] : (costsRes.data ?? []);
        const costMap = new Map(costRows.map((x: any) => [x.product_id, Number(x.cost_price)]));
        setItems(((productsRes.data as any[]) ?? []).map((x: any) => ({ ...x, cost_price: costMap.get(x.id) ?? 0 })));
      }

      if (categoriesRes.error) { errors.push("หมวดหมู่"); setCats([]); }
      else setCats(categoriesRes.data ?? []);

      if (shopsRes.error) { errors.push("ร้านที่วางขาย"); setShopMap({}); }
      else {
        const map: Record<string, string[]> = {};
        for (const row of shopsRes.data ?? []) {
          (map[row.product_id] ||= []).push(row.store_id);
        }
        setShopMap(map);
      }

      if (priceGroupsRes.error) { errors.push("กลุ่มราคา"); setPriceGroups([]); }
      else setPriceGroups((priceGroupsRes.data ?? []) as any);

      if (groupPricesRes.error) { errors.push("ราคากลุ่ม"); setGroupPriceMap({}); }
      else {
        const gpm: Record<string, Record<string, number>> = {};
        for (const r of (groupPricesRes.data ?? []) as any[]) {
          (gpm[r.product_id] ||= {})[r.price_group_id] = Number(r.price);
        }
        setGroupPriceMap(gpm);
      }

      if (customerPricesRes.error) { errors.push("ราคาลูกค้า"); setCustomerPriceCount({}); }
      else {
        const cpc: Record<string, number> = {};
        for (const r of (customerPricesRes.data ?? []) as any[]) cpc[r.product_id] = (cpc[r.product_id] ?? 0) + 1;
        setCustomerPriceCount(cpc);
      }

      if (errors.length) setLoadError(`โหลดข้อมูล${errors.join(" / ")}ไม่สำเร็จบางส่วน กรุณากดโหลดใหม่`);
    } catch (e: any) {
      setItems([]);
      setLoadError(e?.message || "โหลดหน้าสินค้าไม่สำเร็จ กรุณากดโหลดใหม่");
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => {
    load();
    void (async () => {
      try {
        const { data, error } = await supabase.from("rds_stores").select("id,name").order("name");
        if (error) setLoadError((prev) => prev || "โหลดรายชื่อร้านไม่สำเร็จบางส่วน กรุณากดโหลดใหม่");
        setStores((data as any) ?? []);
      } catch {
        setLoadError((prev) => prev || "โหลดรายชื่อร้านไม่สำเร็จบางส่วน กรุณากดโหลดใหม่");
      }
    })();
    const ch = liveChannel("admin-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_costs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_shops" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [showTrash]);

  const filtered = items.filter(i => {
    if (shopFilter !== "all") {
      const sids = shopMap[i.id] || [];
      if (!sids.includes(shopFilter)) return false;
    }
    if (catFilter !== "all") {
      if (catFilter === "__none__") { if (i.category_id) return false; }
      else if (i.category_id !== catFilter) return false;
    }
    if (statusFilter !== "all") {
      const st = Number(i.stock ?? 0);
      const th = Number(i.low_stock_threshold ?? 0);
      if (statusFilter === "active" && !i.active) return false;
      if (statusFilter === "inactive" && i.active) return false;
      if (statusFilter === "out" && st > 0) return false;
      if (statusFilter === "low" && !(st > 0 && st <= th)) return false;
    }
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (i.name || "").toLowerCase().includes(s) ||
      (i.code || "").toLowerCase().includes(s) ||
      (i.barcode || "").toLowerCase().includes(s)
    );
  });
  const bulk = useBulkSelect(filtered);

  // Map: category_id -> true when that category has NO uploaded image.
  // Used to render a "ยังไม่มีรูปหมวดหมู่" badge next to the category name
  // in the products list so admins can spot categories that still need art.
  const catMissingImg = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const c of cats) {
      const imgs = Array.isArray((c as any).image_urls) ? (c as any).image_urls : [];
      if (!imgs.length) m[c.id] = true;
    }
    return m;
  }, [cats]);

  // Live duplicate-check for the product `code` field. Fires from the input
  // onBlur and again inside save() so the user sees the collision *before*
  // clicking Save AND we still block the write if they ignore the warning.
  const [codeDupeMsg, setCodeDupeMsg] = useState<string | null>(null);
  // Live ref so we can pull focus back to the code input the moment a
  // duplicate is detected — matches the aria-live announcement.
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  async function checkCodeDuplicate(code: string): Promise<string | null> {
    const c = (code || "").trim();
    if (!c) return null;
    const { data } = await supabase
      .from("products")
      .select("id, name")
      .eq("code", c)
      .maybeSingle();
    if (data && data.id !== editing) {
      return `รหัส "${c}" ซ้ำกับสินค้า "${data.name}" — กรุณาเปลี่ยนรหัสใหม่ หรือเว้นว่างเพื่อให้ระบบสร้างให้อัตโนมัติ`;
    }
    return null;
  }

  async function loadGallery(productId: string) {
    const { data } = await supabase.from("product_images")
      .select("id, url, storage_path, is_primary, status")
      .eq("product_id", productId).order("created_at", { ascending: false });
    setGallery(data ?? []);
  }

  async function save() {
    // Route every write through the shared saveProduct helper so this page
    // behaves identically to POS Quick Add / PosStock (unit-tested parity).
    if (formShopIds.length === 0) {
      return toast.error("กรุณาเลือกอย่างน้อย 1 ร้านที่จะวางขายสินค้านี้");
    }
    let nextAutoCode: string | undefined;
    if (!editing) {
      const { data: peek } = await supabase.rpc("peek_next_fy_code");
      if (typeof peek === "string") nextAutoCode = peek;
    }
    try {
      await saveProduct({
        mode: editing ? "update" : "create",
        productId: editing || undefined,
        values: {
          code: form.code,
          barcode: form.barcode,
          name: form.name,
          category_id: form.category_id ?? null,
          product_line: (form as any).product_line ?? "other",
          unit: form.unit,
          description: form.description,
          stock: Number(form.stock) || 0,
          low_stock_threshold: Number(form.low_stock_threshold) || 0,
          cost_price: Number(form.cost_price) || 0,
          standard_price: Number(form.standard_price) || 0,
          active: form.active,
          image_url: form.image_url ?? null,
        },
        shopIds: formShopIds,
        nextAutoCode,
      });
    } catch (e) {
      if (e instanceof ProductSaveError) {
        if (e.field === "code") {
          setCodeDupeMsg(e.message);
          requestAnimationFrame(() => {
            codeInputRef.current?.focus();
            codeInputRef.current?.select();
          });
        }
        return toast.error(e.message);
      }
      return toast.error((e as Error)?.message || "บันทึกไม่สำเร็จ");
    }
    toast.success("บันทึกแล้ว"); setOpen(false); setForm(EMPTY); setEditing(null); setFormShopIds([]); load();
  }

  function askDelete(p: any) {
    setConfirmDel({ id: p.id, name: p.name || "-", loading: true });
    supabase.rpc("admin_product_usage", { p_id: p.id }).then(({ data, error }) => {
      if (error) {
        setConfirmDel((c) => c && c.id === p.id ? { ...c, loading: false, error: error.message } : c);
        return;
      }
      const u = data as any;
      setConfirmDel((c) => c && c.id === p.id ? { ...c, loading: false, usage: {
        order_item_count: Number(u?.order_item_count ?? 0),
        document_item_count: Number(u?.document_item_count ?? 0),
        stock_remaining: Number(u?.stock_remaining ?? 0),
      }} : c);
    });
  }

  async function confirmSoftDelete() {
    if (!confirmDel) return;
    const id = confirmDel.id;
    const { error } = await supabase.rpc("admin_soft_delete_products", { p_ids: [id] });
    if (error) { toast.error(error.message); return; }
    toast.success("ย้ายไปถังขยะแล้ว — กู้คืนได้จากแท็บถังขยะ");
    setConfirmDel(null); load();
  }

  async function restoreOne(id: string) {
    const { error } = await supabase.rpc("admin_restore_products", { p_ids: [id] });
    if (error) return toast.error(error.message);
    toast.success("กู้คืนสินค้าแล้ว"); load();
  }

  async function bulkDelete() {
    const ids = bulk.selectedArray;
    if (!ids.length) return;
    const fn = showTrash ? "admin_restore_products" : "admin_soft_delete_products";
    const { error } = await supabase.rpc(fn, { p_ids: ids });
    if (error) return toast.error(error.message);
    toast.success(`${showTrash ? "กู้คืน" : "ย้ายไปถังขยะ"}แล้ว ${ids.length} รายการ`);
    bulk.exit(); load();
  }

  // Bulk-set product_line (สายงาน) on all selected products in one round-trip.
  // Used with the floating "กำหนดสายงาน" card that appears in select mode.
  const [bulkLineValue, setBulkLineValue] = useState<"colorlab" | "print" | "other">("colorlab");
  const [bulkLineBusy, setBulkLineBusy] = useState(false);
  async function bulkSetProductLine() {
    const ids = bulk.selectedArray;
    if (!ids.length) return;
    setBulkLineBusy(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ product_line: bulkLineValue } as any)
        .in("id", ids);
      if (error) { toast.error(error.message); return; }
      toast.success(`กำหนดสายงานเป็น "${bulkLineValue === "colorlab" ? "คัลเลอร์แล็ป" : bulkLineValue === "print" ? "การพิมพ์" : "อื่นๆ"}" ให้ ${ids.length} รายการแล้ว`);
      bulk.exit();
      load();
    } finally {
      setBulkLineBusy(false);
    }
  }

  async function deleteAllProducts() {
    const total = items.length;
    if (!total) return toast.info("ไม่มีสินค้าให้ลบ");
    const typed = prompt(
      `ยืนยันลบสินค้าทั้งหมด ${total} รายการ?\n` +
      `การลบนี้จะลบสินค้าจากทุกร้าน และไม่สามารถย้อนกลับได้\n\n` +
      `พิมพ์คำว่า  ลบทั้งหมด  เพื่อยืนยัน`
    );
    if (typed?.trim() !== "ลบทั้งหมด") return;
    const { error } = await supabase.from("products").delete().not("id", "is", null);
    if (error) return toast.error(error.message);
    toast.success(`ลบสินค้าทั้งหมด ${total} รายการแล้ว — นำเข้าใหม่ได้เลย`);
    bulk.exit(); load();
  }

  async function addCategory() {
    const name = prompt("ชื่อหมวดหมู่ใหม่");
    if (!name) return;
    await supabase.from("categories").insert({ name }); load();
  }

  async function renameCategory(cat: { id: string; name: string }) {
    const name = prompt("แก้ไขชื่อหมวดหมู่", cat.name)?.trim();
    if (!name || name === cat.name) return;
    const { error } = await supabase.from("categories").update({ name }).eq("id", cat.id);
    if (error) return toast.error(error.message);
    toast.success("แก้ไขชื่อหมวดหมู่แล้ว"); load();
  }

  async function deleteCategory(cat: { id: string; name: string }) {
    const used = items.filter((x) => x.category_id === cat.id).length;
    if (used > 0) {
      // Force explicit choice: move to another category, or clear the category.
      setMigrateCat({ cat, count: used, targetId: "__none__" });
      return;
    }
    if (!confirm(`ลบหมวดหมู่ "${cat.name}" ?`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) return toast.error(error.message);
    toast.success("ลบหมวดหมู่แล้ว"); load();
  }

  async function confirmMigrateAndDelete() {
    if (!migrateCat) return;
    const { cat, targetId } = migrateCat;
    const target = targetId === "__none__" ? null : targetId;
    const { error: ue } = await supabase.from("products").update({ category_id: target }).eq("category_id", cat.id);
    if (ue) return toast.error(ue.message);
    const { error } = await supabase.from("categories").delete().eq("id", cat.id);
    if (error) return toast.error(error.message);
    toast.success(target ? `ย้ายสินค้าไปหมวดใหม่และลบ "${cat.name}" แล้ว` : `ยกเลิกหมวดของสินค้าและลบ "${cat.name}" แล้ว`);
    setMigrateCat(null); load();
  }

  async function createCategoryInline() {
    const name = newCatName.trim();
    if (!name) return;
    const { error } = await supabase.from("categories").insert({ name });
    if (error) return toast.error(error.message);
    setNewCatName(""); toast.success("เพิ่มหมวดหมู่แล้ว"); load();
  }

  async function uploadCategoryImages(catId: string, files: FileList) {
    const cat = cats.find((c) => c.id === catId);
    if (!cat) return;
    const existing: string[] = Array.isArray(cat.image_urls) ? cat.image_urls : [];
    const remaining = 5 - existing.length;
    if (remaining <= 0) { toast.error("รูปภาพหมวดครบ 5 รูปแล้ว"); return; }
    setUploadingCatId(catId);
    try {
      const toUpload = Array.from(files).slice(0, remaining);
      const next = [...existing];
      for (const file of toUpload) {
        const blob = await compressImage(file, 1200);
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `categories/${catId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
        if (error) throw error;
        const url = await getSignedImage(path);
        if (url) next.push(url);
      }
      const { error: ue } = await supabase.from("categories").update({ image_urls: next }).eq("id", catId);
      if (ue) throw ue;
      toast.success(`อัปโหลด ${toUpload.length} รูปแล้ว`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploadingCatId(null);
    }
  }

  async function removeCategoryImage(catId: string, url: string) {
    const cat = cats.find((c) => c.id === catId);
    if (!cat) return;
    const next = ((cat.image_urls || []) as string[]).filter((u) => u !== url);
    const { error } = await supabase.from("categories").update({ image_urls: next }).eq("id", catId);
    if (error) return toast.error(error.message);
    toast.success("ลบรูปแล้ว"); load();
  }

  async function ensureProductIdForUpload(): Promise<string | null> {
    if (editing) return editing;
    if (!form.code || !form.name) { toast.error("กรอกรหัสและชื่อก่อนอัปโหลดรูป"); return null; }
    const { cost_price, categories: _c, ...rest } = form as any;
    const payload = { ...rest, barcode: (form.barcode || "").trim() || null, stock: Number(form.stock) || 0, standard_price: Number(form.standard_price) || 0, low_stock_threshold: Number(form.low_stock_threshold) || 0 };
    const { data, error } = await supabase.from("products").insert(payload).select("id").single();
    if (error) { toast.error(error.message); return null; }
    setEditing(data.id);
    return data.id;
  }

  async function uploadMain(file: File) {
    const vErr = validateImageFile(file);
    if (vErr) return toast.error(vErr);
    const pid = await ensureProductIdForUpload(); if (!pid) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${pid}/main-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
      if (error) throw error;
      const signed = await getSignedImage(path);
      if (!signed) throw new Error("ไม่สามารถสร้างลิงก์รูปได้");
      await supabase.from("products").update({ image_url: signed }).eq("id", pid);
      setForm((f: any) => ({ ...f, image_url: signed }));
      toast.success("อัปโหลดรูปหลักแล้ว");
      load();
    } catch (e: any) { toast.error(e.message); }
    setUploading(false);
  }

  async function uploadGallery(files: FileList) {
    for (const f of Array.from(files)) {
      const vErr = validateImageFile(f);
      if (vErr) return toast.error(`${f.name}: ${vErr}`);
    }
    const pid = await ensureProductIdForUpload(); if (!pid) return;
    const remaining = Math.max(0, MAX_GALLERY - gallery.length);
    if (remaining <= 0) {
      toast.error(`แกลเลอรีมีรูปครบ ${MAX_GALLERY} รูปแล้ว — กรุณาลบรูปเก่าก่อนอัปโหลดใหม่`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`อัปโหลดได้อีก ${remaining} รูปเท่านั้น (สูงสุด ${MAX_GALLERY} รูปต่อสินค้า)`);
    }
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    let ok = 0;
    for (const file of picked) {
      try {
        const blob = await compressImage(file);
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${pid}/gallery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: ue } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
        if (ue) throw ue;
        const signed = await getSignedImage(path);
        if (!signed) throw new Error("ไม่สามารถสร้างลิงก์รูปได้");
        const { error: ie } = await supabase.from("product_images").insert({
          product_id: pid, url: signed, storage_path: path,
          uploaded_by: user?.id, status: "approved", is_primary: false,
        });
        if (ie) throw ie;
        ok++;
      } catch (e: any) { toast.error(e.message); }
    }
    if (ok) toast.success(`อัปโหลด ${ok} รูป`);
    await loadGallery(pid);
    setUploading(false);
  }

  // Single-file gallery upload used by the crop-then-upload queue. Reuses
  // the same validation/storage path as uploadGallery but skips the
  // multi-file bookkeeping (we already ran it in beginGalleryCrop).
  async function uploadGalleryOne(file: File) {
    const vErr = validateImageFile(file);
    if (vErr) return toast.error(vErr);
    const pid = await ensureProductIdForUpload(); if (!pid) return;
    if (gallery.length >= MAX_GALLERY) {
      toast.error(`แกลเลอรีมีรูปครบ ${MAX_GALLERY} รูปแล้ว`);
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const blob = await compressImage(file);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${pid}/gallery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error: ue } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
      if (ue) throw ue;
      const signed = await getSignedImage(path);
      if (!signed) throw new Error("ไม่สามารถสร้างลิงก์รูปได้");
      const { error: ie } = await supabase.from("product_images").insert({
        product_id: pid, url: signed, storage_path: path,
        uploaded_by: user?.id, status: "approved", is_primary: false,
      });
      if (ie) throw ie;
      toast.success("อัปโหลดรูปแล้ว");
      await loadGallery(pid);
    } catch (e: any) { toast.error(e.message); }
    setUploading(false);
  }

  async function setAsPrimary(img: any) {
    if (!editing) return;
    await supabase.from("product_images").update({ is_primary: false }).eq("product_id", editing);
    await supabase.from("product_images").update({ is_primary: true }).eq("id", img.id);
    await supabase.from("products").update({ image_url: img.url }).eq("id", editing);
    setForm((f: any) => ({ ...f, image_url: img.url }));
    toast.success("ตั้งเป็นรูปหลักแล้ว");
    await loadGallery(editing);
    load();
  }

  async function deleteImage(img: any) {
    if (!confirm("ลบรูปนี้?")) return;
    if (img.storage_path) await supabase.storage.from(BUCKET).remove([img.storage_path]);
    await supabase.from("product_images").delete().eq("id", img.id);
    if (editing) await loadGallery(editing);
  }

  function openEdit(p: any) {
    setForm(p); setEditing(p.id); setOpen(true);
    setFormShopIds(shopMap[p.id] || []);
    loadGallery(p.id);
  }
  function openNew() {
    setForm(EMPTY); setEditing(null); setGallery([]); setOpen(true);
    setFormShopIds(stores.map((s) => s.id)); // default: ทั้งสองร้าน
    // Next FY-code preview is handled inside ProductForm (peek_next_fy_code).
  }

  // -----------------------------------------------------------------------
  // Editor body — the SAME <ProductForm /> component used by POS Quick Add
  // and PosStock. Admin-only image gallery lives in `headerSlot`; SKU /
  // wholesale / related-products live in `advancedSlot`. This guarantees
  // add/edit UI + buttons look and behave identically on every entry point.
  // -----------------------------------------------------------------------
  const imagesHeaderSlot = (
    <section className="space-y-3" data-testid="section-images">
      <h3 className="text-sm text-muted-foreground border-b pb-1">รูปสินค้า</h3>
      {!editing ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          บันทึกสินค้าก่อน จึงจะอัปโหลดรูปหลัก / แกลเลอรี ({MAX_GALLERY} รูป) ได้
        </div>
      ) : (
        <>
          <div>
            <Label>รูปหลัก</Label>
            <div className="mt-1 flex items-start gap-3">
              <button
                type="button"
                onClick={openMainImageResize}
                disabled={!form.image_url}
                className="w-28 h-28 rounded-md bg-accent/40 border border-border grid place-items-center overflow-hidden shrink-0 relative group cursor-pointer disabled:cursor-default"
                title={form.image_url ? "ปรับขนาดรูปภาพ" : "ยังไม่มีรูปหลัก"}
                data-testid="main-image-thumb"
                aria-label={form.image_url ? "ปรับขนาดรูปภาพหลัก" : "รูปหลัก"}
              >
                {form.image_url
                  ? <img src={form.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" />
                  : <Package className="w-8 h-8 text-primary/40" />}
                {form.image_url && (
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition flex items-center justify-center text-white text-xs gap-1">
                    <Crop className="w-4 h-4" /> ปรับขนาด
                  </span>
                )}
              </button>
              <div className="flex flex-col gap-2">
                <input ref={mainFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) beginMainCrop(f); e.target.value = ""; }} data-testid="main-file-input" />
                <Button type="button" variant="outline" className="rounded-md min-h-11" disabled={uploading} onClick={() => openCamera("full")}>
                  <Camera className="w-4 h-4 mr-1" /> ถ่ายรูปสินค้า
                </Button>
                <Button type="button" variant="outline" className="rounded-md min-h-11" disabled={uploading} onClick={() => mainFileRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> เลือกรูปจากเครื่อง
                </Button>
                {form.image_url && <Button type="button" variant="ghost" size="sm" className="text-destructive min-h-11" onClick={() => setForm((f: any) => ({ ...f, image_url: "" }))}>ล้างรูปหลัก</Button>}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>
                แกลเลอรีรูปเพิ่มเติม{" "}
                <span className="text-[11px] text-muted-foreground font-normal" data-testid="gallery-counter">
                  ({gallery.length}/{MAX_GALLERY})
                </span>
              </Label>
              <input ref={galleryFileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) beginGalleryCrop(e.target.files); e.target.value = ""; }} data-testid="gallery-file-input" />
              <Button
                type="button" variant="outline" size="sm" className="rounded-md min-h-11"
                disabled={uploading || gallery.length >= MAX_GALLERY}
                onClick={() => galleryFileRef.current?.click()}
                data-testid="gallery-upload-btn"
                title={gallery.length >= MAX_GALLERY ? `ครบ ${MAX_GALLERY} รูปแล้ว` : undefined}
              >
                <Upload className="w-4 h-4 mr-1" />
                {gallery.length >= MAX_GALLERY ? "ครบจำนวน" : "อัปโหลดหลายรูป"}
              </Button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
              {gallery.map(g => (
                <div key={g.id} className="relative group aspect-square rounded-md overflow-hidden border border-border">
                  <img src={g.url} alt="รูปสินค้า" className="w-full h-full object-cover" />
                  {g.is_primary && <Badge className="absolute top-1 left-1 bg-primary text-[10px]">หลัก</Badge>}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => setAsPrimary(g)} title="ตั้งเป็นรูปหลัก"><Star className="w-3.5 h-3.5" /></Button>
                    <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => deleteImage(g)} title="ลบ"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
              {gallery.length === 0 && <div className="col-span-full text-xs text-muted-foreground py-2">ยังไม่มีรูปในแกลเลอรี</div>}
            </div>
          </div>
        </>
      )}
    </section>
  );

  function EditorPanelHeader({ onClose }: { onClose?: () => void }) {
    return (
      <div className="sticky top-0 z-10 bg-success text-success-foreground rounded-t-md">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs opacity-90">ตัวจัดการสินค้า</div>
            <div className="text-lg font-bold truncate" data-testid="product-panel-title">
              {editing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button" size="sm" variant="ghost"
                className="text-success-foreground hover:bg-white/10 min-h-11 px-2"
                aria-label="ตัวเลือกเพิ่มเติม"
                data-testid="panel-menu-trigger"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setCatMgrOpen(true)}>
                <Tag className="w-4 h-4 mr-2" /> จัดการหมวดหมู่
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setUnitMgrOpen(true)}>
                <ListChecks className="w-4 h-4 mr-2" /> จัดการหน่วยนับ
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {editing && (
                <DropdownMenuItem
                  onSelect={async () => {
                    const url = buildProductUrl({ id: editing, code: form.code });
                    const ok = await copyToClipboard(url);
                    if (ok) toast.success("คัดลอกลิงก์สินค้าแล้ว");
                    else toast.error("คัดลอกไม่สำเร็จ");
                  }}
                >
                  <LinkIcon className="w-4 h-4 mr-2" /> คัดลอกลิงก์สินค้า
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => { setForm(EMPTY); setEditing(null); setGallery([]); setFormShopIds(stores.map((s) => s.id)); }}>
                <RotateCcw className="w-4 h-4 mr-2" /> รีเซ็ตฟอร์ม
              </DropdownMenuItem>
              {editing && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => askDelete({ id: editing, name: form.name })}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> ลบสินค้า
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose && (
            <Button
              type="button" size="icon" variant="ghost"
              className="text-success-foreground hover:bg-white/10 min-h-11 min-w-11"
              onClick={onClose} aria-label="ปิด" data-testid="panel-close-btn"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  const editorBody = (
    <div className="flex-1 overflow-y-auto p-4" data-testid="product-editor-fields">
      <ProductForm
        key={editing ?? "new"}
        mode={editing ? "update" : "create"}
        productId={editing ?? undefined}
        initialValues={{
          code: form.code || "",
          barcode: form.barcode || "",
          name: form.name || "",
          category_id: form.category_id ?? null,
          product_line: (form as any).product_line ?? "other",
          unit: form.unit || "ชิ้น",
          description: form.description || "",
          stock: Number(form.stock) || 0,
          low_stock_threshold: Number(form.low_stock_threshold) || 5,
          cost_price: Number(form.cost_price) || 0,
          standard_price: Number(form.standard_price) || 0,
          active: form.active ?? true,
          image_url: form.image_url ?? null,
        }}
        initialShopIds={formShopIds}
        imageUrl={form.image_url ?? null}
        submitLabel={editing ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
        headerSlot={imagesHeaderSlot}
        advancedSlot={
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground flex items-center gap-2">
              <Settings2 className="w-4 h-4 shrink-0" />
              <span>รายละเอียดเพิ่มเติม (หมวดหมู่ / หน่วยนับ) — เลือกได้จากเมนู ▾ ด้านบน</span>
            </div>
            <ProductRelationsSections productId={editing} />
          </div>
        }
        onSaved={(saved) => {
          toast.success(editing ? "บันทึกแล้ว" : `เพิ่ม "${saved.name}" แล้ว`);
          setOpen(false);
          setForm(EMPTY);
          setEditing(null);
          setFormShopIds([]);
          setGallery([]);
          load();
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );

  const editorEmptyState = (
    <div className="flex-1 grid place-items-center p-8 text-center">
      <div>
        <div className="mx-auto mb-3 w-14 h-14 rounded-md bg-primary/10 text-primary grid place-items-center">
          <Package className="w-7 h-7" />
        </div>
        <div className="text-base font-semibold">เลือกสินค้าเพื่อดูรายละเอียด</div>
        <p className="text-sm text-muted-foreground mt-1">
          คลิกที่แถวสินค้าด้านซ้ายเพื่อแก้ไข หรือกด <b>+ เพิ่มสินค้า</b>
        </p>
        <Button className="mt-4 rounded-md bg-gradient-primary text-primary-foreground min-h-11" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> เพิ่มสินค้า
        </Button>
      </div>
    </div>
  );

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        className="ng-btn-brand rounded-lg"
        onClick={openNew}
        data-testid="add-product-btn"
      >
        <Plus className="w-4 h-4 sm:mr-1" />
        <span className="hidden sm:inline">เพิ่มสินค้า</span>
      </Button>
      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setImportOpen(true)}>
        <FileUp className="w-4 h-4 sm:mr-1" />
        <span className="hidden sm:inline">นำเข้า</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="rounded-lg px-2" aria-label="เมนูเพิ่มเติม" data-testid="products-more-menu">
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => (bulk.selectMode ? bulk.exit() : bulk.setSelectMode(true))}>
            <ListChecks className="w-4 h-4 mr-2" /> {bulk.selectMode ? "ออกจากโหมดเลือก" : "เลือกหลายรายการ"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCatMgrOpen(true)}>
            <Tag className="w-4 h-4 mr-2" /> จัดการหมวดหมู่
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setUnitMgrOpen(true)} data-testid="open-units-manager">
            <ListChecks className="w-4 h-4 mr-2" /> จัดการหน่วยนับ
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/admin/imports"><Upload className="w-4 h-4 mr-2" /> ประวัตินำเข้า</a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { bulk.exit(); setShowTrash((v) => !v); }}>
            <Archive className="w-4 h-4 mr-2" /> {showTrash ? "ดูสินค้าที่ใช้งาน" : "ถังขยะ"}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void deleteAllProducts()}>
            <Trash2 className="w-4 h-4 mr-2" /> ลบสินค้าทั้งหมด
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <AdminLayout actions={headerActions}>
      <div className="lg:grid lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] lg:gap-4 lg:items-start">
      <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-lg font-bold sm:text-xl" data-testid="admin-products-heading">
          สต๊อกสินค้า (เต็มรูปแบบ)
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          เพิ่ม แก้ไข ปิดใช้งาน และปรับจำนวนสำหรับ POS และหน้าร้านออนไลน์
          {showTrash ? " · กำลังดูถังขยะ" : ""}
        </p>
      </div>
      {/* Summary strip — shared catalog counters (พร้อมขาย / ใกล้หมด / หมด). */}
      {(() => {
        const active = items.filter((x) => x.active && !x.deleted_at);
        const outOfStock = active.filter((x) => Number(x.stock ?? 0) <= 0).length;
        const low = active.filter((x) => {
          const s = Number(x.stock ?? 0);
          const t = Number(x.low_stock_threshold ?? 0);
          return s > 0 && t > 0 && s <= t;
        }).length;
        const ready = active.length - outOfStock;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4" data-testid="products-summary">
            <div className="ng-card p-3">
              <div className="text-[11px] text-muted-foreground">พร้อมขาย</div>
              <div className="text-xl font-bold text-primary">{ready}</div>
            </div>
            <div className="ng-card p-3">
              <div className="text-[11px] text-muted-foreground">ใกล้หมด</div>
              <div className="text-xl font-bold text-amber-600">{low}</div>
            </div>
            <div className="ng-card p-3">
              <div className="text-[11px] text-muted-foreground">หมด</div>
              <div className="text-xl font-bold text-destructive">{outOfStock}</div>
            </div>
            <div className="ng-card p-3">
              <div className="text-[11px] text-muted-foreground">ทั้งหมด</div>
              <div className="text-xl font-bold">{active.length}</div>
            </div>
          </div>
        );
      })()}
      <div className="ng-toolbar flex flex-wrap gap-2 items-center mb-4 p-2">
        <Input placeholder="ค้นหา ชื่อ / รหัส / บาร์โค้ด..." value={q} onChange={(e) => setQ(e.target.value)} className="rounded-lg min-w-[180px] flex-1 max-w-md" />
        <Select value={shopFilter} onValueChange={setShopFilter}>
          <SelectTrigger className="rounded-xl w-56"><SelectValue placeholder="กรองร้าน" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกร้าน</SelectItem>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="rounded-xl w-56"><SelectValue placeholder="กรองหมวดหมู่" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกหมวดหมู่</SelectItem>
            <SelectItem value="__none__">— ไม่มีหมวดหมู่ —</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priceView} onValueChange={setPriceView}>
          <SelectTrigger className="rounded-xl w-full sm:w-56" title="เลือกมุมมองราคา"><SelectValue placeholder="มุมมองราคา" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="base">ราคาฐาน (มาตรฐาน)</SelectItem>
            {priceGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name} (+{g.markup_percent}%)</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="rounded-xl w-full sm:w-56" data-testid="product-status-filter" aria-label="กรองสถานะสินค้า">
            <SelectValue placeholder="กรองสถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            <SelectItem value="active">เปิดขาย</SelectItem>
            <SelectItem value="inactive">ปิดขาย</SelectItem>
            <SelectItem value="low">ใกล้หมด</SelectItem>
            <SelectItem value="out">หมดสต๊อก</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto hidden md:inline-flex rounded-xl border border-border overflow-hidden">
          <Button type="button" variant={viewMode === "grid" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("grid")}>
            <LayoutGrid className="w-4 h-4 mr-1" /> รูปภาพ
          </Button>
          <Button type="button" variant={viewMode === "table" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("table")}>
            <ListIcon className="w-4 h-4 mr-1" /> ตาราง
          </Button>
        </div>
      </div>
      {/* Category quick-chips (mobile-first, scrollable). Tap to filter. */}
      <div className="-mx-2 md:mx-0 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 px-2 md:px-0 snap-x">
          <button
            type="button"
            onClick={() => setCatFilter("all")}
            className={`shrink-0 snap-start rounded-xl border px-3 py-2 text-xs flex items-center gap-2 min-w-[92px] ${catFilter === "all" ? "border-primary bg-primary/10 font-semibold" : "border-border bg-card"}`}
          >
            <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center"><LayoutGrid className="w-4 h-4 text-primary/70" /></div>
            <span>ทั้งหมด<div className="text-[10px] text-muted-foreground font-normal">{items.length} รายการ</div></span>
          </button>
          {cats.map((c) => {
            const thumb = Array.isArray(c.image_urls) && c.image_urls[0];
            const count = items.filter((x) => x.category_id === c.id).length;
            const active = catFilter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatFilter(c.id)}
                className={`shrink-0 snap-start rounded-xl border px-3 py-2 text-xs flex items-center gap-2 min-w-[112px] ${active ? "border-primary bg-primary/10 font-semibold" : "border-border bg-card"}`}
                title={c.name}
              >
                <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center overflow-hidden">
                  {thumb
                    ? <img src={thumb} alt={c.name} className="w-full h-full object-cover" />
                    : <Tag className="w-4 h-4 text-primary/70" />}
                </div>
                <span className="text-left min-w-0"><div className="truncate max-w-[100px]">{c.name}</div><div className="text-[10px] text-muted-foreground font-normal">{count} รายการ</div></span>
              </button>
            );
          })}
        </div>
      </div>
      <SyncStatusCard />
      {loadError && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {loadError}</span>
          <Button size="sm" variant="outline" className="h-8 rounded-lg shrink-0" onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> โหลดใหม่
          </Button>
        </div>
      )}
      {loadingList && (
        <div className="min-h-[280px] grid place-items-center text-sm text-muted-foreground" role="status" aria-live="polite">
          <div className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> กำลังโหลดสินค้า...</div>
        </div>
      )}
      {/* Desktop / Tablet: Image Grid (5 cols) */}
      {!loadingList && viewMode === "grid" && (
        <div className="hidden md:grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => openEdit(p)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(p); } }}
              className="group bg-card rounded-2xl border border-border shadow-card overflow-hidden flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="product-grid-card"
            >
              <div className="relative aspect-square bg-accent/40">
                {bulk.selectMode && (
                  <div className="absolute top-2 left-2 z-10 bg-background/80 rounded-md p-1">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={bulk.ids.has(p.id)} onCheckedChange={() => bulk.toggle(p.id)} />
                    </div>
                  </div>
                )}
                <Badge variant={p.active ? "default" : "outline"} className={`absolute top-2 right-2 z-10 ${p.active ? "bg-success text-white" : ""}`}>{p.active ? "เปิดขาย" : "ปิด"}</Badge>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full grid place-items-center"><Package className="w-10 h-10 text-primary/30" /></div>
                )}
              </div>
              <div className="p-2.5 flex-1 flex flex-col gap-1">
                <div className="font-mono text-[10px] text-muted-foreground">{p.code}</div>
                <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.categories?.name || "-"} · {p.unit}</div>
                <div className="text-[11px]" data-testid="product-stock-grid">
                  <span className="text-muted-foreground">คงเหลือ </span>
                  <span className={`font-semibold ${Number(p.stock ?? 0) <= 0 ? "text-destructive" : Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 0) ? "text-warning" : ""}`}>
                    {Number(p.stock ?? 0)}
                  </span>
                  <span className="text-muted-foreground"> {p.unit}</span>
                </div>
                {p.barcode && <div className="text-[10px] font-mono text-muted-foreground truncate">📊 {p.barcode}</div>}
                <div className="flex gap-1 flex-wrap">
                  {(shopMap[p.id] || []).map((sid) => {
                    const st = stores.find((x) => x.id === sid);
                    return st ? <Badge key={sid} variant="outline" className="text-[9px]">{st.name}</Badge> : null;
                  })}
                  {(shopMap[p.id] || []).length === 0 && <Badge variant="outline" className="text-[9px] border-destructive text-destructive">ยังไม่ผูกร้าน</Badge>}
                </div>
                <div className="mt-auto pt-1.5 flex items-center justify-between">
                  <div className="font-semibold text-sm" title={displayPriceFor(p).label}>
                    {(() => { const d = displayPriceFor(p); return d.value != null ? fmtTHB(d.value) : "—"; })()}
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}><Edit className="w-4 h-4" /></Button>
                    {showTrash
                      ? <Button size="icon" variant="ghost" className="h-8 w-8 text-success" title="กู้คืน" onClick={() => restoreOne(p.id)}><RotateCcw className="w-4 h-4" /></Button>
                      : <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="ลบ" onClick={() => askDelete(p)}><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                </div>
                <TierPrices p={p} compact />
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="col-span-full text-center text-muted-foreground py-10">ไม่พบสินค้า</div>}
        </div>
      )}
      {/* Desktop / Tablet: Table */}
      <div className={`${!loadingList && viewMode === "table" ? "hidden md:block" : "hidden"} bg-card rounded-2xl border border-border overflow-hidden shadow-card`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent text-xs sticky top-0"><tr>
              {bulk.selectMode && <th className="p-3 w-10"><Checkbox checked={bulk.allSelected} onCheckedChange={() => bulk.toggleAll()} /></th>}
              <th className="text-left p-3">รหัส</th><th className="text-left p-3">สินค้า</th>
              <th className="text-left p-3">บาร์โค้ด</th>
              <th className="text-left p-3">หมวดหมู่</th>
              <th className="text-right p-3 whitespace-nowrap">คงเหลือ</th>
              <th className="text-right p-3">ราคา</th><th className="text-center p-3">สถานะ</th>
              <th className="text-right p-3">จัดการ</th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.id}
                  className="border-t border-border cursor-pointer hover:bg-accent/40"
                  onClick={() => openEdit(p)}
                  data-testid="product-row"
                >
                  {bulk.selectMode && (
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={bulk.ids.has(p.id)} onCheckedChange={() => bulk.toggle(p.id)} />
                    </td>
                  )}
                  <td className="p-3 font-mono text-xs">{p.code}</td>
                  <td className="p-3"><div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-accent/40 grid place-items-center overflow-hidden">
                      {p.image_url ? <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-primary/40" />}
                    </div>
                    <div>
                      {p.name}
                      <div className="text-xs text-muted-foreground">{p.unit}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(shopMap[p.id] || []).map((sid) => {
                          const st = stores.find((x) => x.id === sid);
                          return st ? <Badge key={sid} variant="outline" className="text-[9px]">{st.name}</Badge> : null;
                        })}
                        {(shopMap[p.id] || []).length === 0 && <Badge variant="outline" className="text-[9px] border-destructive text-destructive">ยังไม่ผูกร้าน</Badge>}
                      </div>
                    </div>
                  </div></td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{p.barcode || "-"}</td>
                  <td className="p-3 text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span>{p.categories?.name || "-"}</span>
                      {p.category_id && catMissingImg[p.category_id] && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-warning text-warning gap-1"
                          title="อัปโหลดรูปให้หมวดหมู่นี้เพื่อโชว์บนหน้าร้าน"
                          data-testid="cat-missing-image-badge"
                        >
                          <ImageOff className="w-3 h-3" /> ยังไม่มีรูปหมวดหมู่
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap" data-testid="product-stock-cell">
                    {(() => {
                      const st = Number(p.stock ?? 0);
                      const th = Number(p.low_stock_threshold ?? 0);
                      const tone = st <= 0 ? "text-destructive" : st <= th ? "text-warning" : "";
                      return (
                        <>
                          <span className={`font-semibold ${tone}`}>{st}</span>
                          <span className="text-[10px] text-muted-foreground"> {p.unit}</span>
                        </>
                      );
                    })()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-semibold" title={displayPriceFor(p).label}>
                      {(() => { const d = displayPriceFor(p); return d.value != null ? fmtTHB(d.value) : "—"; })()}
                    </div>
                    {priceView !== "base" && (
                      <div className="text-[10px] text-muted-foreground">ฐาน {fmtTHB(p.standard_price)}</div>
                    )}
                    <div className="flex justify-end"><TierPrices p={p} compact /></div>
                  </td>
                  <td className="p-3 text-center"><Badge variant={p.active ? "default" : "outline"} className={p.active ? "bg-success text-white" : ""}>{p.active ? "เปิดขาย" : "ปิด"}</Badge></td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="คัดลอกลิงก์สินค้า"
                      onClick={async () => {
                        const url = buildProductUrl({ id: p.id, code: p.code });
                        const ok = await copyToClipboard(url);
                        if (ok) toast.success("คัดลอกลิงก์สินค้าแล้ว", { description: url });
                        else toast.error("คัดลอกไม่สำเร็จ", { description: url });
                      }}
                    ><LinkIcon className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="w-4 h-4" /></Button>
                    {showTrash
                      ? <Button size="icon" variant="ghost" className="text-success" title="กู้คืน" onClick={() => restoreOne(p.id)}><RotateCcw className="w-4 h-4" /></Button>
                      : <Button size="icon" variant="ghost" className="text-destructive" title="ลบ" onClick={() => askDelete(p)}><Trash2 className="w-4 h-4" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: Card List */}
      {!loadingList && <div className="md:hidden space-y-3">
        {filtered.map(p => (
          <div key={p.id} className="bg-card rounded-2xl border border-border shadow-card p-3">
            <div className="flex gap-3">
              {bulk.selectMode && <div className="pt-1"><Checkbox checked={bulk.ids.has(p.id)} onCheckedChange={() => bulk.toggle(p.id)} /></div>}
              <div className="w-16 h-16 rounded-xl bg-accent/40 grid place-items-center overflow-hidden shrink-0">
                {p.image_url ? <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-primary/40" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-muted-foreground">{p.code}</div>
                    <div className="font-medium text-sm line-clamp-2">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                      <span>{p.categories?.name || "-"} · {p.unit}</span>
                      {p.category_id && catMissingImg[p.category_id] && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-warning text-warning gap-1"
                          title="อัปโหลดรูปให้หมวดหมู่นี้"
                          data-testid="cat-missing-image-badge-mobile"
                        >
                          <ImageOff className="w-3 h-3" /> ไม่มีรูปหมวด
                        </Badge>
                      )}
                    </div>
                    {p.barcode && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">📊 {p.barcode}</div>}
                    <div className="text-[11px] mt-0.5" data-testid="product-stock-mobile">
                      <span className="text-muted-foreground">คงเหลือ </span>
                      <span className={`font-semibold ${Number(p.stock ?? 0) <= 0 ? "text-destructive" : Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 0) ? "text-warning" : ""}`}>
                        {Number(p.stock ?? 0)}
                      </span>
                      <span className="text-muted-foreground"> {p.unit}</span>
                    </div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(shopMap[p.id] || []).map((sid) => {
                        const st = stores.find((x) => x.id === sid);
                        return st ? <Badge key={sid} variant="outline" className="text-[9px]">{st.name}</Badge> : null;
                      })}
                      {(shopMap[p.id] || []).length === 0 && <Badge variant="outline" className="text-[9px] border-destructive text-destructive">ยังไม่ผูกร้าน</Badge>}
                    </div>
                  </div>
                  <Badge variant={p.active ? "default" : "outline"} className={p.active ? "bg-success text-white shrink-0" : "shrink-0"}>{p.active ? "เปิดขาย" : "ปิด"}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">{displayPriceFor(p).label}:</span>{" "}
                    <span className="font-semibold">
                      {(() => { const d = displayPriceFor(p); return d.value != null ? fmtTHB(d.value) : "—"; })()}
                    </span>
                    {priceView !== "base" && (
                      <span className="text-muted-foreground"> · ฐาน {fmtTHB(p.standard_price)}</span>
                    )}
                  </div>
                  <TierPrices p={p} compact />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => openEdit(p)}><Edit className="w-4 h-4 mr-1" /> แก้ไข</Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                title="คัดลอกลิงก์สินค้า"
                onClick={async () => {
                  const url = buildProductUrl({ id: p.id, code: p.code });
                  const ok = await copyToClipboard(url);
                  if (ok) toast.success("คัดลอกลิงก์สินค้าแล้ว", { description: url });
                  else toast.error("คัดลอกไม่สำเร็จ", { description: url });
                }}
              ><LinkIcon className="w-4 h-4" /></Button>
              {showTrash
                ? <Button size="sm" variant="outline" className="rounded-xl text-success" onClick={() => restoreOne(p.id)}><RotateCcw className="w-4 h-4 mr-1" /> กู้คืน</Button>
                : <Button size="sm" variant="outline" className="rounded-xl text-destructive" onClick={() => askDelete(p)}><Trash2 className="w-4 h-4" /></Button>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center text-muted-foreground py-8">ไม่พบสินค้า</div>}
      </div>}
      {bulk.selectMode && bulk.count > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border border-border bg-card/95 backdrop-blur px-4 py-2 shadow-lg">
          <Tag className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium whitespace-nowrap">กำหนดสายงานให้ {bulk.count} รายการ</span>
          <Select value={bulkLineValue} onValueChange={(v) => setBulkLineValue(v as any)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="colorlab">คัลเลอร์แล็ป</SelectItem>
              <SelectItem value="print">การพิมพ์</SelectItem>
              <SelectItem value="other">อื่นๆ</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { void bulkSetProductLine(); }} disabled={bulkLineBusy} data-testid="bulk-set-product-line">
            บันทึกสายงาน
          </Button>
        </div>
      )}
      {bulk.selectMode && bulk.count > 0 && (
        <BulkActionBar
          count={bulk.count}
          onCancel={bulk.exit}
          onConfirm={() => { void bulkDelete(); }}
          itemLabel="สินค้า"
          actionLabel={showTrash ? "กู้คืนที่เลือก" : "ย้ายไปถังขยะ"}
          confirmTitle={showTrash ? `กู้คืน ${bulk.count} รายการ?` : `ย้าย ${bulk.count} รายการไปถังขยะ?`}
          confirmDescription={showTrash ? "ระบบจะกู้คืนสินค้าที่เลือกกลับมาใช้งานได้ทันที" : "สินค้าจะถูกซ่อนจากลูกค้าและกู้คืนได้จากแท็บถังขยะ"}
          previewNames={bulk.selectedArray.map(id => filtered.find((x: any) => x.id === id)?.name).filter(Boolean) as string[]}
        />
      )}
      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        focus={cameraFocus}
        onCapture={handleCapture}
      />
      <PhotoBarcodeDialog
        open={photoBcOpen}
        onOpenChange={setPhotoBcOpen}
        onDecoded={async (raw) => {
          const bc = (raw || "").replace(/\D/g, "");
          if (!bc || bc.length < 6) {
            toast.error("ไม่พบบาร์โค้ดที่อ่านได้ กรุณากรอกเอง");
            return;
          }
          const { data: dupe } = await supabase.from("products").select("id,name").eq("barcode", bc).maybeSingle();
          if (dupe && dupe.id !== editing) {
            toast.error(`บาร์โค้ดนี้มีอยู่แล้ว: ${dupe.name}`);
            return;
          }
          setForm((f: any) => ({ ...f, barcode: bc }));
          toast.success("อ่านบาร์โค้ดสำเร็จ");
          setPhotoBcOpen(false);
        }}
      />
      <ProductCsvImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={load} />
      <UnitsManagerDialog open={unitMgrOpen} onOpenChange={setUnitMgrOpen} />
      <Dialog open={catMgrOpen} onOpenChange={setCatMgrOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>จัดการหมวดหมู่</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="เพิ่มหมวดหมู่ใหม่..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createCategoryInline(); } }}
              className="rounded-xl"
            />
            <Button className="rounded-xl" onClick={() => void createCategoryInline()}>เพิ่ม</Button>
          </div>
          <input
            ref={catImgInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const target = e.target as HTMLInputElement & { dataset: DOMStringMap };
              const catId = target.dataset.catId;
              if (catId && e.target.files?.length) void uploadCategoryImages(catId, e.target.files);
              e.target.value = "";
            }}
          />
          <div className="max-h-[60vh] overflow-y-auto space-y-2 mt-2">
            {cats.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">ยังไม่มีหมวดหมู่</div>}
            {cats.map((c) => {
              const used = items.filter((x) => x.category_id === c.id).length;
              const imgs: string[] = Array.isArray(c.image_urls) ? c.image_urls : [];
              const isUploading = uploadingCatId === c.id;
              return (
                <div key={c.id} className="rounded-xl border border-border p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center overflow-hidden shrink-0">
                      {imgs[0]
                        ? <img src={imgs[0]} alt={c.name} className="w-full h-full object-cover" />
                        : <Tag className="w-4 h-4 text-primary/60" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">ใช้กับ {used} สินค้า · {imgs.length}/5 รูป</div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => renameCategory(c)} title="แก้ไขชื่อ"><Edit className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteCategory(c)} title="ลบ"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {imgs.map((u) => (
                      <div key={u} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                        <img src={u} alt={c.name} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeCategoryImage(c.id, u)}
                          className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition"
                          title="ลบรูป"
                        >
                          <Trash2 className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                    {imgs.length < 5 && (
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => {
                          if (!catImgInputRef.current) return;
                          catImgInputRef.current.dataset.catId = c.id;
                          catImgInputRef.current.click();
                        }}
                        className="aspect-square rounded-lg border border-dashed border-border grid place-items-center text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                        title="อัปโหลดรูป"
                      >
                        {isUploading ? <span className="text-[10px]">…</span> : <Upload className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!migrateCat} onOpenChange={(o) => { if (!o) setMigrateCat(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหมวดหมู่ "{migrateCat?.cat.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div>มีสินค้า <b>{migrateCat?.count}</b> รายการอยู่ในหมวดนี้ — กรุณาเลือกว่าจะทำอย่างไรกับสินค้าเหล่านั้นก่อนลบหมวด</div>
                <div className="space-y-1">
                  <Label>ย้ายสินค้าไปยัง</Label>
                  <Select value={migrateCat?.targetId ?? "__none__"} onValueChange={(v) => setMigrateCat((m) => m ? { ...m, targetId: v } : m)}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— ยกเลิกหมวด (ไม่มีหมวดหมู่) —</SelectItem>
                      {cats.filter((c) => c.id !== migrateCat?.cat.id).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMigrateAndDelete}>ยืนยันย้ายและลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="delete-confirm-title">ลบสินค้า "{confirmDel?.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>สินค้าจะถูกย้ายไปถังขยะ — กู้คืนได้ภายหลัง และจะไม่ลบรายการในเอกสาร/ออเดอร์เดิม</div>
                {confirmDel?.loading && <div className="text-muted-foreground">กำลังตรวจสอบการใช้งาน…</div>}
                {confirmDel?.error && <div className="text-destructive">โหลดข้อมูลไม่สำเร็จ: {confirmDel.error}</div>}
                {confirmDel?.usage && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1" data-testid="delete-confirm-usage">
                    <div data-testid="usage-stock">• สต๊อกคงเหลือ: <span className={confirmDel.usage.stock_remaining > 0 ? "font-semibold text-warning" : "font-semibold"}>{confirmDel.usage.stock_remaining}</span></div>
                    <div data-testid="usage-orders">• อยู่ในออเดอร์: <span className={confirmDel.usage.order_item_count > 0 ? "font-semibold text-warning" : "font-semibold"}>{confirmDel.usage.order_item_count} รายการ</span></div>
                    <div data-testid="usage-docs">• อยู่ในเอกสารใบเสนอราคา/ใบส่งของ/ใบเสร็จ: <span className={confirmDel.usage.document_item_count > 0 ? "font-semibold text-warning" : "font-semibold"}>{confirmDel.usage.document_item_count} รายการ</span></div>
                    {(confirmDel.usage.order_item_count > 0 || confirmDel.usage.document_item_count > 0 || confirmDel.usage.stock_remaining > 0) && (
                      <div className="pt-1 text-xs text-warning" data-testid="delete-confirm-warning">⚠️ สินค้านี้ยังถูกอ้างอิงอยู่ — แนะนำให้กู้คืนได้ตลอด</div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-confirm-cancel">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction data-testid="delete-confirm-action" onClick={(e) => { e.preventDefault(); void confirmSoftDelete(); }} disabled={confirmDel?.loading}>
              ย้ายไปถังขยะ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>{/* /left column */}
      {/* Desktop sticky editor panel (>=lg). Rendered only on desktop to
          avoid duplicating refs; mobile uses the Sheet below. */}
      {!isMobile && (
        <aside
          className="hidden lg:flex lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] flex-col rounded-md border border-border bg-card shadow-sm overflow-hidden"
          data-testid="product-editor-panel"
          aria-label="แผงแก้ไขสินค้า"
        >
          {open ? (
            <>
              <EditorPanelHeader />
              {editorBody}
            </>
          ) : editorEmptyState}
        </aside>
      )}
      </div>{/* /split grid */}
      {/* Mobile fullscreen sheet editor (<lg) */}
      {isMobile && (
        <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(EMPTY); setEditing(null); setGallery([]); } }}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-full p-0 flex flex-col h-[100dvh]"
            data-testid="product-editor-sheet"
          >
            <EditorPanelHeader onClose={() => setOpen(false)} />
            {editorBody}
          </SheetContent>
        </Sheet>
      )}
      <ImageResizeDialog
        open={imageResizeOpen}
        source={imageResizeSource}
        onOpenChange={handleCropOpenChange}
        onConfirm={handleCropConfirm}
      />
    </AdminLayout>
  );
}