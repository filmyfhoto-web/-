import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ClipboardPaste, Sparkles, Store, Plus, Trash2, FileText, Eye, Send, Home, FilePlus2,
  Loader2, Search, AlertTriangle, CheckCircle2, ArrowLeft, Download, History,
  Wallet, ListChecks, MessageCircle, Headset, PlayCircle, MonitorPlay, Clipboard, Pencil,
} from "lucide-react";


import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import SeoHead from "@/components/SeoHead";
import { supabase } from "@/integrations/supabase/client";
import { parseSmartImport } from "@/lib/smartImport";
import {
  Requisition, RequisitionItem, REQUIRE_LOGIN_ERROR, clearAutosave, clearPendingRequisition, deleteRequisition,
  downloadRequisitionCsv, formatMoney, formatThaiDate, grandTotal, lineTotal, listRequisitions, newItemId,
  notifyRequisitionSubmitted, readAutosave, readPendingRequisition, saveRequisition, savePendingRequisition, todayIso,
  writeAutosave,
} from "@/lib/schoolRequisition";
import { downloadRequisitionPdf } from "@/lib/requisitionPdf";
import RequisitionActivity from "@/components/requisition/RequisitionActivity";
import RequisitionProgressStrip from "@/components/requisition/RequisitionProgressStrip";

import { DEFAULT_LINE_OA_URL } from "@/lib/siteConfig";
import { sanitizeNext } from "@/lib/lineSession";




type TabKey = "create" | "drafts" | "sent";

const TABS: { key: TabKey; label: string; icon: typeof FilePlus2 }[] = [
  { key: "create", label: "สร้างใบเขียนเบิก", icon: FilePlus2 },
  { key: "drafts", label: "แบบร่าง", icon: FileText },
  { key: "sent", label: "รายการที่ส่ง", icon: Send },
];

/** ตัวอย่างการกรอกในแถบขวา — ใช้เป็นไฟล์ตัวอย่างให้ดาวน์โหลดด้วย */
const SAMPLE_ROWS = [
  { name: "กระดาษ A4 80 แกรม", qty: 10, unit: "รีม", price: 120 },
  { name: "ปากกาลูกลื่น น้ำเงิน", qty: 50, unit: "ด้าม", price: 7 },
  { name: "แฟ้ม 2 ห่วง สัน 3 นิ้ว", qty: 5, unit: "เล่ม", price: 65 },
];

function downloadSampleCsv() {
  const csv = ["รายการ,จำนวน,หน่วย,ราคา/หน่วย", ...SAMPLE_ROWS.map((r) => `${r.name},${r.qty},${r.unit},${r.price}`)].join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ตัวอย่างใบเขียนเบิก.csv";
  a.click();
  URL.revokeObjectURL(url);
}


