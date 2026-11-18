import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Plus, FileSpreadsheet, Camera, Wand2, ScanLine, Search, Package,
  CheckCircle2, ImageOff, RefreshCw, Trash2, RotateCcw, Star, History,
  MoreVertical, LayoutGrid, Table as TableIcon, Download, Upload,
} from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { BrowserMultiFormatReader } from "@zxing/browser";
import {
  downloadTemplate, downloadTemplateCSV, parseImportFile, commitImport,
  validateImportRows, sha256File, rowResultsToCSV,
  type ImportRow, type ImportSummary, type ValidationReport, type RowResult,
} from "@/lib/productTemplate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertCircle, AlertTriangle, CheckCircle, XCircle, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks } from "lucide-react";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import BulkActionBar from "@/components/BulkActionBar";

type Group = { id: string; name: string; markup_percent: number; is_custom: boolean; sort_order: number };
type Row = {
  id: string; code: string; name: string; unit: string; category_id: string | null; stock: number;
  cost_price: number | null; standard_price: number | null;
  group_prices: Record<string, { markup: number; name: string; override: number | null; price: number | null }> | null;
  customer_price_count: number;
};

const BUCKET = "product-images";
async function getSignedImage(path: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}
function thb(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function calc(base: number | null, markup: number) {
  if (base == null || base <= 0) return null;
  return Math.round(base * (1 + markup / 100) * 100) / 100;
}

export default function AdminPrices() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [activities, setActivities] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState(new Date());
  const [savingKey, setSavingKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const bulk = useBulkSelect(rows);

  const [importOpen, setImportOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplRows, setTplRows] = useState<ImportRow[] | null>(null);
  const [tplErrors, setTplErrors] = useState<string[]>([]);
  const [tplBusy, setTplBusy] = useState(false);
  const [tplStep, setTplStep] = useState<"upload" | "review" | "result">("upload");
  const [tplFile, setTplFile] = useState<File | null>(null);
  const [tplFileHash, setTplFileHash] = useState<string>("");
  const [tplValidation, setTplValidation] = useState<ValidationReport | null>(null);
  const [tplResult, setTplResult] = useState<ImportSummary | null>(null);
  const [tplTab, setTplTab] = useState<"import" | "history">("import");
  const [importLogs, setImportLogs] = useState<any[]>([]);
  const [importLogDetail, setImportLogDetail] = useState<any | null>(null);

  function resetImportWizard() {
    setTplRows(null); setTplErrors([]); setTplFile(null); setTplFileHash("");
    setTplValidation(null); setTplResult(null); setTplStep("upload");
  }

  async function loadImportLogs() {
    const { data, error } = await supabase
      .from("import_logs")
      .select("id, user_id, filename, file_size, total_rows, added, updated, deleted, failed, warnings_count, errors_count, created_at")
      .order("created_at", { ascending: false }).limit(30);
    if (error) { toast.error(error.message); return; }
    setImportLogs(data ?? []);
  }

  async function openImportLog(id: string) {
    const { data, error } = await supabase.from("import_logs").select("*").eq("id", id).maybeSingle();
    if (error) { toast.error(error.message); return; }
    setImportLogDetail(data);
  }

  async function handleImportFile(f: File) {
    setTplFile(f);
    try {
      const hash = await sha256File(f);
      setTplFileHash(hash);
      const { rows, errors } = await parseImportFile(f);
      setTplRows(rows); setTplErrors(errors);
      if (!rows.length && !errors.length) { toast.error("ไม่พบแถวข้อมูล"); return; }
      const v = validateImportRows(rows, cats.map((c: any) => c.name));
      // merge parse errors into validation errors so user sees everything in one place
      const merged: ValidationReport = { ...v, errors: [...errors, ...v.errors] };
      setTplValidation(merged);
      setTplStep("review");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function runImport() {
    if (!tplRows) return;
    setTplBusy(true);
    const t = toast.loading("กำลังนำเข้า...");
    try {
      const s = await commitImport(tplRows);
      setTplResult(s);
      setTplStep("result");
      const msg = `เพิ่ม ${s.added} · อัปเดต ${s.updated} · ลบ ${s.deleted} · ล้มเหลว ${s.failed}`;
      if (s.failed > 0 || s.errors.length) toast.warning(msg, { id: t });
      else toast.success(msg, { id: t });
      loadMatrix();
      // best-effort: save import log
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("import_logs").insert({
          user_id: user?.id,
          filename: tplFile?.name ?? null,
          file_size: tplFile?.size ?? null,
          file_hash: tplFileHash || null,
          total_rows: tplRows.length,
          added: s.added, updated: s.updated, deleted: s.deleted, failed: s.failed,
          warnings_count: tplValidation?.warnings.length ?? 0,
          errors_count: s.errors.length,
          row_results: s.rows as any,
          validation: tplValidation as any,
        });
      } catch (e) {
        console.warn("import log save failed", e);
      }
    } catch (err: any) {
      toast.error(err.message, { id: t });
    }
    setTplBusy(false);
  }

  useEffect(() => {
    if (tplOpen && tplTab === "history") loadImportLogs();
    // eslint-disable-next-line
  }, [tplOpen, tplTab]);
  const [scanOpen, setScanOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<Row | null>(null);
  const [specialFor, setSpecialFor] = useState<Row | null>(null);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [view, setView] = useState<"cards" | "table">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "table"
  );

  async function loadGroups() {
    const { data: g } = await supabase.from("price_groups").select("*").order("sort_order").order("name");
    setGroups((g as Group[]) ?? []);
  }
  async function loadMatrix() {
    const { data, error } = await supabase.rpc("admin_get_price_matrix", {
      p_search: q || "", p_category: catFilter === "all" ? null : catFilter, p_limit: 500, p_offset: 0,
    } as any);
    if (error) { toast.error(error.message); return; }
    const list = (data as any[]) ?? [];
    setRows(list as Row[]);
    setLastSync(new Date());
    // load images for these products
    const { data: prods } = await supabase.from("products").select("id, image_url").in("id", list.map((r: any) => r.id));
    const map: Record<string, string | null> = {};
    for (const p of prods ?? []) map[(p as any).id] = (p as any).image_url ?? null;
    setImages(map);
  }
  async function loadSide() {
    const [{ data: c }, { data: o }, { data: a }] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("organizations").select("id, name").order("name"),
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    setCats(c ?? []); setOrgs(o ?? []); setActivities(a ?? []);
  }
  useEffect(() => { loadGroups(); loadSide(); }, []);
  useEffect(() => { loadMatrix(); /* eslint-disable-next-line */ }, [q, catFilter]);

  function markSaving(k: string) { setSavingKey(k); setSavedKey(""); }
  function markSaved(k: string) { setSavingKey(""); setSavedKey(k); setTimeout(() => setSavedKey(c => c === k ? "" : c), 1200); }

  async function logActivity(action: string, detail: any = {}, target_id?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("activity_logs").insert({ user_id: user.id, action, detail, target_type: "product", target_id });
  }

  async function saveCost(r: Row, cost: number | null) {
    const key = `cost:${r.id}`; markSaving(key);
    const { error } = await supabase.rpc("admin_set_cost", { p_product_id: r.id, p_cost: cost ?? 0 } as any);
    if (error) { toast.error(error.message); setSavingKey(""); return; }
    setRows(arr => arr.map(x => x.id === r.id ? { ...x, cost_price: cost } : x));
    await logActivity("update_cost", { code: r.code, cost }, r.id);
    markSaved(key);
  }
  async function saveStandardPrice(r: Row, price: number | null) {
    const key = `std:${r.id}`; markSaving(key);
    const { error } = await supabase.from("products").update({ standard_price: price ?? 0 }).eq("id", r.id);
    if (error) { toast.error(error.message); setSavingKey(""); return; }
    setRows(arr => arr.map(x => x.id === r.id ? { ...x, standard_price: price,
      group_prices: x.group_prices ? Object.fromEntries(Object.entries(x.group_prices).map(([gid, v]) => [gid, { ...v, price: v.override ?? calc(price, v.markup) }])) : x.group_prices
    } : x));
    await logActivity("update_standard_price", { code: r.code, price }, r.id);
    markSaved(key);
  }
  async function saveGroupOverride(r: Row, groupId: string, price: number | null) {
    const key = `g:${r.id}:${groupId}`; markSaving(key);
    const { error } = await supabase.rpc("admin_set_group_price", { p_product_id: r.id, p_group_id: groupId, p_price: price } as any);
    if (error) { toast.error(error.message); setSavingKey(""); return; }
    setRows(arr => arr.map(x => {
      if (x.id !== r.id || !x.group_prices) return x;
      const g = x.group_prices[groupId]; if (!g) return x;
      const ov = price;
      return { ...x, group_prices: { ...x.group_prices, [groupId]: { ...g, override: ov, price: ov ?? calc(x.standard_price, g.markup) } } };
    }));
    await logActivity("update_group_price", { code: r.code, group_id: groupId, price }, r.id);
    markSaved(key);
  }

  // photo upload
  async function uploadImageBlob(productId: string, blob: Blob, ext = "jpg") {
    const path = `${productId}/${Date.now()}.${ext}`;
    const { error: ue } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
    if (ue) throw ue;
    const signed = await getSignedImage(path); if (!signed) throw new Error("ไม่สามารถสร้างลิงก์รูปได้");
    await supabase.from("products").update({ image_url: signed }).eq("id", productId);
    setImages(m => ({ ...m, [productId]: signed }));
    return signed;
  }
  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !photoTarget) return;
    try { await uploadImageBlob(photoTarget.id, file, file.name.split(".").pop() || "jpg"); toast.success("อัปโหลดรูปแล้ว"); }
    catch (err: any) { toast.error(err.message); }
    setPhotoTarget(null); e.target.value = "";
  }

  // barcode scan
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const scanControlsRef = useRef<{ stop: () => void } | null>(null);
  useEffect(() => {
    if (!scanOpen) { scanControlsRef.current?.stop(); scanControlsRef.current = null; return; }
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    reader.decodeFromVideoDevice(undefined, scanVideoRef.current!, (result, _err, controls) => {
      scanControlsRef.current = controls;
      if (cancelled || !result) return;
      const text = result.getText();
      setQ(text); controls.stop(); setScanOpen(false);
    }).catch(err => toast.error("เปิดกล้องไม่สำเร็จ: " + err.message));
    return () => { cancelled = true; scanControlsRef.current?.stop(); };
  }, [scanOpen]);

  // sheet import
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetPreview, setSheetPreview] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  type RawRow = { code: string; name: string; unit: string; standard_price: number; stock: number; active: boolean; category: string };
  const [dupOverrides, setDupOverrides] = useState<Record<string, RawRow>>({});
  const [editingDupKey, setEditingDupKey] = useState<string | null>(null);

  const { uniqueRows, dupCount, dupGroups } = useMemo(() => {
    const rows: RawRow[] = (sheetPreview ?? []).map((r: any) => ({
      code: String(r.code ?? r.รหัส ?? r.SKU ?? "").trim(),
      name: String(r.name ?? r.ชื่อ ?? r.ชื่อสินค้า ?? "").trim(),
      unit: String(r.unit ?? r.หน่วย ?? "ชิ้น").trim(),
      standard_price: Number(r.price ?? r.ราคา ?? r.standard_price ?? 0) || 0,
      stock: Number(r.stock ?? r.สต๊อก ?? 0) || 0,
      active: true,
      category: String(r.category ?? r.หมวด ?? r.หมวดหมู่ ?? "").trim(),
    })).filter(x => x.code && x.name);
    const groups = new Map<string, RawRow[]>();
    for (const r of rows) {
      const k = r.code.toLowerCase();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const dupGroups: { key: string; code: string; rows: RawRow[] }[] = [];
    const uniqueRows: RawRow[] = [];
    for (const [key, list] of groups) {
      if (list.length > 1) dupGroups.push({ key, code: list[0].code, rows: list });
      const chosen = dupOverrides[key] ?? list[list.length - 1];
      uniqueRows.push(chosen);
    }
    const dupCount = dupGroups.reduce((a, g) => a + g.rows.length - 1, 0);
    return { uniqueRows, dupCount, dupGroups };
  }, [sheetPreview, dupOverrides]);

  function setDupChoice(key: string, idx: number) {
    const g = dupGroups.find(x => x.key === key); if (!g) return;
    setDupOverrides(prev => ({ ...prev, [key]: g.rows[idx] }));
  }
  function patchDupOverride(key: string, patch: Partial<RawRow>) {
    setDupOverrides(prev => {
      const base = prev[key] ?? dupGroups.find(x => x.key === key)?.rows.slice(-1)[0];
      if (!base) return prev;
      return { ...prev, [key]: { ...base, ...patch } };
    });
  }
  function applyAllChoice(mode: "first" | "last") {
    const next: Record<string, RawRow> = {};
    for (const g of dupGroups) next[g.key] = mode === "first" ? g.rows[0] : g.rows[g.rows.length - 1];
    setDupOverrides(next);
  }
  function downloadDedupedCSV() {
    if (!uniqueRows.length) return;
    const csv = Papa.unparse(uniqueRows.map(r => ({
      code: r.code, name: r.name, unit: r.unit, standard_price: r.standard_price, stock: r.stock, category: r.category,
    })));
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const ts = new Date(); const pad = (n: number) => String(n).padStart(2, "0");
    const name = `products-deduped-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.csv`;
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function fetchSheet() {
    if (!sheetUrl) return;
    let url = sheetUrl.trim();
    const m = url.match(/\/spreadsheets\/d\/([^/]+)/);
    if (m && !/output=csv/.test(url)) url = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
    const t = toast.loading("กำลังโหลด...");
    try {
      const res = await fetch(url); if (!res.ok) throw new Error("โหลดไม่สำเร็จ");
      const csv = await res.text();
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
      setSheetPreview(parsed.data as any[]);
      toast.success(`พบ ${parsed.data.length} แถว`, { id: t });
    } catch (err: any) { toast.error(err.message, { id: t }); }
  }
  async function commitSheet() {
    if (!sheetPreview?.length) return; setImporting(true);
    // Already deduped via useMemo above; respect any per-row override the user picked.
    const unique = uniqueRows;
    const dupes = dupCount;
    // Auto-create missing categories via shared resolver
    const rawNames = unique.map(r => r.category);
    const { data: existingCats } = await supabase.from("categories").select("id, name");
    const { resolveCategories, mergeCreated } = await import("@/lib/categoryResolver");
    const resolved = resolveCategories(rawNames, (existingCats ?? []) as any);
    let createdCats = 0;
    if (resolved.toCreate.length) {
      const { data: ins, error: ie } = await supabase
        .from("categories")
        .insert(resolved.toCreate.map(name => ({ name })))
        .select("id, name");
      if (ie) { setImporting(false); toast.error(`สร้างหมวดไม่สำเร็จ: ${ie.message}`); return; }
      mergeCreated(resolved, rawNames, (ins ?? []) as any);
      createdCats = ins?.length ?? 0;
    }
    for (const w of resolved.warnings) toast.warning(w);
    const enriched = unique.map(r => {
      const display = r.category ? String(r.category).trim() : "";
      const cid = display ? resolved.map.get(display) : null;
      const { category: _omit, ...rest } = r;
      return cid ? { ...rest, category_id: cid } : rest;
    });
    try {
      for (let i = 0; i < enriched.length; i += 500) {
        const chunk = enriched.slice(i, i + 500);
        const { error } = await supabase.from("products").upsert(chunk, { onConflict: "code" });
        if (error) {
          setImporting(false);
          const msg = /affect row a second time/i.test(error.message)
            ? "พบรหัสสินค้า (code) ซ้ำกันในไฟล์ กรุณาตรวจสอบคอลัมน์ code แล้วลองอีกครั้ง"
            : error.message;
          toast.error(`นำเข้าไม่สำเร็จ: ${msg}`);
          return; // keep preview intact so user can fix and retry
        }
      }
    } catch (e: any) {
      setImporting(false);
      toast.error(`นำเข้าไม่สำเร็จ: ${e?.message ?? e}`);
      return;
    }
    setImporting(false);
    const parts: string[] = [`นำเข้า ${enriched.length} รายการ`];
    if (dupes > 0) parts.push(`รวมรหัสซ้ำ ${dupes} แถว`);
    if (createdCats > 0) parts.push(`สร้างหมวดใหม่ ${createdCats}`);
    toast.success(parts.join(" · "));
    setImportOpen(false); setSheetUrl(""); setSheetPreview(null); setDupOverrides({}); setEditingDupKey(null); loadMatrix();
    loadSide();
  }

  // new product
  const [newForm, setNewForm] = useState({ code: "", name: "", unit: "ชิ้น", cost: 0, standard: 0, stock: 0 });
  async function createProduct() {
    if (!newForm.code || !newForm.name) return toast.error("กรอกรหัสและชื่อสินค้า");
    const { data, error } = await supabase.from("products").insert({
      code: newForm.code, name: newForm.name, unit: newForm.unit, stock: newForm.stock,
      standard_price: newForm.standard || 0, active: true,
    }).select("id").single();
    if (error) return toast.error(error.message);
    if (newForm.cost > 0) await supabase.rpc("admin_set_cost", { p_product_id: (data as any).id, p_cost: newForm.cost } as any);
    toast.success("เพิ่มสินค้าแล้ว"); setNewOpen(false); setNewForm({ code: "", name: "", unit: "ชิ้น", cost: 0, standard: 0, stock: 0 });
    loadMatrix();
  }

  const nonCustom = useMemo(() => groups.filter(g => !g.is_custom), [groups]);
  const today = new Date().toDateString();
  const updatedToday = activities.filter(a => new Date(a.created_at).toDateString() === today).length;
  const noCost = rows.filter(r => r.cost_price == null).length;

  async function bulkDeleteProducts() {
    const ids = bulk.selectedArray; if (!ids.length) return;
    const { error } = await supabase.from("products").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`ลบ ${ids.length} รายการ`); bulk.exit(); loadMatrix();
  }

  return (
    <AdminLayout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">จัดการราคาสินค้า</h1>
        <p className="text-sm text-muted-foreground mt-1">ใส่ราคาขายหน้าร้าน 1 ครั้ง ระบบจะคำนวณราคาทุกกลุ่ม % ให้อัตโนมัติ คลิกเซลล์ใดเพื่อตั้งราคากำหนดเอง (override)</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatBox label="สินค้าทั้งหมด" value={`${rows.length} รายการ`} icon={Package} tint="bg-accent" />
        <StatBox label="กิจกรรมวันนี้" value={`${updatedToday} ครั้ง`} icon={CheckCircle2} tint="bg-secondary" />
        <StatBox label="ยังไม่มีราคาทุน" value={`${noCost} รายการ`} icon={ImageOff} tint="bg-muted" warn={noCost > 0} />
        <StatBox label="ซิงก์ล่าสุด" value={lastSync.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น."} icon={RefreshCw} tint="bg-accent" live />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button onClick={() => setNewOpen(true)} className="rounded-xl bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />เพิ่มสินค้า</Button>
        <Button variant="outline" className="rounded-xl" onClick={() => setTplOpen(true)}><Upload className="w-4 h-4 mr-1" />เทมเพลต Excel</Button>
        <Button variant="outline" className="rounded-xl" onClick={() => setImportOpen(true)}><FileSpreadsheet className="w-4 h-4 mr-1" />นำเข้า Google Sheets</Button>
        <Button variant="outline" className="rounded-xl" onClick={() => setScanOpen(true)}><ScanLine className="w-4 h-4 mr-1" />สแกนหา</Button>
        <Button variant={bulk.selectMode ? "default" : "outline"} className="rounded-xl" onClick={() => bulk.selectMode ? bulk.exit() : bulk.setSelectMode(true)}>
          <ListChecks className="w-4 h-4 mr-1" /> {bulk.selectMode ? "ออกจากโหมดเลือก" : "เลือกหลายรายการ"}
        </Button>
        <div className="ml-auto flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <div className="hidden sm:flex items-center rounded-xl border border-border bg-card p-0.5">
            <Button size="sm" variant={view === "cards" ? "default" : "ghost"} className="h-8 rounded-lg px-2" onClick={() => setView("cards")}>
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button size="sm" variant={view === "table" ? "default" : "ghost"} className="h-8 rounded-lg px-2" onClick={() => setView("table")}>
              <TableIcon className="w-4 h-4" />
            </Button>
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="rounded-xl w-40 h-9"><SelectValue placeholder="หมวด" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกหมวด</SelectItem>
              {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-full min-w-0 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / SKU" className="rounded-xl pl-9 h-9" />
          </div>
        </div>
      </div>

      {/* On mobile (<md) always render the card layout — the pivot table is unusable on small screens. */}
      {view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(r => (
            <div key={r.id} className="bg-card rounded-2xl border border-border shadow-card overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-3 flex items-start gap-3 border-b border-border">
                <div className="w-14 h-14 rounded-xl bg-accent/60 grid place-items-center overflow-hidden shrink-0">
                  {images[r.id] ? <img src={images[r.id]!} alt={r.name} className="w-full h-full object-cover" /> : <ImageOff className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-tight line-clamp-2">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono">{r.code}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{r.unit} · สต๊อก {Number(r.stock)}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="w-8 h-8 shrink-0"><MoreVertical className="w-4 h-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem onClick={() => setHistoryFor(r)}><History className="w-4 h-4 mr-2" /> ประวัติราคา</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPhotoTarget(r)}><Camera className="w-4 h-4 mr-2" /> อัปโหลดรูป</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                      if (!confirm("ลบสินค้านี้?")) return;
                      const { error } = await supabase.from("products").delete().eq("id", r.id);
                      if (error) return toast.error(error.message);
                      toast.success("ลบแล้ว"); loadMatrix();
                    }}><Trash2 className="w-4 h-4 mr-2" /> ลบสินค้า</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Cost */}
              <div className="p-3 bg-muted/40 border-b border-border flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">ราคาทุน</div>
                  <div className="text-[10px] text-muted-foreground/70">เห็นเฉพาะ Admin</div>
                </div>
                <PriceCell
                  defaultValue={r.cost_price ?? null}
                  saving={savingKey === `cost:${r.id}`}
                  saved={savedKey === `cost:${r.id}`}
                  onCommit={(v) => saveCost(r, v)}
                  highlight="cost"
                />
              </div>

              {/* Standard / shop price — base for % group prices */}
              <div className="p-3 bg-primary/5 border-b border-border flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-primary">ราคาขายหน้าร้าน</div>
                  <div className="text-[10px] text-muted-foreground/70">ฐานคำนวณราคากลุ่ม %</div>
                </div>
                <PriceCell
                  defaultValue={r.standard_price ?? null}
                  saving={savingKey === `std:${r.id}`}
                  saved={savedKey === `std:${r.id}`}
                  onCommit={(v) => saveStandardPrice(r, v)}
                  highlight="override"
                />
              </div>

              {/* Group prices */}
              <div className="p-3 flex-1 space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground mb-1.5">ราคาขายตามกลุ่ม</div>
                {nonCustom.map(g => {
                  const cell = r.group_prices?.[g.id];
                  const isOverride = cell?.override != null;
                  return (
                    <div key={g.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{g.name}</div>
                        <div className="text-[10px] text-muted-foreground">+{Number(g.markup_percent)}%{isOverride && " · กำหนดเอง"}</div>
                      </div>
                      <PriceCell
                        defaultValue={cell?.price ?? null}
                        placeholder={r.standard_price == null ? "ตั้งราคาหน้าร้าน" : "—"}
                        disabled={(r.standard_price == null || r.standard_price === 0) && !isOverride}
                        saving={savingKey === `g:${r.id}:${g.id}`}
                        saved={savedKey === `g:${r.id}:${g.id}`}
                        onCommit={(v) => saveGroupOverride(r, g.id, v)}
                        highlight={isOverride ? "override" : undefined}
                      />
                      {isOverride ? (
                        <Button size="icon" variant="ghost" className="w-7 h-7 shrink-0" title="คืนค่าเป็นสูตร" onClick={() => saveGroupOverride(r, g.id, null)}>
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      ) : <div className="w-7 shrink-0" />}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-border bg-accent/20">
                <Button size="sm" variant="outline" className="w-full rounded-lg h-8" onClick={() => setSpecialFor(r)}>
                  <Star className="w-3.5 h-3.5 mr-1.5" />
                  ราคาพิเศษเฉพาะหน่วยงาน{r.customer_price_count > 0 && ` (${r.customer_price_count})`}
                </Button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="md:col-span-2 xl:col-span-3 p-12 text-center text-muted-foreground bg-card rounded-2xl border border-border">ไม่พบสินค้า</div>}
        </div>
      ) : (
      <>
      {/* Table hidden on mobile; falls back to card grid below */}
      <div className="hidden md:block bg-card rounded-2xl border border-border shadow-card overflow-hidden -mx-2 lg:-mx-6 xl:-mx-8">
        <div className="overflow-auto max-h-[calc(100vh-260px)]">
          <table className="w-full text-sm table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ minWidth: 220, width: "26%" }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 104 }} />
              {nonCustom.map(g => <col key={g.id} style={{ width: 96 }} />)}
              <col style={{ width: 64 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead className="text-xs">
              <tr className="bg-accent/70">
                {bulk.selectMode && <th className="text-center px-1 py-1.5 sticky top-0 left-0 z-30 bg-accent/90 border-b border-border w-10" rowSpan={2}><Checkbox checked={bulk.allSelected} onCheckedChange={() => bulk.toggleAll()} /></th>}
                <th className="text-left px-3 py-1.5 sticky top-0 left-0 z-30 bg-accent/90 border-b border-border" rowSpan={2}>สินค้า</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-accent/70 border-b border-border" rowSpan={2}>หน่วย</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-accent/70 border-b border-border" rowSpan={2}>สต๊อก</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-muted/70 text-muted-foreground border-b border-border" rowSpan={2}>ราคาทุน</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-primary/10 text-primary border-b border-border" rowSpan={2}>ราคาหน้าร้าน</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-primary/10 text-primary border-b border-border" colSpan={nonCustom.length}>ราคาขายตามกลุ่ม</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-accent/70 border-b border-border" rowSpan={2}>พิเศษ</th>
                <th className="text-center px-2 py-1.5 sticky top-0 z-20 bg-accent/70 border-b border-border" rowSpan={2}></th>
              </tr>
              <tr className="bg-accent/50">
                {nonCustom.map(g => (
                  <th key={g.id} className="text-center px-2 py-1.5 sticky top-[34px] z-20 bg-accent/60 border-b border-border whitespace-nowrap">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">+{Number(g.markup_percent)}%</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} className={`group ${idx % 2 ? "bg-muted/20" : "bg-background"} hover:bg-accent/30 transition-colors`}>
                  {bulk.selectMode && <td className="px-1 py-1.5 text-center border-b border-border"><Checkbox checked={bulk.ids.has(r.id)} onCheckedChange={() => bulk.toggle(r.id)} /></td>}
                  <td className={`px-2 py-1.5 sticky left-0 z-10 border-b border-border ${idx % 2 ? "bg-muted/40" : "bg-background"} group-hover:bg-accent/40`}>
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-accent/60 grid place-items-center overflow-hidden shrink-0">
                        {images[r.id] ? <img src={images[r.id]!} alt={r.name} className="w-full h-full object-cover" /> : <ImageOff className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate text-sm leading-tight">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">{r.code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-1 py-1.5 text-center text-xs text-muted-foreground border-b border-border truncate">{r.unit}</td>
                  <td className={`px-1 py-1.5 text-center text-xs tabular-nums border-b border-border ${Number(r.stock) <= 0 ? "text-destructive font-semibold" : ""}`}>{Number(r.stock)}</td>
                  <td className="px-1 py-1 border-b border-border">
                    <PriceCell defaultValue={r.cost_price ?? null} saving={savingKey === `cost:${r.id}`} saved={savedKey === `cost:${r.id}`} onCommit={(v) => saveCost(r, v)} highlight="cost" full />
                  </td>
                  <td className="px-1 py-1 border-b border-border bg-primary/5">
                    <PriceCell defaultValue={r.standard_price ?? null} saving={savingKey === `std:${r.id}`} saved={savedKey === `std:${r.id}`} onCommit={(v) => saveStandardPrice(r, v)} highlight="override" full />
                  </td>
                  {nonCustom.map(g => {
                    const cell = r.group_prices?.[g.id];
                    const isOverride = cell?.override != null;
                    return (
                      <td key={g.id} className="px-1 py-1 border-b border-border relative">
                        <PriceCell
                          defaultValue={cell?.price ?? null}
                          placeholder={!r.standard_price ? "ตั้งหน้าร้าน" : "—"}
                          disabled={!r.standard_price && !isOverride}
                          saving={savingKey === `g:${r.id}:${g.id}`}
                          saved={savedKey === `g:${r.id}:${g.id}`}
                          onCommit={(v) => saveGroupOverride(r, g.id, v)}
                          highlight={isOverride ? "override" : undefined}
                          muted={!isOverride}
                          full
                        />
                        {isOverride && (
                          <button
                            type="button"
                            title="คืนค่าเป็นสูตร"
                            onClick={() => saveGroupOverride(r, g.id, null)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1.5 text-center border-b border-border">
                    <Button size="sm" variant={r.customer_price_count > 0 ? "default" : "outline"} className="rounded-lg h-7 w-full px-1 text-xs" onClick={() => setSpecialFor(r)}>
                      <Star className="w-3 h-3 mr-0.5" />{r.customer_price_count}
                    </Button>
                  </td>
                  <td className="px-0 py-1.5 text-center border-b border-border">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="w-8 h-8 mx-auto"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem onClick={() => setHistoryFor(r)}><History className="w-4 h-4 mr-2" /> ประวัติราคา</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPhotoTarget(r)}><Camera className="w-4 h-4 mr-2" /> อัปโหลดรูป</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                          if (!confirm("ลบสินค้านี้?")) return;
                          const { error } = await supabase.from("products").delete().eq("id", r.id);
                          if (error) return toast.error(error.message);
                          toast.success("ลบแล้ว"); loadMatrix();
                        }}><Trash2 className="w-4 h-4 mr-2" /> ลบสินค้า</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7 + nonCustom.length} className="p-8 text-center text-muted-foreground">ไม่พบสินค้า</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="md:hidden grid grid-cols-1 gap-4">
        {rows.map(r => (
          <div key={r.id} className="bg-card rounded-2xl border border-border shadow-card p-3">
            <div className="flex gap-3">
              <div className="w-14 h-14 rounded-xl bg-accent/60 grid place-items-center overflow-hidden shrink-0">
                {images[r.id]
                  ? <img src={images[r.id]!} alt={r.name} className="w-full h-full object-cover" />
                  : <Package className="w-5 h-5 text-primary/40" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] text-muted-foreground">{r.code || "-"}</div>
                <div className="text-sm font-medium line-clamp-2">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.unit || "-"} · สต๊อก {r.stock}
                </div>
                <div className="mt-1.5 text-sm">
                  <span className="text-muted-foreground text-xs">ราคาหน้าร้าน:</span>{" "}
                  <span className="font-semibold text-primary">{thb(Number(r.standard_price) || 0)}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setSpecialFor(r)}>
                <Star className="w-3.5 h-3.5 mr-1" />
                ราคาพิเศษ{r.customer_price_count > 0 && ` (${r.customer_price_count})`}
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="p-8 text-center text-muted-foreground bg-card rounded-2xl border border-border">ไม่พบสินค้า</div>}
      </div>
      </>
      )}

      <input type="file" accept="image/*" capture="environment" className="hidden" id="photo-input" onChange={handlePhotoFile} />
      {photoTarget && <TriggerOnce id="photo-input" />}

      {bulk.selectMode && bulk.count > 0 && (
        <BulkActionBar count={bulk.count} onCancel={bulk.exit} onConfirm={() => { void bulkDeleteProducts(); }}
          itemLabel="สินค้า"
          previewNames={bulk.selectedArray.map(id => rows.find((x: any) => x.id === id)?.name).filter(Boolean) as string[]}
          confirmDescription={`ลบสินค้า ${bulk.count} รายการ พร้อมข้อมูลราคา/สต๊อกที่เกี่ยวข้อง`} />
      )}

      {/* New product */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>เพิ่มสินค้าใหม่</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>รหัส / SKU *</Label><Input value={newForm.code} onChange={(e) => setNewForm({ ...newForm, code: e.target.value })} className="rounded-xl mt-1" /></div>
            <div><Label>หน่วยนับ</Label><Input value={newForm.unit} onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })} className="rounded-xl mt-1" /></div>
            <div className="col-span-2"><Label>ชื่อสินค้า *</Label><Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} className="rounded-xl mt-1" /></div>
            <div><Label>ราคาทุน</Label><Input type="number" value={newForm.cost} onChange={(e) => setNewForm({ ...newForm, cost: Number(e.target.value) })} className="rounded-xl mt-1" /></div>
            <div><Label>ราคาขายหน้าร้าน</Label><Input type="number" value={newForm.standard} onChange={(e) => setNewForm({ ...newForm, standard: Number(e.target.value) })} className="rounded-xl mt-1" /></div>
            <div><Label>สต๊อก</Label><Input type="number" value={newForm.stock} onChange={(e) => setNewForm({ ...newForm, stock: Number(e.target.value) })} className="rounded-xl mt-1" /></div>
          </div>
          {newForm.standard > 0 && nonCustom.length > 0 && (
            <div className="text-xs text-muted-foreground bg-accent/40 rounded-xl p-3">
              ตัวอย่างราคาที่จะคำนวณจากหน้าร้าน: {nonCustom.map(g => `${g.name} ${thb(calc(newForm.standard, Number(g.markup_percent)))}`).join(" · ")}
            </div>
          )}
          <Button onClick={createProduct} className="rounded-xl bg-primary text-primary-foreground">บันทึก</Button>
        </DialogContent>
      </Dialog>

      {/* Sheet import */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setSheetUrl(""); setSheetPreview(null); setDupOverrides({}); setEditingDupKey(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>นำเข้าสินค้าจาก Google Sheets</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">คอลัมน์: code, name, unit, stock</p>
          <div className="flex gap-2">
            <Input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="rounded-xl flex-1" />
            <Button onClick={fetchSheet} className="rounded-xl bg-primary text-primary-foreground">ดึงข้อมูล</Button>
          </div>
          {sheetPreview && (
            <div className="max-h-72 overflow-auto border border-border rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-accent sticky top-0"><tr>{Object.keys(sheetPreview[0] || {}).map(k => <th key={k} className="text-left p-2">{k}</th>)}</tr></thead>
                <tbody>{sheetPreview.slice(0, 50).map((r: any, i: number) => (
                  <tr key={i} className="border-t border-border">{Object.keys(sheetPreview[0]).map(k => <td key={k} className="p-2">{String(r[k] ?? "")}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {sheetPreview && dupGroups.length > 0 && (
            <div data-testid="dup-panel" className="border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  พบรหัสซ้ำ {dupGroups.length} รายการ ({dupCount} แถวซ้ำ) — ระบบเลือก "ค่าล่าสุด" ให้แล้ว
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-7 text-xs" onClick={() => applyAllChoice("first")}>ใช้แถวแรกทั้งหมด</Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg h-7 text-xs" onClick={() => applyAllChoice("last")}>ใช้แถวล่าสุดทั้งหมด</Button>
                </div>
              </div>
              <div className="max-h-60 overflow-auto rounded-lg border border-border bg-background">
                <table className="w-full text-xs">
                  <thead className="bg-accent sticky top-0">
                    <tr>
                      <th className="text-left p-2">รหัส</th>
                      <th className="text-left p-2">จำนวนซ้ำ</th>
                      <th className="text-left p-2">เลือกแถว</th>
                      <th className="text-left p-2">ค่าที่จะใช้ (ชื่อ / หน่วย / ราคา / สต๊อก)</th>
                      <th className="text-right p-2">แก้ไข</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dupGroups.map(g => {
                      const chosen = dupOverrides[g.key] ?? g.rows[g.rows.length - 1];
                      const idx = g.rows.findIndex(r => r === chosen);
                      const selectedIdx = idx >= 0 ? idx : g.rows.length - 1;
                      const isEditing = editingDupKey === g.key;
                      return (
                        <tr key={g.key} data-testid={`dup-row-${g.code}`} className="border-t border-border align-top">
                          <td className="p-2 font-mono">{chosen.code}</td>
                          <td className="p-2">{g.rows.length}</td>
                          <td className="p-2">
                            <select
                              aria-label={`เลือกแถวสำหรับ ${g.code}`}
                              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                              value={selectedIdx}
                              onChange={(e) => setDupChoice(g.key, Number(e.target.value))}
                            >
                              {g.rows.map((r, i) => (
                                <option key={i} value={i}>
                                  แถว #{i + 1} — {r.name} / {thb(r.standard_price)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            {isEditing ? (
                              <div className="grid grid-cols-2 gap-1">
                                <Input className="h-7 text-xs rounded-md" value={chosen.name} onChange={(e) => patchDupOverride(g.key, { name: e.target.value })} placeholder="ชื่อ" />
                                <Input className="h-7 text-xs rounded-md" value={chosen.unit} onChange={(e) => patchDupOverride(g.key, { unit: e.target.value })} placeholder="หน่วย" />
                                <Input className="h-7 text-xs rounded-md" type="number" value={chosen.standard_price} onChange={(e) => patchDupOverride(g.key, { standard_price: Number(e.target.value) || 0 })} placeholder="ราคา" />
                                <Input className="h-7 text-xs rounded-md" type="number" value={chosen.stock} onChange={(e) => patchDupOverride(g.key, { stock: Number(e.target.value) || 0 })} placeholder="สต๊อก" />
                              </div>
                            ) : (
                              <div className="text-muted-foreground">
                                {chosen.name} • {chosen.unit} • {thb(chosen.standard_price)} • คงเหลือ {chosen.stock}
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Button type="button" size="sm" variant="outline" className="rounded-lg h-7 text-xs"
                              onClick={() => setEditingDupKey(isEditing ? null : g.key)}>
                              {isEditing ? "เสร็จ" : "แก้ไข"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {sheetPreview && (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={importing} onClick={commitSheet} className="rounded-xl bg-primary text-primary-foreground">
                {importing ? "กำลังนำเข้า..." : `บันทึก ${uniqueRows.length} รายการ${dupCount > 0 ? ` (รวมซ้ำ ${dupCount})` : ""}`}
              </Button>
              <Button type="button" variant="outline" disabled={!uniqueRows.length} onClick={downloadDedupedCSV} className="rounded-xl">
                <Download className="w-4 h-4 mr-1" /> ดาวน์โหลด CSV (หลังรวมรหัสซ้ำ)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Scanner */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>สแกนสินค้า</DialogTitle></DialogHeader>
          <video ref={scanVideoRef} className="w-full rounded-xl bg-black aspect-video" />
        </DialogContent>
      </Dialog>

      {/* Special customer prices */}
      <SpecialDialog product={specialFor} orgs={orgs} onClose={() => { setSpecialFor(null); loadMatrix(); }} />

      {/* Price history */}
      <HistoryDialog product={historyFor} groups={groups} orgs={orgs} onClose={() => setHistoryFor(null)} />

      {/* Excel template import */}
      <Dialog open={tplOpen} onOpenChange={(o) => { setTplOpen(o); if (!o) resetImportWizard(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>นำเข้าสินค้า</DialogTitle></DialogHeader>

          <Tabs value={tplTab} onValueChange={(v) => setTplTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="import" className="rounded-lg">นำเข้าไฟล์</TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg">ประวัตินำเข้า</TabsTrigger>
            </TabsList>

            {/* ===== IMPORT TAB ===== */}
            <TabsContent value="import" className="space-y-3">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs">
                {(["upload", "review", "result"] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold ${tplStep === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                    <span className={tplStep === s ? "font-semibold" : "text-muted-foreground"}>
                      {s === "upload" ? "เลือกไฟล์" : s === "review" ? "ตรวจสอบ" : "ผลลัพธ์"}
                    </span>
                    {i < 2 && <span className="text-muted-foreground">→</span>}
                  </div>
                ))}
              </div>

              {/* Step 1: Upload */}
              {tplStep === "upload" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    ดาวน์โหลดเทมเพลต กรอกข้อมูล (action = add/delete) แล้วอัปโหลดกลับ — รองรับ .xlsx และ .csv
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={() => downloadTemplate()}>
                      <Download className="w-4 h-4 mr-1" /> เทมเพลต Excel (.xlsx)
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={() => downloadTemplateCSV()}>
                      <FileText className="w-4 h-4 mr-1" /> เทมเพลต CSV
                    </Button>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm cursor-pointer hover:bg-accent">
                      <Upload className="w-4 h-4" /> เลือกไฟล์
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0]; if (!f) return;
                        await handleImportFile(f);
                        e.target.value = "";
                      }} />
                    </label>
                  </div>
                  <div className="text-[11px] text-muted-foreground bg-accent/40 rounded-lg p-2 leading-relaxed">
                    <b>สูตรราคา:</b> ถ้าไม่ใส่ <code>price_10/15/20</code> ระบบจะคำนวณจาก <code>standard_price × (1 + markup/100)</code> อัตโนมัติ —
                    ใส่ตัวเลขเพื่อ override เฉพาะกลุ่ม
                  </div>
                </div>
              )}

              {/* Step 2: Review (validation) */}
              {tplStep === "review" && tplRows && tplValidation && (
                <div className="space-y-3">
                  <div className="text-xs flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-lg">รวม {tplValidation.stats.total}</Badge>
                    <Badge variant="outline" className="rounded-lg">เพิ่ม/อัปเดต {tplValidation.stats.add}</Badge>
                    <Badge variant="outline" className="rounded-lg">ลบ {tplValidation.stats.delete}</Badge>
                    {tplValidation.stats.duplicates > 0 && <Badge variant="outline" className="rounded-lg text-warning">code ซ้ำ {tplValidation.stats.duplicates}</Badge>}
                    {tplValidation.stats.newCategories.length > 0 && (
                      <Badge variant="outline" className="rounded-lg">หมวดใหม่ {tplValidation.stats.newCategories.length}</Badge>
                    )}
                  </div>

                  {tplValidation.errors.length > 0 && (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1 max-h-40 overflow-auto">
                      <div className="flex items-center gap-1 font-semibold text-destructive"><XCircle className="w-3.5 h-3.5" /> พบ {tplValidation.errors.length} ข้อผิดพลาด (ต้องแก้ก่อนนำเข้า)</div>
                      {tplValidation.errors.map((e, i) => <div key={i}>• {e}</div>)}
                    </div>
                  )}
                  {tplValidation.warnings.length > 0 && (
                    <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs space-y-1 max-h-40 overflow-auto">
                      <div className="flex items-center gap-1 font-semibold text-warning"><AlertTriangle className="w-3.5 h-3.5" /> {tplValidation.warnings.length} คำเตือน (นำเข้าต่อได้)</div>
                      {tplValidation.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                    </div>
                  )}

                  <div className="max-h-72 overflow-auto border border-border rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-accent sticky top-0"><tr>
                        <th className="text-left p-2">#</th>
                        <th className="text-left p-2">action</th><th className="text-left p-2">code</th>
                        <th className="text-left p-2">name</th><th className="text-right p-2">std</th>
                        <th className="text-right p-2">+10%</th><th className="text-right p-2">+15%</th>
                        <th className="text-right p-2">+20%</th>
                      </tr></thead>
                      <tbody>{tplRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 text-muted-foreground">{r._row}</td>
                          <td className="p-2"><Badge variant={r.action === "delete" ? "destructive" : "outline"}>{r.action}</Badge></td>
                          <td className="p-2 font-mono">{r.code}</td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2 text-right">{r.standard_price ?? "—"}</td>
                          <td className="p-2 text-right">{r.price_10 ?? "—"}</td>
                          <td className="p-2 text-right">{r.price_15 ?? "—"}</td>
                          <td className="p-2 text-right">{r.price_20 ?? "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" className="rounded-xl" onClick={resetImportWizard}>ยกเลิก / เลือกไฟล์ใหม่</Button>
                    <Button
                      disabled={tplBusy || tplValidation.errors.length > 0}
                      className="rounded-xl bg-primary text-primary-foreground"
                      onClick={runImport}
                    >
                      {tplBusy ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${tplRows.length} แถว`}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Result */}
              {tplStep === "result" && tplResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <ResultStat label="เพิ่มใหม่" value={tplResult.added} tone="success" />
                    <ResultStat label="อัปเดต" value={tplResult.updated} tone="success" />
                    <ResultStat label="ลบ" value={tplResult.deleted} tone="default" />
                    <ResultStat label="ตั้งทุน" value={tplResult.costsSet} tone="default" />
                    <ResultStat label="ล้มเหลว" value={tplResult.failed} tone={tplResult.failed > 0 ? "destructive" : "default"} />
                  </div>

                  <div className="max-h-72 overflow-auto border border-border rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-accent sticky top-0"><tr>
                        <th className="text-left p-2">#</th>
                        <th className="text-left p-2">code</th>
                        <th className="text-left p-2">action</th>
                        <th className="text-left p-2">สถานะ</th>
                        <th className="text-left p-2">ราคา</th>
                        <th className="text-left p-2">หมายเหตุ</th>
                      </tr></thead>
                      <tbody>{tplResult.rows.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 text-muted-foreground">{r.row || "—"}</td>
                          <td className="p-2 font-mono">{r.code}</td>
                          <td className="p-2">{r.action}{r.mode ? ` (${r.mode})` : ""}</td>
                          <td className="p-2">
                            {r.status === "success" && <span className="inline-flex items-center gap-1 text-success"><CheckCircle className="w-3 h-3" /> สำเร็จ</span>}
                            {r.status === "failed" && <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="w-3 h-3" /> ล้มเหลว</span>}
                            {r.status === "skipped" && <span className="inline-flex items-center gap-1 text-muted-foreground"><AlertCircle className="w-3 h-3" /> ข้าม</span>}
                          </td>
                          <td className="p-2">{r.costSet ? "ทุน " : ""}{r.pricesSet ? `+${r.pricesSet}` : ""}</td>
                          <td className="p-2 text-muted-foreground">{r.message ?? ""}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" className="rounded-xl" onClick={() => {
                      const csv = rowResultsToCSV(tplResult.rows);
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url;
                      a.download = `import_result_${Date.now()}.csv`;
                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}>
                      <Download className="w-4 h-4 mr-1" /> ดาวน์โหลดผลลัพธ์ CSV
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={resetImportWizard}>นำเข้าใหม่</Button>
                    <Button className="rounded-xl bg-primary text-primary-foreground" onClick={() => { setTplOpen(false); resetImportWizard(); }}>ปิด</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ===== HISTORY TAB ===== */}
            <TabsContent value="history" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">ประวัติการนำเข้า 30 รายการล่าสุด</div>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={loadImportLogs}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> รีเฟรช
                </Button>
              </div>
              <div className="max-h-[420px] overflow-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-accent sticky top-0"><tr>
                    <th className="text-left p-2">เวลา</th>
                    <th className="text-left p-2">ไฟล์</th>
                    <th className="text-right p-2">รวม</th>
                    <th className="text-right p-2">เพิ่ม</th>
                    <th className="text-right p-2">อัปเดต</th>
                    <th className="text-right p-2">ลบ</th>
                    <th className="text-right p-2">ล้มเหลว</th>
                    <th className="p-2"></th>
                  </tr></thead>
                  <tbody>
                    {importLogs.length === 0 && (
                      <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">— ยังไม่มีประวัติ —</td></tr>
                    )}
                    {importLogs.map((l) => (
                      <tr key={l.id} className="border-t border-border hover:bg-accent/40">
                        <td className="p-2 whitespace-nowrap">{new Date(l.created_at).toLocaleString("th-TH")}</td>
                        <td className="p-2 font-mono truncate max-w-[200px]" title={l.filename}>{l.filename ?? "—"}</td>
                        <td className="p-2 text-right">{l.total_rows}</td>
                        <td className="p-2 text-right text-success">{l.added}</td>
                        <td className="p-2 text-right">{l.updated}</td>
                        <td className="p-2 text-right">{l.deleted}</td>
                        <td className={`p-2 text-right ${l.failed > 0 ? "text-destructive font-semibold" : ""}`}>{l.failed}</td>
                        <td className="p-2"><Button size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => openImportLog(l.id)}>ดู</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Import log detail */}
      <Dialog open={!!importLogDetail} onOpenChange={(o) => !o && setImportLogDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>รายละเอียดการนำเข้า</DialogTitle></DialogHeader>
          {importLogDetail && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><div className="text-muted-foreground">เวลา</div><div>{new Date(importLogDetail.created_at).toLocaleString("th-TH")}</div></div>
                <div><div className="text-muted-foreground">ไฟล์</div><div className="font-mono truncate" title={importLogDetail.filename}>{importLogDetail.filename ?? "—"}</div></div>
                <div><div className="text-muted-foreground">ขนาด</div><div>{importLogDetail.file_size ? `${(importLogDetail.file_size / 1024).toFixed(1)} KB` : "—"}</div></div>
                <div><div className="text-muted-foreground">SHA-256</div><div className="font-mono text-[10px] truncate" title={importLogDetail.file_hash}>{importLogDetail.file_hash ? importLogDetail.file_hash.slice(0, 16) + "…" : "—"}</div></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <ResultStat label="เพิ่ม" value={importLogDetail.added} tone="success" />
                <ResultStat label="อัปเดต" value={importLogDetail.updated} tone="success" />
                <ResultStat label="ลบ" value={importLogDetail.deleted} tone="default" />
                <ResultStat label="คำเตือน" value={importLogDetail.warnings_count} tone="default" />
                <ResultStat label="ล้มเหลว" value={importLogDetail.failed} tone={importLogDetail.failed > 0 ? "destructive" : "default"} />
              </div>
              <div className="max-h-[300px] overflow-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-accent sticky top-0"><tr>
                    <th className="text-left p-2">#</th><th className="text-left p-2">code</th>
                    <th className="text-left p-2">action</th><th className="text-left p-2">สถานะ</th>
                    <th className="text-left p-2">หมายเหตุ</th>
                  </tr></thead>
                  <tbody>
                    {((importLogDetail.row_results ?? []) as RowResult[]).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{r.row || "—"}</td>
                        <td className="p-2 font-mono">{r.code}</td>
                        <td className="p-2">{r.action}{r.mode ? ` (${r.mode})` : ""}</td>
                        <td className="p-2">
                          {r.status === "success" && <span className="text-success">สำเร็จ</span>}
                          {r.status === "failed" && <span className="text-destructive">ล้มเหลว</span>}
                          {r.status === "skipped" && <span className="text-muted-foreground">ข้าม</span>}
                        </td>
                        <td className="p-2 text-muted-foreground">{r.message ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function ResultStat({ label, value, tone = "default" }: { label: string; value: number; tone?: "success" | "destructive" | "default" }) {
  const cls = tone === "success" ? "border-success/40 bg-success/10 text-success"
    : tone === "destructive" ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-2 ${cls}`}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, tint, live, warn }: any) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${tint} grid place-items-center text-primary`}><Icon className="w-5 h-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {live && <span className="ml-1 inline-flex items-center gap-1 text-success text-[10px] font-medium"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />LIVE</span>}
        </div>
        <div className={`font-bold text-base ${warn ? "text-warning" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

function PriceCell({ defaultValue, onCommit, saving, saved, disabled, placeholder, highlight, muted, full }: {
  defaultValue?: number | null; onCommit: (v: number | null) => void;
  saving?: boolean; saved?: boolean; disabled?: boolean; placeholder?: string;
  highlight?: "cost" | "override"; muted?: boolean; full?: boolean;
}) {
  const cls = highlight === "cost" ? "border-muted-foreground/30 bg-muted/60"
    : highlight === "override" ? "border-primary bg-primary/5 font-semibold text-primary pr-6"
    : muted ? "border-transparent bg-transparent text-muted-foreground hover:border-input hover:bg-background" : "";
  return (
    <Input
      type="number"
      step="0.01"
      disabled={disabled}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder ?? "—"}
      key={String(defaultValue ?? "")}
      onBlur={(e) => {
        const raw = e.target.value;
        if (raw === "") { if (defaultValue != null) onCommit(null); return; }
        const v = Number(raw); if (Number.isNaN(v)) return;
        if (v !== (defaultValue ?? null)) onCommit(v);
      }}
      className={`rounded-md ${full ? "w-full" : "w-24 ml-auto"} h-8 text-right text-sm tabular-nums px-2 ${cls} ${saving ? "border-primary" : ""} ${saved ? "border-success" : ""}`}
    />
  );
}

function TriggerOnce({ id }: { id: string }) {
  useEffect(() => { (document.getElementById(id) as HTMLInputElement | null)?.click(); }, [id]);
  return null;
}

function SpecialDialog({ product, orgs, onClose }: { product: Row | null; orgs: any[]; onClose: () => void }) {
  const [rows, setRows] = useState<{ organization_id: string; price: number }[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [price, setPrice] = useState<number>(0);

  useEffect(() => {
    if (!product) return;
    supabase.from("customer_prices").select("organization_id, price").eq("product_id", product.id)
      .then(({ data }) => setRows((data as any[]) ?? []));
    setOrgId(""); setPrice(0);
  }, [product]);

  if (!product) return null;
  async function add() {
    if (!orgId || !price) return toast.error("เลือกหน่วยงานและใส่ราคา");
    const { error } = await supabase.rpc("admin_set_customer_price", { p_product_id: product!.id, p_org_id: orgId, p_price: price } as any);
    if (error) return toast.error(error.message);
    toast.success("ตั้งราคาพิเศษแล้ว");
    const { data } = await supabase.from("customer_prices").select("organization_id, price").eq("product_id", product!.id);
    setRows((data as any[]) ?? []); setOrgId(""); setPrice(0);
  }
  async function del(o: string) {
    const { error } = await supabase.rpc("admin_set_customer_price", { p_product_id: product!.id, p_org_id: o, p_price: null } as any);
    if (error) return toast.error(error.message);
    setRows(rs => rs.filter(r => r.organization_id !== o));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>ราคาพิเศษเฉพาะหน่วยงาน — {product.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">ราคาเหล่านี้จะถูกใช้ก่อนราคาตามกลุ่ม</p>
        <div className="flex gap-2">
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger className="rounded-xl flex-1"><SelectValue placeholder="เลือกหน่วยงาน" /></SelectTrigger>
            <SelectContent>{orgs.filter(o => !rows.find(r => r.organization_id === o.id)).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" step="0.01" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} placeholder="ราคา" className="rounded-xl w-32" />
          <Button onClick={add} className="rounded-xl bg-primary text-primary-foreground"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent/60 text-xs"><tr><th className="text-left p-2">หน่วยงาน</th><th className="text-right p-2">ราคา</th><th className="text-right p-2"></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground text-xs">ยังไม่มีราคาพิเศษ</td></tr>}
              {rows.map(r => (
                <tr key={r.organization_id} className="border-t border-border">
                  <td className="p-2">{orgs.find(o => o.id === r.organization_id)?.name ?? r.organization_id}</td>
                  <td className="p-2 text-right font-semibold text-primary">฿{thb(r.price)}</td>
                  <td className="p-2 text-right"><Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(r.organization_id)}><Trash2 className="w-4 h-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ product, groups, orgs, onClose }: { product: Row | null; groups: Group[]; orgs: any[]; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!product) return;
    supabase.from("price_history").select("*").eq("product_id", product.id).order("changed_at", { ascending: false }).limit(50)
      .then(({ data }) => setItems((data as any[]) ?? []));
  }, [product]);
  if (!product) return null;
  function refLabel(scope: string, refId: string | null) {
    if (scope === "group") return "กลุ่ม: " + (groups.find(g => g.id === refId)?.name ?? refId);
    if (scope === "customer") return "หน่วยงาน: " + (orgs.find(o => o.id === refId)?.name ?? refId);
    if (scope === "cost") return "ราคาทุน";
    return "ราคามาตรฐาน";
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>ประวัติการแก้ไขราคา — {product.name}</DialogTitle></DialogHeader>
        <div className="max-h-96 overflow-auto border border-border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-accent/60 text-xs sticky top-0"><tr>
              <th className="text-left p-2">เวลา</th><th className="text-left p-2">ระดับ</th>
              <th className="text-right p-2">เดิม</th><th className="text-right p-2">ใหม่</th>
            </tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground text-xs">ไม่มีประวัติ</td></tr>}
              {items.map(it => (
                <tr key={it.id} className="border-t border-border">
                  <td className="p-2 text-xs">{new Date(it.changed_at).toLocaleString("th-TH")}</td>
                  <td className="p-2 text-xs">{refLabel(it.scope, it.ref_id)}</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">{it.old_price == null ? "—" : `฿${thb(it.old_price)}`}</td>
                  <td className="p-2 text-right text-xs font-semibold">{it.new_price == null ? <Badge variant="outline">ลบ</Badge> : `฿${thb(it.new_price)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
