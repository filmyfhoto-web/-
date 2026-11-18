/**
 * หน้า "ใบเบิกสินค้า" — สร้างใบเบิกได้ 2 วิธีในหน้าเดียว
 *   1) กรอกรายการเอง
 *   2) สร้างจากไฟล์ที่ลูกค้าส่งมา (Excel / PDF / รูปภาพ / Word)
 *
 * ข้อมูลจริงทั้งหมดผ่าน `@/lib/requisitionDesk` (school_requisitions, profiles,
 * customer_excel_intakes, product_units) — สลับวิธีสร้างแล้วรายการไม่หาย
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Search, Plus, Save, Trash2, Check, ChevronDown, ChevronUp, Loader2, AlertTriangle, X,
  FileSpreadsheet, FileText, Image as ImageIcon, FileType2, Pencil, FileUp, Users, ArrowUp, ArrowDown,
  Phone, MessageCircle, RefreshCw,
} from "lucide-react";
import {
  RECEIVE_METHODS, FALLBACK_UNITS, KIND_LABEL, fmtSize, thaiDate, listUnits, searchCustomers,
  listCustomerFiles, listInboxJobs, signFileUrl, nextReqNumber, saveDeskRequisition, validateDesk,
  totalUnits, type DeskCustomer, type ReqFile, type ReqFileKind, type ReqMode, type InboxJob,
} from "@/lib/requisitionDesk";
import { newItemId, type RequisitionItem } from "@/lib/schoolRequisition";

const PURPLE = "#5B258B";
const CREAM = "#FBF7F2";
const STEPS = ["เลือกวิธีสร้าง", "ตรวจรายการ", "บันทึกใบเบิก"];

const card = "rounded-[8px] border border-[#DDE2EA] bg-white";
const th = "px-4 py-3 text-left text-[15px] font-semibold text-[#17263D]";
const cell = "px-4 py-2 text-[15px] text-[#17263D]";
const input =
  "w-full rounded-[6px] border border-[#DDE2EA] bg-white px-3 py-2 text-[15px] text-[#17263D] outline-none focus:border-[#5B258B]";

const FileIcon = ({ kind }: { kind: ReqFileKind }) => {
  if (kind === "excel") return <span className="grid h-9 w-9 place-items-center rounded-[6px] bg-[#E9F7EF]"><FileSpreadsheet className="h-5 w-5 text-[#1B7F4B]" /></span>;
  if (kind === "pdf") return <span className="grid h-9 w-9 place-items-center rounded-[6px] bg-[#FDECEC]"><FileText className="h-5 w-5 text-[#C2352F]" /></span>;
  if (kind === "word") return <span className="grid h-9 w-9 place-items-center rounded-[6px] bg-[#EAF3FD]"><FileType2 className="h-5 w-5 text-[#1D6FD0]" /></span>;
  return <span className="grid h-9 w-9 place-items-center rounded-[6px] bg-[#F1EEF7]"><ImageIcon className="h-5 w-5 text-[#5B258B]" /></span>;
};

export default function RequisitionDesk() {
  const nav = useNavigate();

  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<DeskCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customer, setCustomer] = useState<DeskCustomer | null>(null);

  const [mode, setMode] = useState<ReqMode>("manual");
  const [reqNumber, setReqNumber] = useState("");
  const [units, setUnits] = useState<string[]>(FALLBACK_UNITS);

  const [files, setFiles] = useState<ReqFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [usedFileIds, setUsedFileIds] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState("");

  const [items, setItems] = useState<RequisitionItem[]>([]);
  const [wantDate, setWantDate] = useState("");
  const [receive, setReceive] = useState<string>(RECEIVE_METHODS[0]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "draft" | "commit">("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<InboxJob[]>([]);
  const [jobsOpen, setJobsOpen] = useState(false);
  const savingRef = useRef(false);

  /* --------------------------------------------------------------- loading */

  const loadCustomers = useCallback(async (term: string) => {
    setCustomersLoading(true); setCustomersError("");
    try {
      setCustomers(await searchCustomers(term));
    } catch (e) {
      setCustomersError(e instanceof Error ? e.message : "โหลดรายชื่อลูกค้าไม่สำเร็จ");
    } finally { setCustomersLoading(false); }
  }, []);

  useEffect(() => { void loadCustomers(""); }, [loadCustomers]);
  useEffect(() => { void listUnits().then(setUnits).catch(() => undefined); }, []);
  useEffect(() => { void nextReqNumber().then(setReqNumber).catch(() => undefined); }, []);
  useEffect(() => { void listInboxJobs().then(setJobs).catch(() => setJobs([])); }, []);

  // ค้นหาลูกค้าแบบหน่วงเวลา (ค้นบนเซิร์ฟเวอร์)
  useEffect(() => {
    const t = setTimeout(() => { void loadCustomers(q); }, 300);
    return () => clearTimeout(t);
  }, [q, loadCustomers]);

  useEffect(() => {
    if (!customer) { setFiles([]); return; }
    setFilesLoading(true); setPicked({}); setPreviews({});
    listCustomerFiles(customer)
      .then(async (fs) => {
        setFiles(fs);
        const urls: Record<string, string> = {};
        await Promise.all(fs.filter((f) => f.kind === "image" && f.bucket && f.path).slice(0, 12).map(async (f) => {
          const u = await signFileUrl(f.bucket!, f.path!);
          if (u) urls[f.id] = u;
        }));
        setPreviews(urls);
      })
      .catch(() => setFiles([]))
      .finally(() => setFilesLoading(false));
  }, [customer]);

  /* --------------------------------------------------------------- derived */

  const searchedItems = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((it) => it.name.toLowerCase().includes(t));
  }, [items, q]);

  const step = useMemo(() => (savedId ? 2 : items.length ? 1 : 0), [savedId, items.length]);
  const pickedIds = Object.keys(picked);
  const unitsTotal = totalUnits(items);
  const reviewCount = items.filter((it) => it.needsReview).length;

  /* --------------------------------------------------------------- actions */

  function patchItem(id: string, patch: Partial<RequisitionItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch, needsReview: patch.needsReview ?? (it.needsReview && !("name" in patch || "qty" in patch || "unit" in patch)) } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { id: newItemId(), code: "", name: "", unit: units[0] ?? "ชิ้น", price: 0, qty: 1, source: "manual" }]);
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  function togglePick(id: string) {
    setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  }

  async function readFiles() {
    const src = files.filter((f) => picked[f.id]);
    if (!src.length) { toast.error("เลือกไฟล์อย่างน้อย 1 ไฟล์ก่อน"); return; }
    setReading(true); setReadMsg("");
    try {
      const rows = src.flatMap((f) => f.items);
      if (!rows.length) {
        setReadMsg("อ่านไฟล์ที่เลือกเป็นรายการไม่ได้ กรุณากรอกรายการเอง");
        toast.error("อ่านไฟล์ที่เลือกเป็นรายการไม่ได้");
        return;
      }
      setItems((prev) => [...prev, ...rows.map((r) => ({ ...r, id: newItemId() }))]);
      setUsedFileIds((prev) => [...new Set([...prev, ...src.map((f) => f.id)])]);
      const unclear = rows.filter((r) => r.needsReview).length;
      setReadMsg(`ตรวจพบ ${rows.length} รายการจากไฟล์${unclear ? ` • ${unclear} รายการอ่านได้ไม่ชัด โปรดตรวจสอบ` : ""}`);
      toast.success(`ตรวจพบ ${rows.length} รายการจากไฟล์`);
    } finally { setReading(false); }
  }

  async function save(status: "draft" | "submitted") {
    if (savingRef.current) return;
    if (!customer) { toast.error("เลือกลูกค้าก่อนบันทึก"); setPickerOpen(true); return; }
    const payload = {
      reqNumber, customer, items, wantDate, receiveMethod: receive, note,
      sourceFiles: files.filter((f) => usedFileIds.includes(f.id) || picked[f.id])
        .map((f) => ({ id: f.id, name: f.name, kind: f.kind, bucket: f.bucket, path: f.path })),
    };
    const errs = status === "submitted" ? validateDesk(payload) : (!items.length ? ["ต้องมีรายการอย่างน้อย 1 รายการ"] : []);
    setErrors(errs);
    if (errs.length) { toast.error(errs[0]); return; }

    savingRef.current = true;
    setBusy(status === "draft" ? "draft" : "commit");
    try {
      const res = await saveDeskRequisition({ ...payload, id: savedId ?? undefined, status });
      setSavedId(res.id);
      setReqNumber(res.reqNumber);
      toast.success(status === "draft" ? `บันทึกร่างใบเบิก ${res.reqNumber} แล้ว` : `บันทึกใบเบิก ${res.reqNumber} เรียบร้อย`);
      if (status === "submitted") void listInboxJobs().then(setJobs).catch(() => undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      savingRef.current = false;
      setBusy("");
    }
  }

  function resetForm() {
    setItems([]); setSavedId(null); setUsedFileIds([]); setPicked({}); setReadMsg("");
    setNote(""); setWantDate(""); setReceive(RECEIVE_METHODS[0]); setErrors([]);
    void nextReqNumber().then(setReqNumber);
  }

  /* ------------------------------------------------------------------ view */

  return (
    <div className="min-h-screen text-[#17263D]" style={{ background: CREAM }}>
      {/* 1. แถบด้านบน */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 border-b border-[#E4DFD8] bg-white px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[19px] font-bold">นัฐภรณ์ เชียงกลาง</span>
          <span className="h-5 w-px bg-[#DDE2EA]" />
          <span className="text-[17px] font-semibold" style={{ color: PURPLE }}>ใบเบิกสินค้า</span>
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A96A8]" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาลูกค้า เลขใบเบิก หรือชื่อสินค้า"
            aria-label="ค้นหาลูกค้า เลขใบเบิก หรือชื่อสินค้า"
            className="w-full rounded-[8px] border border-[#DDE2EA] bg-white py-2.5 pl-10 pr-3 text-[16px] outline-none focus:border-[#5B258B]"
          />
        </div>
        <button
          type="button" onClick={() => setPickerOpen(true)}
          className="flex items-center gap-3 rounded-[8px] border border-[#DDE2EA] bg-white px-3 py-2 text-left hover:border-[#5B258B]"
        >
          <Users className="h-5 w-5" style={{ color: PURPLE }} />
          <span>
            <span className="block text-[16px] font-semibold">{customer?.name ?? "ยังไม่ได้เลือกลูกค้า"}</span>
            <span className="block text-[14px] text-[#5C6B82]">{customer?.code ?? "แตะเพื่อเลือกลูกค้า"}</span>
          </span>
          <ChevronDown className="h-5 w-5 text-[#8A96A8]" />
        </button>
      </header>

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* 2. แถบขั้นตอน */}
          <ol className={`${card} flex flex-wrap items-center gap-6 px-5 py-4`}>
            {STEPS.map((label, i) => {
              const active = i <= step;
              return (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full text-[16px] font-bold"
                    style={{ background: active ? PURPLE : "#EEF0F4", color: active ? "#fff" : "#8A96A8" }}
                  >{i + 1}</span>
                  <span className="text-[16px] font-semibold" style={{ color: active ? PURPLE : "#8A96A8" }}>{label}</span>
                  {i < STEPS.length - 1 && <span className="hidden h-px w-10 bg-[#DDE2EA] sm:block" />}
                </li>
              );
            })}
          </ol>

          {/* 3. หัวข้อใบเบิก */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[22px] font-bold">สร้างใบเบิก {reqNumber || "…"}</h1>
            {savedId && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => nav(`/admin/school-requisitions?focus=${savedId}`)}
                  className="rounded-[6px] border px-3 py-2 text-[15px]" style={{ borderColor: PURPLE, color: PURPLE }}>
                  เปิดดูใบเบิกที่บันทึก
                </button>
                <button type="button" onClick={resetForm}
                  className="inline-flex items-center gap-2 rounded-[6px] border border-[#DDE2EA] px-3 py-2 text-[15px]">
                  <RefreshCw className="h-4 w-4" /> สร้างใบใหม่
                </button>
              </div>
            )}
          </div>

          {/* 4. เลือกวิธีสร้าง */}
          <section className={`${card} p-5`}>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                { key: "manual" as ReqMode, icon: Pencil, label: "กรอกเอง", desc: "พิมพ์รายการเองทีละบรรทัด" },
                { key: "files" as ReqMode, icon: FileUp, label: "ใช้ไฟล์ที่ลูกค้าส่งมา", desc: "Excel, PDF, JPG, PNG, Word" },
              ]).map((m) => {
                const on = mode === m.key;
                return (
                  <button
                    key={m.key} type="button" onClick={() => setMode(m.key)} aria-pressed={on}
                    className="flex items-center gap-3 rounded-[8px] border px-4 py-4 text-left"
                    style={{ borderColor: on ? PURPLE : "#DDE2EA", background: on ? "#FCF8F1" : "#fff" }}
                  >
                    <m.icon className="h-6 w-6" style={{ color: on ? PURPLE : "#5C6B82" }} />
                    <span className="flex-1">
                      <span className="block text-[17px] font-semibold">{m.label}</span>
                      <span className="block text-[14px] text-[#5C6B82]">{m.desc}</span>
                    </span>
                    {on && <Check className="h-6 w-6" style={{ color: PURPLE }} />}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[15px] text-[#5C6B82]">สลับวิธีได้ตลอด รายการที่แก้ไขไว้จะไม่หาย</p>
          </section>

          {/* 5. ไฟล์ที่ลูกค้าส่งมา */}
          {mode === "files" && (
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE2EA] px-5 py-3">
                <h2 className="text-[17px] font-bold">ไฟล์ที่ลูกค้าส่งมา</h2>
                <button
                  type="button" onClick={readFiles} disabled={reading || !pickedIds.length}
                  className="inline-flex items-center gap-2 rounded-[6px] px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-50"
                  style={{ background: PURPLE }}
                >
                  {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} อ่านไฟล์เป็นรายการ
                </button>
              </div>
              {readMsg && <p className="px-5 pt-3 text-[15px]" style={{ color: PURPLE }}>{readMsg}</p>}
              <div className="overflow-x-auto p-2">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#DDE2EA]">
                      <th className={`${th} w-[52px]`}><span className="sr-only">เลือก</span></th>
                      <th className={th}>ชื่อไฟล์</th>
                      <th className={`${th} w-[120px]`}>ประเภท</th>
                      <th className={`${th} w-[110px]`}>ขนาด</th>
                      <th className={`${th} w-[120px]`}>ตัวอย่าง</th>
                      <th className={`${th} w-[80px]`}><span className="sr-only">นำออก</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!customer && <tr><td className={`${cell} text-[#5C6B82]`} colSpan={6}>เลือกลูกค้าก่อน เพื่อดูไฟล์ที่ลูกค้าส่งเข้ามา</td></tr>}
                    {customer && filesLoading && <tr><td className={cell} colSpan={6}><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลดไฟล์…</td></tr>}
                    {customer && !filesLoading && !files.length && (
                      <tr><td className={`${cell} text-[#5C6B82]`} colSpan={6}>ลูกค้ารายนี้ยังไม่ได้ส่งไฟล์เข้ามา — เลือก “กรอกเอง” เพื่อพิมพ์รายการ</td></tr>
                    )}
                    {files.map((f) => (
                      <tr key={f.id} className="border-b border-[#EDF0F5] last:border-0">
                        <td className={cell}>
                          <input type="checkbox" className="h-[18px] w-[18px] accent-[#5B258B]"
                            checked={!!picked[f.id]} onChange={() => togglePick(f.id)} aria-label={`เลือก ${f.name}`} />
                        </td>
                        <td className={cell}>
                          <span className="flex items-center gap-3">
                            <FileIcon kind={f.kind} />
                            <span className="truncate">{f.name}</span>
                          </span>
                        </td>
                        <td className={`${cell} text-[#5C6B82]`}>{KIND_LABEL[f.kind]}</td>
                        <td className={`${cell} text-[#5C6B82]`}>{fmtSize(f.sizeBytes)}</td>
                        <td className={cell}>
                          <span className="grid h-[42px] w-[68px] place-items-center overflow-hidden rounded-[4px] border border-[#DDE2EA] bg-[#F7F8FA]">
                            {previews[f.id] ? <img src={previews[f.id]} alt="" className="h-full w-full object-cover" /> : <FileIcon kind={f.kind} />}
                          </span>
                        </td>
                        <td className={cell}>
                          <button type="button" aria-label={`นำ ${f.name} ออก`}
                            onClick={() => { setFiles((p) => p.filter((x) => x.id !== f.id)); setPicked((p) => { const n = { ...p }; delete n[f.id]; return n; }); }}>
                            <X className="h-5 w-5 text-[#8A96A8] hover:text-[#C2352F]" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 6. ตารางรายการใบเบิก */}
          <section className={card}>
            <div className="flex items-center justify-between border-b border-[#DDE2EA] px-5 py-3">
              <h2 className="text-[17px] font-bold">รายการในใบเบิก</h2>
              {reviewCount > 0 && (
                <span className="inline-flex items-center gap-2 text-[15px] text-[#B26A00]">
                  <AlertTriangle className="h-4 w-4" /> {reviewCount} รายการต้องตรวจสอบ
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#DDE2EA]">
                    <th className={`${th} w-[52px]`}>#</th>
                    <th className={th}>รายการสินค้า / รายละเอียด</th>
                    <th className={`${th} w-[120px]`}>จำนวน</th>
                    <th className={`${th} w-[140px]`}>หน่วย</th>
                    <th className={`${th} w-[220px]`}>หมายเหตุ</th>
                    <th className={`${th} w-[110px]`}><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!searchedItems.length && (
                    <tr><td className={`${cell} text-[#5C6B82]`} colSpan={6}>
                      {items.length ? "ไม่พบรายการที่ตรงกับคำค้น" : "ยังไม่มีรายการ — กด “เพิ่มรายการ” หรืออ่านรายการจากไฟล์ลูกค้า"}
                    </td></tr>
                  )}
                  {searchedItems.map((it) => {
                    const idx = items.findIndex((x) => x.id === it.id);
                    const badQty = !(Number(it.qty) > 0);
                    return (
                      <tr key={it.id} className="border-b border-[#EDF0F5] align-top last:border-0"
                        style={it.needsReview ? { background: "#FFFBF2" } : undefined}>
                        <td className={`${cell} pt-4 text-[#5C6B82]`}>{idx + 1}</td>
                        <td className={cell}>
                          <input className={input} value={it.name} placeholder="ชื่อสินค้า / รายละเอียด"
                            aria-label={`ชื่อรายการที่ ${idx + 1}`}
                            onChange={(e) => patchItem(it.id, { name: e.target.value })} />
                          {it.needsReview && <span className="mt-1 block text-[14px] text-[#B26A00]">{it.reviewNote ?? "โปรดตรวจสอบข้อมูลจากไฟล์"}</span>}
                        </td>
                        <td className={cell}>
                          <input type="number" min={1} className={input} value={it.qty}
                            aria-label={`จำนวนรายการที่ ${idx + 1}`}
                            onChange={(e) => patchItem(it.id, { qty: Number(e.target.value) || 0 })} />
                          {badQty && <span className="text-[14px] text-[#C2352F]">จำนวนต้องมากกว่า 0</span>}
                        </td>
                        <td className={cell}>
                          <select className={input} value={it.unit} aria-label={`หน่วยรายการที่ ${idx + 1}`}
                            onChange={(e) => patchItem(it.id, { unit: e.target.value })}>
                            {[...new Set([it.unit, ...units])].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className={cell}>
                          <input className={input} value={it.reviewNote ?? ""} placeholder="ระบุหมายเหตุ (ถ้ามี)"
                            aria-label={`หมายเหตุรายการที่ ${idx + 1}`}
                            onChange={(e) => patchItem(it.id, { reviewNote: e.target.value })} />
                        </td>
                        <td className={`${cell} pt-3`}>
                          <span className="flex items-center gap-1">
                            <button type="button" aria-label={`เลื่อนรายการที่ ${idx + 1} ขึ้น`} onClick={() => moveItem(idx, -1)}>
                              <ArrowUp className="h-5 w-5 text-[#8A96A8] hover:text-[#5B258B]" />
                            </button>
                            <button type="button" aria-label={`เลื่อนรายการที่ ${idx + 1} ลง`} onClick={() => moveItem(idx, 1)}>
                              <ArrowDown className="h-5 w-5 text-[#8A96A8] hover:text-[#5B258B]" />
                            </button>
                            <button type="button" aria-label={`ลบรายการที่ ${idx + 1}`} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}>
                              <Trash2 className="h-5 w-5 text-[#8A96A8] hover:text-[#C2352F]" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3">
              <button type="button" onClick={addItem} className="inline-flex items-center gap-2 text-[16px] font-semibold" style={{ color: PURPLE }}>
                <Plus className="h-5 w-5" /> เพิ่มรายการ
              </button>
            </div>
          </section>
        </div>

        {/* 7. แถบข้อมูลด้านขวา */}
        <aside className={`${card} h-fit p-5 lg:sticky lg:top-[76px]`}>
          <h2 className="text-[17px] font-bold">ข้อมูลใบเบิก</h2>

          <label className="mt-4 block text-[15px] font-medium">ลูกค้า</label>
          <div className="mt-1 rounded-[6px] border border-[#DDE2EA] px-3 py-2 text-[15px]">
            {customer?.name ?? "ยังไม่ได้เลือก"}
            <span className="block text-[14px] text-[#5C6B82]">{customer?.code ?? ""}</span>
            {customer?.lineUserId && (
              <span className="mt-1 inline-flex items-center gap-1 text-[14px] text-[#1B7F4B]">
                <MessageCircle className="h-4 w-4" /> เชื่อมต่อ LINE แล้ว {customer.lineName ? `• ${customer.lineName}` : ""}
              </span>
            )}
          </div>

          <label className="mt-4 block text-[15px] font-medium" htmlFor="rd-num">เลขที่ใบเบิก</label>
          <input id="rd-num" readOnly value={reqNumber} className={`${input} mt-1 bg-[#F7F8FA]`} />

          <label className="mt-4 block text-[15px] font-medium" htmlFor="rd-date">วันที่ต้องการรับ</label>
          <input id="rd-date" type="date" value={wantDate} onChange={(e) => setWantDate(e.target.value)} className={`${input} mt-1`} />
          {wantDate && <p className="mt-1 text-[14px] text-[#5C6B82]">{thaiDate(wantDate)}</p>}

          <label className="mt-4 block text-[15px] font-medium" htmlFor="rd-recv">วิธีรับสินค้า</label>
          <select id="rd-recv" value={receive} onChange={(e) => setReceive(e.target.value)} className={`${input} mt-1`}>
            {RECEIVE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <label className="mt-4 block text-[15px] font-medium" htmlFor="rd-note">หมายเหตุ</label>
          <textarea id="rd-note" value={note} maxLength={200} rows={4}
            onChange={(e) => setNote(e.target.value)} placeholder="ระบุหมายเหตุ (ถ้ามี)" className={`${input} mt-1 resize-none`} />
          <p className="mt-1 text-right text-[14px] text-[#8A96A8]">{note.length} / 200</p>

          <p className="mt-4 text-[16px] font-semibold">รวม {items.length} รายการ • {unitsTotal.toLocaleString("th-TH")} หน่วย</p>

          {errors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-[6px] border border-[#F3C9C6] bg-[#FDECEC] p-3 text-[14px] text-[#C2352F]">
              {errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}

          {/* 8. ปุ่มดำเนินการ */}
          <button type="button" onClick={() => save("submitted")} disabled={busy !== ""}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[8px] py-3 text-[17px] font-semibold text-white disabled:opacity-60"
            style={{ background: PURPLE }}>
            {busy === "commit" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} บันทึกใบเบิก
          </button>
          <button type="button" onClick={() => save("draft")} disabled={busy !== ""}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[8px] border py-2.5 text-[16px] disabled:opacity-60"
            style={{ borderColor: "#DDE2EA", color: PURPLE }}>
            {busy === "draft" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} บันทึกร่าง
          </button>
        </aside>
      </main>

      {/* 9. แถบงานจากลูกค้าด้านล่าง */}
      <div className="sticky bottom-0 z-20 border-t border-[#E4DFD8] bg-white px-5 py-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <span className="text-[16px] font-semibold">งานจากลูกค้า {jobs.length} รายการใหม่</span>
          {customer && <span className="text-[15px] text-[#5C6B82]">{customer.name} • {customer.code}</span>}
          <button type="button" onClick={() => setJobsOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-[15px]"
            style={{ borderColor: PURPLE, color: PURPLE }}>
            {jobsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />} ดูรายการทั้งหมด
          </button>
        </div>
        {jobsOpen && (
          <div className="mx-auto mt-3 max-h-[240px] max-w-[1600px] overflow-auto rounded-[8px] border border-[#DDE2EA]">
            {!jobs.length && <p className="p-4 text-[15px] text-[#5C6B82]">ยังไม่มีงานใหม่จากลูกค้า</p>}
            {jobs.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-3 border-b border-[#EDF0F5] px-4 py-2 last:border-0">
                <span className="text-[15px] font-medium">{j.customerName}</span>
                {j.phone && <span className="inline-flex items-center gap-1 text-[14px] text-[#5C6B82]"><Phone className="h-4 w-4" />{j.phone}</span>}
                <span className="text-[14px] text-[#5C6B82]">{j.filename}</span>
                <button type="button" className="ml-auto text-[15px]" style={{ color: PURPLE }}
                  onClick={() => { setQ(j.customerName); setPickerOpen(true); }}>
                  เลือกลูกค้ารายนี้
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* เลือก / เปลี่ยนลูกค้า */}
      {pickerOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4" role="dialog" aria-label="เลือกลูกค้า">
          <div className="w-full max-w-[560px] rounded-[8px] bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold">เลือกลูกค้า</h2>
              <button type="button" aria-label="ปิด" onClick={() => setPickerOpen(false)}><X className="h-5 w-5 text-[#8A96A8]" /></button>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อลูกค้า หรือเบอร์โทร"
              aria-label="ค้นหาลูกค้า" className={`${input} mt-3`} />
            <div className="mt-3 max-h-[360px] overflow-auto rounded-[6px] border border-[#DDE2EA]">
              {customersLoading && <p className="p-4 text-[15px]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลด…</p>}
              {!customersLoading && customersError && <p className="p-4 text-[15px] text-[#C2352F]">{customersError}</p>}
              {!customersLoading && !customersError && !customers.length && <p className="p-4 text-[15px] text-[#5C6B82]">ไม่พบลูกค้าที่ตรงกับคำค้น</p>}
              {customers.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => { setCustomer(c); setPickerOpen(false); setQ(""); }}
                  className="flex w-full items-center gap-3 border-b border-[#EDF0F5] px-4 py-3 text-left last:border-0 hover:bg-[#F6F0FA]">
                  <span className="flex-1">
                    <span className="block text-[16px] font-medium">{c.name}</span>
                    <span className="block text-[14px] text-[#5C6B82]">{c.code}{c.phone ? ` • ${c.phone}` : ""}</span>
                  </span>
                  {c.lineUserId && <MessageCircle className="h-5 w-5 text-[#1B7F4B]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