export default function SchoolRequisitionPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = (params.get("tab") as TabKey) || "create";
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? tabParam : "create";

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params);
    if (key === "create") next.delete("tab");
    else next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SeoHead
        path="/school-requisition"
        title="สร้างใบเขียนเบิก | NATTA GROUP"
        description="สร้างใบเขียนเบิกสำหรับโรงเรียนและหน่วยงาน วางตารางจาก Excel หรือ Google Sheets แล้วส่งรายการให้ร้านได้ทันที"
      />
      <div className="flex">
        <aside className="hidden lg:flex w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white px-3 py-5 sticky top-0 h-screen overflow-y-auto pb-24">
          <Link to="/" className="flex items-center gap-2 px-2 pb-5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-sm font-black text-white">N</span>
            <span className="text-[15px] font-bold tracking-tight text-slate-900">NATTA GROUP</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Home className="h-4 w-4" /> หน้าหลัก
          </Link>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                tab === t.key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}

          <div className="mt-auto rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-blue-600 shadow-sm">
              <Headset className="h-8 w-8" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-bold text-slate-900">ต้องการความช่วยเหลือ?</p>
            <p className="text-xs text-slate-500">ทีมงานพร้อมช่วยเหลือคุณ</p>
            <Button asChild className="mt-3 w-full bg-blue-600 hover:bg-blue-700">
              <a href={DEFAULT_LINE_OA_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> ติดต่อแอดมิน
              </a>
            </Button>
            <p className="mt-2 text-[11px] text-slate-400">เปิดแชทกับแอดมินทันที</p>
          </div>
        </aside>


        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
            <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="กลับหน้าหลัก">
              <ArrowLeft className="h-5 w-5 text-slate-500" />
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-xs font-black text-white">N</span>
              <span className="text-sm font-bold">NATTA GROUP</span>
            </Link>
            <div className="ml-auto text-xs text-slate-500">เอกสารประมาณการ · ไม่ตัดสต๊อก</div>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 lg:hidden" aria-label="เมนูใบเขียนเบิก">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
                  tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "create" ? <RequisitionEditor onSent={() => setTab("sent")} /> : <RequisitionList status={tab === "drafts" ? "draft" : "submitted"} onEdit={() => setTab("create")} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ editor ------------------------------ */

const DRAFT_EDIT_KEY = "school_requisition_editing_id";

function RequisitionEditor({ onSent }: { onSent: () => void }) {
  const nav = useNavigate();
  const [docId, setDocId] = useState<string | undefined>(() => sessionStorage.getItem(DRAFT_EDIT_KEY) || undefined);
  const [school, setSchool] = useState("");
  const [project, setProject] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [docDate, setDocDate] = useState(todayIso());
  const [items, setItems] = useState<RequisitionItem[]>([]);
  const [note, setNote] = useState<string>("");
  const [pasteText, setPasteText] = useState("");
  const [mode, setMode] = useState<"import" | "manual">("import");

  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [restored, setRestored] = useState(false);
  const [autoRestored, setAutoRestored] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const submittingRef = useRef(false);
  const hydratedRef = useRef(false);
  const autoSubmitRef = useRef(false);
  const [pendingIntent, setPendingIntent] = useState(false);

  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // กู้คืนฟอร์มที่ค้างไว้ก่อนถูกพาไปเข้าสู่ระบบ — ต้องกลับมาครบทุกช่อง
  useEffect(() => {
    const pending = readPendingRequisition();
    if (!pending) return;
    setDocId(pending.id);
    setSchool(pending.school_name);
    setProject(pending.project_name);
    setPreparedBy(pending.prepared_by);
    setDocDate(pending.doc_date || todayIso());
    setNote(pending.note ?? "");
    setItems(pending.items ?? []);
    setRestored(true);
    hydratedRef.current = true;
    if (pending.intent_submit) {
      setConfirmed(true);
      setPendingIntent(true);
      toast.info("กู้คืนข้อมูลใบเขียนเบิกที่กรอกไว้แล้ว");
    }

  }, []);

  // โหลดเอกสารที่เลือกมาแก้จากแท็บแบบร่าง แล้วค่อยตกมาที่ร่างอัตโนมัติ
  useEffect(() => {
    if (readPendingRequisition()) return;
    const id = sessionStorage.getItem(DRAFT_EDIT_KEY);
    if (!id) {
      const auto = readAutosave();
      if (auto) {
        setDocId(auto.id);
        setSchool(auto.school_name);
        setProject(auto.project_name);
        setPreparedBy(auto.prepared_by);
        setDocDate(auto.doc_date || todayIso());
        setNote(auto.note ?? "");
        setItems(auto.items ?? []);
        setAutoSavedAt(auto.saved_at);
        setAutoRestored(true);
      }
      hydratedRef.current = true;
      return;
    }
    (async () => {
      const all = [...(await listRequisitions("draft")), ...(await listRequisitions("submitted"))];
      const doc = all.find((d) => d.id === id);
      if (!doc) return;
      setDocId(doc.id);
      setSchool(doc.school_name);
      setProject(doc.project_name);
      setPreparedBy(doc.prepared_by);
      setDocDate(doc.doc_date);
      setItems(doc.items ?? []);
    })().catch(() => undefined).finally(() => { hydratedRef.current = true; });
  }, []);

  // บันทึกร่างอัตโนมัติในเครื่อง (หน่วง 1 วินาทีหลังหยุดพิมพ์)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      const saved = writeAutosave({
        id: docId,
        school_name: school,
        project_name: project,
        prepared_by: preparedBy,
        doc_date: docDate,
        note: note || null,
        items,
      });
      setAutoSavedAt(saved?.saved_at ?? null);
    }, 1000);
    return () => clearTimeout(t);
  }, [docId, school, project, preparedBy, docDate, note, items]);

  const discardAutosave = () => {
    clearAutosave();
    setDocId(undefined);
    setSchool("");
    setProject("");
    setPreparedBy("");
    setDocDate(todayIso());
    setNote("");
    setItems([]);
    setConfirmed(false);
    setAutoRestored(false);
    setAutoSavedAt(null);
    sessionStorage.removeItem(DRAFT_EDIT_KEY);
    toast.success("ล้างร่างแล้ว เริ่มกรอกใหม่ได้เลย");
  };


  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session?.user?.id)); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session?.user?.id)));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const total = useMemo(() => grandTotal(items), [items]);
  const reviewCount = items.filter((i) => i.needsReview).length;

  const validate = useCallback(() => {
    const e: Record<string, string> = {};
    if (!school.trim()) e.school = "กรุณากรอกชื่อโรงเรียนหรือหน่วยงาน";
    if (!preparedBy.trim()) e.preparedBy = "กรุณากรอกชื่อผู้จัดทำ";
    if (!docDate) e.docDate = "กรุณาเลือกวันที่";
    if (items.length === 0) e.items = "กรุณาเพิ่มอย่างน้อย 1 รายการ";
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [school, preparedBy, docDate, items.length]);

  const applyParsed = (text: string) => {
    const result = parseSmartImport(text);
    if (result.rows.length === 0) {
      toast.error("ไม่พบรายการในข้อความที่วาง กรุณาตรวจสอบข้อมูลอีกครั้ง");
      return;
    }
    setItems((prev) => [
      ...prev,
      ...result.rows.map<RequisitionItem>((r) => ({
        id: newItemId(),
        code: r.code,
        name: r.name,
        unit: r.unit,
        price: r.price,
        qty: r.qty,
        source: "import",
        needsReview: r.needsReview,
        reviewNote: r.reviewNote,
      })),
    ]);
    const warn = result.rows.filter((r) => r.needsReview).length;
    toast.success(
      warn > 0
        ? `นำเข้าแล้ว ${result.rows.length} รายการ (มี ${warn} รายการต้องตรวจสอบ)`
        : `นำเข้าแล้ว ${result.rows.length} รายการ`
    );
    setPasteText("");
    setConfirmed(false);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error("empty");
      setPasteText(text);
      toast.success("วางข้อมูลจากคลิปบอร์ดแล้ว กด “จัดเรียงรายการ” เพื่อแยกรายการ");
    } catch {
      pasteRef.current?.focus();
      toast.info("เบราว์เซอร์ไม่อนุญาตให้อ่านคลิปบอร์ด กรุณากด Ctrl+V (หรือ ⌘+V) ในกล่องข้อความ");
    }
  };

  const updateItem = (id: string, patch: Partial<RequisitionItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch, needsReview: patch.needsReview ?? (patch.price !== undefined || patch.qty !== undefined || patch.name !== undefined ? false : it.needsReview) } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    toast.success("ลบรายการแล้ว");
  };

  const addManual = () => {
    setItems((prev) => [
      ...prev,
      { id: newItemId(), code: "", name: "", unit: "ชิ้น", price: 0, qty: 1, source: "manual", needsReview: true, reviewNote: "กรอกชื่อและราคาให้ครบ" },
    ]);
  };

  const persist = async (status: "draft" | "submitted") => {
    if (!validate()) {
      toast.error("กรุณากรอกข้อมูลให้ครบก่อนบันทึก");
      return null;
    }
    setBusy(status === "draft" ? "draft" : "submit");
    try {
      const saved = await saveRequisition({
        id: docId,
        school_name: school.trim(),
        project_name: project.trim(),
        prepared_by: preparedBy.trim(),
        doc_date: docDate,
        status,
        items,
        note: note.trim() || null,
      });
      setDocId(saved.id);
      sessionStorage.setItem(DRAFT_EDIT_KEY, saved.id);
      return saved;
    } catch (err) {
      toast.error(`บันทึกไม่สำเร็จ: ${(err as Error).message}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const onSaveDraft = async () => {
    const saved = await persist("draft");
    if (saved) toast.success(saved.local ? "บันทึกแบบร่างไว้ในเครื่องนี้แล้ว" : "บันทึกแบบร่างแล้ว");
  };

  /** เก็บฟอร์มไว้ให้ครบ แล้วพาไปเข้าสู่ระบบพร้อม next กลับ "หน้าเดิมจริง ๆ" (รวม query/hash) */
  const goLogin = () => {
    savePendingRequisition({
      id: docId,
      school_name: school.trim(),
      project_name: project.trim(),
      prepared_by: preparedBy.trim(),
      doc_date: docDate,
      note: note.trim() || null,
      items,
      intent_submit: true,
    });
    toast.info("กรุณาเข้าสู่ระบบก่อนส่งใบเขียนเบิก ระบบจะส่งรายการให้อัตโนมัติหลังล็อกอิน");
    const here =
      typeof window !== "undefined"
        ? sanitizeNext(`${window.location.pathname}${window.location.search}${window.location.hash}`)
        : null;
    nav(`/login?next=${encodeURIComponent(here || "/school-requisition")}`);
  };


  const onSubmit = async () => {
    if (submittingRef.current) return; // กันกดซ้ำ / ส่งซ้ำ
    if (!validate()) {
      toast.error("กรุณากรอกข้อมูลให้ครบก่อนส่ง");
      return;
    }
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user?.id) {
      setConfirmSend(false);
      goLogin();
      return;
    }
    submittingRef.current = true;
    try {
      const saved = await persist("submitted");
      if (!saved) return;
      sessionStorage.removeItem(DRAFT_EDIT_KEY);
      clearPendingRequisition();
      clearAutosave();
      // แจ้งเตือนเข้ากลุ่ม LINE รับออเดอร์ — ล้มเหลวต้องไม่ทำให้การส่งล้มเหลว
      const notified = await notifyRequisitionSubmitted(saved.id);
      toast.success(
        notified.ok
          ? "ส่งรายการให้ร้านเรียบร้อยแล้ว"
          : "ส่งรายการให้ร้านเรียบร้อยแล้ว (แจ้งเตือน LINE ไม่สำเร็จ ร้านยังเห็นรายการในระบบ)",
        { action: { label: "ดาวน์โหลด CSV", onClick: () => downloadRequisitionCsv(saved) }, duration: 10000 },
      );
      setDocId(undefined);
      setItems([]);
      setConfirmed(false);
      setSchool("");
      setProject("");
      setPreparedBy("");
      setNote("");
      setRestored(false);
      setAutoRestored(false);
      setAutoSavedAt(null);
      onSent();
    } catch (err) {
      if ((err as Error).message === REQUIRE_LOGIN_ERROR) goLogin();
      else toast.error(`ส่งไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      submittingRef.current = false;
    }
  };

  /**
   * ส่งรายการที่ค้างไว้ให้อัตโนมัติหลังล็อกอินสำเร็จ — ลูกค้าไม่ต้องกดส่งซ้ำ
   * เงื่อนไข: มีใบค้างที่ตั้งใจส่ง (intent_submit) + ล็อกอินแล้ว + ข้อมูลครบ
   */
  useEffect(() => {
    if (!pendingIntent || signedIn !== true || autoSubmitRef.current) return;
    if (items.length === 0 || !school.trim() || !preparedBy.trim() || !docDate) return;
    autoSubmitRef.current = true;
    setPendingIntent(false);
    setConfirmSend(false);
    toast.info("เข้าสู่ระบบแล้ว — กำลังส่งรายการที่ค้างไว้ให้อัตโนมัติ");
    void onSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIntent, signedIn, items.length, school, preparedBy, docDate]);


  const stepIndex = items.length === 0 ? 0 : confirmed ? 2 : 1;

  return (
    <div className="px-4 pb-44 pt-5 lg:px-8">
      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">สร้างใบเขียนเบิก</h1>
            <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-600">ไม่ตัดสต๊อก</Badge>
          </div>
          {/* สถานะออเดอร์ที่ลูกค้าเข้าใจง่าย */}
          <RequisitionProgressStrip stage={busy === "submit" ? 1 : 0} busy={busy === "submit"} className="mb-4" />

          {/* stepper */}

          <ol className="mb-5 flex items-center gap-3 text-sm" aria-label="ขั้นตอนการสร้างใบเขียนเบิก">
            {["กรอกข้อมูล", "เพิ่มรายการสินค้า", "ตรวจสอบและส่ง"].map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-3">
                <span
                  aria-current={stepIndex === i ? "step" : undefined}
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    stepIndex >= i ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`hidden whitespace-nowrap sm:inline ${stepIndex >= i ? "font-medium text-blue-600" : "text-slate-500"}`}>{label}</span>
                {i < 2 && <span className="h-px flex-1 bg-slate-200" aria-hidden />}
              </li>
            ))}
          </ol>

          {/* การ์ด 1 — ข้อมูลใบเขียนเบิก */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-6">
            <h2 className="mb-4 flex items-center gap-2.5 text-base font-bold text-slate-800">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
              ข้อมูลใบเขียนเบิก
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="ชื่อโรงเรียน / หน่วยงาน" htmlFor="rq-school" error={errors.school} required>
                <Input id="rq-school" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="เช่น โรงเรียนบ้านศรีกลาง" />
              </Field>
              <Field label="ชื่อโครงการ" htmlFor="rq-project">
                <Input id="rq-project" value={project} onChange={(e) => setProject(e.target.value)} placeholder="เช่น โครงการค่ายเยาวชน" />
              </Field>
              <Field label="ผู้จัดทำ" htmlFor="rq-by" error={errors.preparedBy} required>
                <Input id="rq-by" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="ชื่อ-นามสกุล" />
              </Field>
              <Field label={`วันที่ (พ.ศ. ${formatThaiDate(docDate) || "-"})`} htmlFor="rq-date" error={errors.docDate} required>
                <Input id="rq-date" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="rq-note" className="text-xs font-medium text-slate-500">เหตุผล / รายละเอียด</Label>
              <Textarea
                id="rq-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="ระบุเหตุผลและรายละเอียดเพิ่มเติม (ถ้ามี)"
                className="min-h-[92px]"
              />
              <p className="text-right text-xs text-slate-400">{note.length} / 500</p>
            </div>
          </section>

          {/* การ์ด 2 — เพิ่มรายการสินค้า */}
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:p-6">
            <h2 className="mb-4 flex items-center gap-2.5 text-base font-bold text-slate-800">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
              เพิ่มรายการสินค้า
            </h2>

            <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="วิธีเพิ่มรายการ">
              <button
                type="button" role="tab" aria-selected={mode === "import"}
                onClick={() => setMode("import")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "import" ? "border-blue-600 bg-blue-50/60 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Sparkles className="h-4 w-4" /> Smart Import
              </button>
              <button
                type="button" role="tab" aria-selected={mode === "manual"}
                onClick={() => setMode("manual")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "manual" ? "border-blue-600 bg-blue-50/60 text-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Plus className="h-4 w-4" /> เพิ่มรายการเอง
              </button>
            </div>

            {mode === "import" ? (
              <>
                <ol className="my-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {["วางข้อมูล", "ตรวจข้อมูล", "จัดเรียงรายการ"].map((step, i) => (
                    <li key={step} className="flex items-center gap-2">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i === 0 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1}</span>
                      <span className={i === 0 ? "text-blue-600" : "text-slate-500"}>{step}</span>
                      {i < 2 && <span className="mx-1 hidden w-10 border-t border-dashed border-slate-300 sm:block" aria-hidden />}
                    </li>
                  ))}
                </ol>

                <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
                  <div className="relative rounded-xl border-2 border-dashed border-blue-200 bg-slate-50/70 p-4">
                    <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center">
                      {!pasteText && (
                        <div>
                          <Clipboard className="mx-auto mb-2 h-5 w-5 text-slate-400" aria-hidden />
                          <p className="text-sm font-medium text-slate-600">วางข้อมูลที่คัดลอกไว้ที่นี่</p>
                          <p className="text-xs text-slate-400">รองรับ Excel, Google Sheets, CSV และการวางจากไฟล์เดิม</p>
                          <p className="mt-1 text-xs text-slate-400">หรือวางข้อมูล (Ctrl + V)</p>
                        </div>
                      )}
                    </div>
                    <Textarea
                      ref={pasteRef}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      aria-label="พื้นที่วางรายการจาก Excel หรือ Google Sheets"
                      className="min-h-[130px] resize-none border-0 bg-transparent font-mono text-[13px] shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" onClick={pasteFromClipboard}>
                      <ClipboardPaste className="mr-2 h-4 w-4" /> วางจากคลิปบอร์ด
                    </Button>
                    <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => applyParsed(pasteText)} disabled={!pasteText.trim()}>
                      <Sparkles className="mr-2 h-4 w-4" /> จัดเรียงรายการ
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
                      <Store className="mr-2 h-4 w-4" /> เลือกสินค้าจากร้าน
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                <p className="text-sm text-slate-500">เพิ่มรายการทีละบรรทัด แล้วกรอกชื่อ จำนวน หน่วย และราคาในตารางด้านล่าง</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={addManual}>
                    <Plus className="mr-2 h-4 w-4" /> เพิ่มรายการเอง
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
                    <Store className="mr-2 h-4 w-4" /> เลือกสินค้าจากร้าน
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ตาราง */}
          <section className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
              <h2 className="font-bold text-slate-800">
                รายการสินค้า <span className="text-sm font-normal text-slate-500">({items.length} รายการ)</span>
              </h2>
              {reviewCount > 0 && (
                <span className="inline-flex items-center gap-1 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> ต้องตรวจสอบ {reviewCount} รายการ
                </span>
              )}
              <Button type="button" variant="outline" size="sm" className="ml-auto border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={addManual}>
                <Plus className="mr-1.5 h-4 w-4" /> เพิ่มรายการเอง
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                ยังไม่มีรายการ — วางข้อมูลด้วย Smart Import เลือกสินค้าจากร้าน หรือกด “เพิ่มรายการเอง”
              </p>
            ) : (
              <>
                {/* desktop */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                        <th className="w-12 px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">รายการ</th>
                        <th className="w-24 px-3 py-2.5 text-right">จำนวน</th>
                        <th className="w-24 px-3 py-2.5">หน่วย</th>
                        <th className="w-36 px-3 py-2.5 text-right">ราคา/หน่วย (บาท)</th>
                        <th className="w-32 px-3 py-2.5 text-right">รวม (บาท)</th>
                        <th className="w-24 px-3 py-2.5 text-center">การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={it.id} className={`border-b border-slate-100 ${it.needsReview ? "bg-amber-50" : ""}`}>
                          <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <Input
                              id={`rq-item-${it.id}`}
                              aria-label={`ชื่อรายการที่ ${idx + 1}`}
                              value={it.name}
                              onChange={(e) => updateItem(it.id, { name: e.target.value })}
                              className="h-9 border-transparent bg-transparent hover:border-slate-200 focus:border-slate-300"
                              placeholder="ชื่อสินค้า"
                            />
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1">
                              {it.code && <span className="text-[11px] text-slate-400">{it.code}</span>}
                              {it.source === "manual" && <Badge variant="secondary" className="h-5 text-[11px]">เพิ่มเอง</Badge>}
                              {it.source === "shop" && <Badge variant="secondary" className="h-5 text-[11px]">จากร้าน</Badge>}
                              {it.needsReview && <span className="text-[11px] text-amber-700">ต้องตรวจสอบ{it.reviewNote ? ` · ${it.reviewNote}` : ""}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              aria-label={`จำนวนของรายการที่ ${idx + 1}`}
                              type="number" min={0} step="1" inputMode="numeric"
                              value={String(it.qty)}
                              onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) || 0 })}
                              className="h-9 text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              aria-label={`หน่วยของรายการที่ ${idx + 1}`}
                              value={it.unit}
                              onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                              className="h-9"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              aria-label={`ราคาต่อหน่วยของรายการที่ ${idx + 1}`}
                              type="number" min={0} step="0.01" inputMode="decimal"
                              value={String(it.price)}
                              onChange={(e) => updateItem(it.id, { price: Number(e.target.value) || 0 })}
                              className="h-9 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{formatMoney(lineTotal(it))}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button" variant="ghost" size="icon"
                                aria-label={`แก้ไขรายการที่ ${idx + 1}`}
                                onClick={() => document.getElementById(`rq-item-${it.id}`)?.focus()}
                              >
                                <Pencil className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" aria-label={`ลบรายการที่ ${idx + 1}`} onClick={() => removeItem(it.id)}>
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* mobile cards */}
                <ul className="divide-y divide-slate-100 md:hidden">
                  {items.map((it, idx) => (
                    <li key={it.id} className={`space-y-2 p-3 ${it.needsReview ? "bg-amber-50" : ""}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-2 text-xs text-slate-400">{idx + 1}</span>
                        <Input aria-label={`ชื่อรายการที่ ${idx + 1}`} value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} placeholder="ชื่อสินค้า" />
                        <Button type="button" variant="ghost" size="icon" aria-label={`ลบรายการที่ ${idx + 1}`} onClick={() => removeItem(it.id)}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-xs text-slate-500">จำนวน
                          <Input type="number" min={0} step="1" inputMode="numeric" value={String(it.qty)} onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) || 0 })} className="mt-1 h-9 text-right" />
                        </label>
                        <label className="text-xs text-slate-500">หน่วย
                          <Input value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} className="mt-1 h-9" />
                        </label>
                        <label className="text-xs text-slate-500">ราคา
                          <Input type="number" min={0} step="0.01" inputMode="decimal" value={String(it.price)} onChange={(e) => updateItem(it.id, { price: Number(e.target.value) || 0 })} className="mt-1 h-9 text-right" />
                        </label>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex gap-1.5">
                          {it.source === "manual" && <Badge variant="secondary" className="h-5 text-[11px]">เพิ่มเอง</Badge>}
                          {it.source === "shop" && <Badge variant="secondary" className="h-5 text-[11px]">จากร้าน</Badge>}
                        </div>
                        <span className="font-semibold tabular-nums">{formatMoney(lineTotal(it))} บาท</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {errors.items && <p className="px-4 pb-3 text-sm text-rose-600">{errors.items}</p>}
          </section>
        </div>

        {/* แถบขวา — ตัวช่วย */}
        <aside className="hidden w-80 shrink-0 space-y-4 xl:block" aria-label="ตัวช่วยการใช้งาน">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">ตัวอย่างไฟล์ / ตัวอย่างการกรอก</h3>
            <table className="w-full border border-slate-200 text-[11px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-1.5 text-left font-medium">รายการ</th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-right font-medium">จำนวน</th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-left font-medium">หน่วย</th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-right font-medium">ราคา/หน่วย</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                {SAMPLE_ROWS.map((r) => (
                  <tr key={r.name}>
                    <td className="border-b border-slate-100 px-2 py-1.5">{r.name}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums">{r.qty}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5">{r.unit}</td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums">{r.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button type="button" variant="ghost" className="mt-2 w-full text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={downloadSampleCsv}>
              <Download className="mr-2 h-4 w-4" /> ดาวน์โหลดตัวอย่างไฟล์
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">เคล็ดลับการใช้งาน</h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {[
                "วางข้อมูลจาก Excel/Google Sheets ได้โดยตรง",
                "ตรวจสอบหน่วยและราคาให้ถูกต้องก่อนส่ง",
                "ใช้ปุ่ม “จัดเรียงรายการ” เพื่อจัดรูปแบบอัตโนมัติ",
                "บันทึกร่างได้ตลอด ไม่ต้องเริ่มใหม่",
              ].map((tip) => (
                <li key={tip} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden /> {tip}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-800">ขั้นตอนการใช้งาน</h3>
            <ol className="space-y-2.5 text-xs text-slate-600">
              {[
                "กรอกข้อมูลใบเขียนเบิกให้ครบถ้วน",
                "เพิ่มรายการสินค้า ด้วย Smart Import หรือเพิ่มเอง",
                "ตรวจสอบรายการและส่งรายการให้ร้าน",
              ].map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <h3 className="mb-1 text-sm font-bold text-blue-700">วิดีโอแนะนำการใช้งาน</h3>
            <p className="text-xs text-slate-500">ดูวิธีใช้งานระบบสร้างใบเขียนเบิกแบบละเอียด</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <Button asChild variant="outline" className="border-blue-200 bg-white text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                <Link to="/guide">
                  <PlayCircle className="mr-2 h-4 w-4" /> ดูวิดีโอ
                </Link>
              </Button>
              <MonitorPlay className="h-10 w-10 text-blue-300" aria-hidden />
            </div>
          </div>
        </aside>
      </div>

      {/* แถบสรุปด้านล่าง */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:pl-64 lg:pr-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-slate-400" aria-hidden />
            <div>
              <div className="text-[11px] text-slate-500">ยอดรวมทั้งหมด</div>
              <div className="text-xl font-bold text-blue-600 tabular-nums">
                {formatMoney(total)} <span className="text-sm font-normal text-slate-500">บาท</span>
              </div>
            </div>
          </div>
          <div className="hidden h-9 w-px bg-slate-200 sm:block" aria-hidden />
          <div className="flex items-center gap-2.5">
            <ListChecks className="h-5 w-5 text-slate-400" aria-hidden />
            <div>
              <div className="text-[11px] text-slate-500">จำนวนรายการ</div>
              <div className="text-lg font-bold text-blue-600 tabular-nums">
                {items.length} <span className="text-sm font-normal text-slate-500">รายการ</span>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(Boolean(v))} aria-label="ตรวจสอบรายการเรียบร้อยแล้ว" />
            ตรวจสอบรายการเรียบร้อยแล้ว
          </label>
          <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
            <Button type="button" variant="outline" onClick={onSaveDraft} disabled={busy !== null} className="flex-1 text-slate-600 sm:flex-none">
              {busy === "draft" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />} บันทึกร่าง
            </Button>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)} disabled={items.length === 0} className="flex-1 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 sm:flex-none">
              <Eye className="mr-2 h-4 w-4" /> ดูตัวอย่าง
            </Button>
            <Button
              type="button"
              className="flex-1 bg-blue-600 hover:bg-blue-700 sm:flex-none"
              disabled={busy !== null || items.length === 0 || !confirmed}
              onClick={() => {
                if (!validate()) { toast.error("กรุณากรอกข้อมูลให้ครบก่อนส่ง"); return; }
                if (signedIn === false) { goLogin(); return; }
                setConfirmSend(true);
              }}
            >
              {busy === "submit" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} ส่งรายการให้ร้าน
            </Button>
          </div>
        </div>
        {signedIn === false && items.length > 0 && (
          <p className="pt-1 text-xs text-amber-700">ยังไม่ได้เข้าสู่ระบบ — บันทึกร่างในเครื่องได้ แต่ต้องเข้าสู่ระบบก่อนส่งใบเขียนเบิก</p>
        )}
        {restored && (
          <p className="pt-1 text-xs text-emerald-700">กู้คืนข้อมูลที่กรอกไว้ก่อนเข้าสู่ระบบแล้ว</p>
        )}
        {autoRestored && (
          <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-emerald-700">
            กู้คืนร่างล่าสุดแล้ว
            <button type="button" onClick={discardAutosave} className="font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700">
              เริ่มใหม่
            </button>
          </p>
        )}
        {autoSavedAt && (
          <p className="pt-1 text-xs text-slate-500">
            บันทึกร่างอัตโนมัติ • {new Date(autoSavedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
          </p>
        )}
        {!confirmed && items.length > 0 && (
          <p className="pt-1 text-xs text-slate-500">ติ๊ก “ตรวจสอบรายการเรียบร้อยแล้ว” เพื่อเปิดใช้งานปุ่มส่งรายการ</p>
        )}
      </div>


      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(picked) => {
          setItems((prev) => [...prev, ...picked]);
          toast.success(`เพิ่ม ${picked.length} รายการจากร้านแล้ว (ไม่ตัดสต๊อก)`);
        }}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>ตัวอย่างใบเขียนเบิก</DialogTitle>
            <DialogDescription>เอกสารประมาณการ ไม่มีการตัดสต๊อกสินค้า</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
              <div><span className="text-slate-500">โรงเรียน/หน่วยงาน: </span>{school || "-"}</div>
              <div><span className="text-slate-500">โครงการ: </span>{project || "-"}</div>
              <div><span className="text-slate-500">ผู้จัดทำ: </span>{preparedBy || "-"}</div>
              <div><span className="text-slate-500">วันที่: </span>{formatThaiDate(docDate)}</div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-1">#</th><th>รายการ</th><th className="text-right">ราคา</th><th className="text-right">จำนวน</th><th className="text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="py-1">{i + 1}</td>
                    <td>{it.name}</td>
                    <td className="text-right tabular-nums">{formatMoney(it.price)}</td>
                    <td className="text-right tabular-nums">{it.qty} {it.unit}</td>
                    <td className="text-right tabular-nums">{formatMoney(lineTotal(it))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-base font-bold">ยอดรวมทั้งสิ้น {formatMoney(total)} บาท</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>ปิด</Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadRequisitionPdf({
                  id: docId || "draft",
                  school_name: school,
                  project_name: project,
                  prepared_by: preparedBy,
                  doc_date: docDate,
                  status: "draft",
                  items,
                  total,
                  note: note || null,
                  submitted_at: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
              }
            >
              <Download className="mr-1.5 h-4 w-4" /> ดาวน์โหลด PDF
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadRequisitionCsv({
                  id: docId || "draft",
                  school_name: school,
                  project_name: project,
                  prepared_by: preparedBy,
                  doc_date: docDate,
                  status: "draft",
                  items,
                  total,
                  note: note || null,
                  submitted_at: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
              }
            >
              <Download className="mr-1.5 h-4 w-4" /> ดาวน์โหลด CSV
            </Button>
            <Button onClick={() => { setPreviewOpen(false); window.print(); }}>พิมพ์</Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันส่งรายการให้ร้าน?</AlertDialogTitle>
            <AlertDialogDescription>
              ส่ง {items.length} รายการ ยอดรวม {formatMoney(total)} บาท ให้ร้านตรวจสอบ — เป็นเอกสารประมาณการ ยังไม่ตัดสต๊อกและยังไม่ใช่การสั่งซื้อ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={onSubmit}>ยืนยันส่ง</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <button type="button" className="sr-only" onClick={() => nav("/")}>กลับหน้าหลัก</button>
    </div>
  );
}

function Field({ label, htmlFor, error, required, children }: { label: string; htmlFor: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-slate-500">
        {label}{required && <span className="text-rose-500"> *</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/* --------------------------- product picker --------------------------- */

type ShopProduct = { id: string; code: string; name: string; unit: string; standard_price: number };

function ProductPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (items: RequisitionItem[]) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      let query = supabase
        .from("products")
        .select("id, code, name, unit, standard_price")
        .eq("active", true)
        .is("deleted_at", null)
        .order("name")
        .limit(50);
      if (q.trim()) query = query.or(`name.ilike.%${q.trim()}%,code.ilike.%${q.trim()}%`);
      const { data, error } = await query;
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error("โหลดสินค้าไม่สำเร็จ");
        return;
      }
      setRows((data ?? []) as ShopProduct[]);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const confirm = () => {
    const picked = rows.filter((r) => selected[r.id]);
    if (picked.length === 0) {
      toast.info("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    onPick(
      picked.map<RequisitionItem>((p) => ({
        id: newItemId(),
        code: p.code,
        name: p.name,
        unit: p.unit || "ชิ้น",
        price: Number(p.standard_price) || 0,
        qty: 1,
        source: "shop",
      }))
    );
    setSelected({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>เลือกสินค้าจากร้าน</DialogTitle>
          <DialogDescription>คัดลอกชื่อ รหัส หน่วย และราคามาใช้ในใบนี้เท่านั้น — ไม่ตัดจำนวนสินค้าในร้าน</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อหรือรหัสสินค้า" className="pl-9" aria-label="ค้นหาสินค้า" />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {loading && <p className="py-6 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลด...</p>}
          {!loading && rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">ไม่พบสินค้า</p>}
          {rows.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-2.5 text-sm hover:bg-slate-50">
              <Checkbox checked={Boolean(selected[p.id])} onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.id]: Boolean(v) }))} aria-label={`เลือก ${p.name}`} />
              <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-slate-400">{p.code}</span></span>
              <span className="tabular-nums text-slate-600">{formatMoney(Number(p.standard_price))}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={confirm} className="bg-blue-600 hover:bg-blue-700">เพิ่มลงใบเขียนเบิก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ lists ------------------------------ */

function RequisitionList({ status, onEdit }: { status: "draft" | "submitted"; onEdit: () => void }) {
  const [rows, setRows] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyDoc, setHistoryDoc] = useState<Requisition | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listRequisitions(status)
      .then(setRows)
      .catch((e) => toast.error(`โหลดข้อมูลไม่สำเร็จ: ${(e as Error).message}`))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(load, [load]);


  return (
    <div className="px-4 py-5 lg:px-8">
      <RequisitionProgressStrip stage={status === "draft" ? 0 : 2} className="mb-4" />
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{status === "draft" ? "แบบร่าง" : "รายการที่ส่ง"}</h1>

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> กำลังโหลด...
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {status === "draft" ? "ยังไม่มีแบบร่าง" : "ยังไม่มีรายการที่ส่งให้ร้าน"}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{doc.school_name || "(ไม่ระบุหน่วยงาน)"}</div>
                <div className="truncate text-xs text-slate-500">
                  {doc.project_name || "-"} · {formatThaiDate(doc.doc_date)} · {doc.items?.length ?? 0} รายการ
                  {doc.local ? " · เก็บในเครื่องนี้" : ""}
                </div>
              </div>
              <div className="text-right font-semibold tabular-nums">{formatMoney(doc.total)} บาท</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    sessionStorage.setItem("school_requisition_editing_id", doc.id);
                    onEdit();
                  }}
                >
                  {status === "draft" ? "แก้ไขต่อ" : "เปิดดู"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadRequisitionPdf(doc)}>
                  <Download className="mr-1.5 h-4 w-4" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadRequisitionCsv(doc)}>
                  <Download className="mr-1.5 h-4 w-4" /> CSV
                </Button>
                {!doc.local && (
                  <Button variant="outline" size="sm" onClick={() => setHistoryDoc(doc)}>
                    <History className="mr-1.5 h-4 w-4" /> ประวัติ
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="ลบเอกสาร"
                  onClick={async () => {
                    try {
                      await deleteRequisition(doc);
                      toast.success("ลบเอกสารแล้ว");
                      load();
                    } catch (e) {
                      toast.error(`ลบไม่สำเร็จ: ${(e as Error).message}`);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(historyDoc)} onOpenChange={(o) => !o && setHistoryDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ประวัติการแก้ไข — {historyDoc?.school_name || "ใบเขียนเบิก"}</DialogTitle>
            <DialogDescription>วันเวลาและฟิลด์ที่เปลี่ยนของเอกสารนี้</DialogDescription>
          </DialogHeader>
          {historyDoc && <RequisitionActivity requisitionId={historyDoc.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );

}
