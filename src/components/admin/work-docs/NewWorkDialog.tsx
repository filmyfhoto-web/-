/**
 * "รับงานใหม่" — กล่องเดียวจบ 3 ทาง: พิมพ์เอง / แนบไฟล์ให้ระบบอ่าน / รับจาก LINE
 * เลือกได้ว่าจะบันทึกเป็น "คำสั่งซื้อ" หรือ "ใบเบิก" — เข้าลิสต์เดียวกันของหน้า งานและเอกสาร
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FALLBACK_UNITS, RECEIVE_METHODS, listInboxJobs, listUnits, newItemId, searchCustomers,
  type DeskCustomer, type InboxJob, type WorkLineItem,
} from "@/lib/workDesk";
import {
  INTAKE_METHODS, NEW_WORK_KIND_LABEL, itemsTotal, nextReqNumber, saveNewWork, validateNewWork,
  type IntakeMethod, type NewWorkKind, type NewWorkResult, type SourceFile,
} from "@/lib/workIntake";
import CustomerFilesPicker from "./CustomerFilesPicker";
import CustomerAvatar from "./CustomerAvatar";
import useLineProfileMap from "@/hooks/useLineProfileMap";


/** ค่าตั้งต้นเมื่อเปิดจากการ์ด "ข้อความ LINE น่าจะเป็นรายการสั่งของ" */
export interface NewWorkPrefill {
  customerName: string;
  lineUserId: string | null;
  items: WorkLineItem[];
  note?: string;
}



export default function NewWorkDialog({
  open,
  onOpenChange,
  onSaved,
  prefill,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (res: NewWorkResult) => void;
  prefill?: NewWorkPrefill | null;
}) {
  const [kind, setKind] = useState<NewWorkKind>("order");
  const [method, setMethod] = useState<IntakeMethod>("manual");
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<DeskCustomer[]>([]);
  const [customer, setCustomer] = useState<DeskCustomer | null>(null);
  const [units, setUnits] = useState<string[]>(FALLBACK_UNITS);
  const [items, setItems] = useState<WorkLineItem[]>([]);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [wantDate, setWantDate] = useState("");
  const [receive, setReceive] = useState<string>(RECEIVE_METHODS[0]);
  const [note, setNote] = useState("");
  const [jobs, setJobs] = useState<InboxJob[]>([]);
  const [reqNumber, setReqNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);




  const load = useCallback(async (term: string) => {
    try { setCustomers(await searchCustomers(term)); } catch { setCustomers([]); }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load("");
    void listUnits().then(setUnits).catch(() => undefined);
    void nextReqNumber().then(setReqNumber).catch(() => undefined);
    void listInboxJobs().then(setJobs).catch(() => setJobs([]));

  }, [open, load]);

  /** เปิดจากการ์ดข้อความ LINE — เติมรายการ + เดาลูกค้าจาก LINE id / ชื่อ ให้เลย */
  useEffect(() => {
    if (!open || !prefill) return;
    setItems(prefill.items);
    setNote(prefill.note ?? "");
    setQ(prefill.customerName);
    void (async () => {
      try {
        const found = await searchCustomers(prefill.customerName);
        setCustomers(found);
        const byLine = prefill.lineUserId
          ? found.find((c) => c.lineUserId === prefill.lineUserId)
          : undefined;
        const byName = found.find((c) => c.name.trim() === prefill.customerName.trim());
        setCustomer(byLine ?? byName ?? null);
      } catch { /* เลือกลูกค้าเองได้ตามปกติ */ }
    })();
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void load(q); }, 300);
    return () => clearTimeout(t);
  }, [q, open, load]);


  const total = useMemo(() => itemsTotal(items), [items]);
  const profiles = useLineProfileMap([...customers.map((c) => c.lineUserId), customer?.lineUserId]);


  function patch(id: string, p: Partial<WorkLineItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p, needsReview: false } : it)));
  }

  function reset() {
    setItems([]); setSourceFiles([]); setNote(""); setWantDate(""); setQ("");
    setReceive(RECEIVE_METHODS[0]); setCustomer(null); setMethod("manual"); setKind("order");
  }

  async function save() {
    if (savingRef.current) return;
    if (!customer) { toast.error("เลือกลูกค้าก่อนบันทึก"); return; }
    const payload = { customer, items, wantDate, receiveMethod: receive, note, sourceFiles };
    const errs = validateNewWork(payload);
    if (errs.length) { toast.error(errs[0]); return; }

    savingRef.current = true; setSaving(true);
    try {
      const res = await saveNewWork({ ...payload, kind }, reqNumber);
      toast.success(`บันทึก${NEW_WORK_KIND_LABEL[kind]} ${res.code} เรียบร้อย`);
      reset();
      onOpenChange(false);
      onSaved(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      savingRef.current = false; setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="new-work-dialog">
         <DialogHeader>
           <DialogTitle>รับงานใหม่</DialogTitle>
           <DialogDescription>เลือกวิธีรับงานและชนิดเอกสาร แล้วบันทึกเข้าลิสต์งานและเอกสารเดียวกัน</DialogDescription>
         </DialogHeader>

         <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="ชนิดงาน">
           {(["order", "requisition"] as NewWorkKind[]).map((k) => (
             <button key={k} type="button" role="radio" aria-checked={kind === k}
               onClick={() => setKind(k)}
               className={`rounded-xl border px-3 py-2 text-left transition-colors ${kind === k ? "border-primary bg-accent" : "border-border"}`}>
               <span className="block text-[14px] font-semibold">{NEW_WORK_KIND_LABEL[k]}</span>
               <span className="block text-xs text-muted-foreground">{k === "order" ? "ใบสั่งซื้อจากลูกค้า" : "ใบเขียนเบิกจากงานเดิม"}</span>
             </button>
           ))}
         </div>

        {/* 1. วิธีรับงาน */}
        <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="วิธีรับงาน">
          {INTAKE_METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={method === m.key}
              data-testid={`new-work-method-${m.key}`}
              onClick={() => setMethod(m.key)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                method === m.key ? "border-primary bg-accent" : "border-border"
              }`}
            >
              <span className="block text-[14px] font-semibold">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* 2. ลูกค้า */}
        <div className="rounded-xl border border-border p-3">
          {customer ? (
            <div className="mb-2 flex items-center gap-3 rounded-xl bg-accent/60 p-2">
              <CustomerAvatar name={customer.name} pictureUrl={profiles[customer.lineUserId || ""]?.pictureUrl} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{customer.name}</span>
                <span className="block text-xs text-muted-foreground">{customer.code} · {customer.phone || "ไม่มีเบอร์"}</span>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCustomer(null)}>เปลี่ยน</Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9"
                placeholder="ค้นหาลูกค้า ชื่อ / เบอร์ / รหัส" aria-label="ค้นหาลูกค้า"
              />
            </div>
          )}
          {!customer && (
            <div className="mt-2 max-h-52 overflow-y-auto">
              {customers.map((c) => (
                <button
                  key={c.id} type="button" onClick={() => setCustomer(c)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent/40"
                >
                  <CustomerAvatar name={c.name} pictureUrl={profiles[c.lineUserId || ""]?.pictureUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.code} · {c.phone || "ไม่มีเบอร์"}</span>
                  </span>
                  {c.lineUserId && <span className="shrink-0 text-xs font-semibold text-primary">LINE</span>}
                </button>
              ))}
              {!customers.length && <p className="px-2 py-2 text-sm text-muted-foreground">ไม่พบลูกค้าที่ตรงกับคำค้น</p>}
            </div>
          )}
        </div>


        {/* 3. เนื้อหาตามวิธีที่เลือก */}
        {method === "files" && (
          <CustomerFilesPicker
            customer={customer}
            onAdd={(rows, files) => {
              setItems((prev) => [...prev, ...rows]);
              setSourceFiles((prev) => [...prev, ...files.filter((f) => !prev.some((x) => x.id === f.id))]);
            }}
          />
        )}

        {method === "line" && (
          <div className="rounded-xl border border-border p-3" data-testid="new-work-line">
            <p className="text-sm text-muted-foreground">
              งานที่ลูกค้าส่งเข้ามาล่าสุดและยังไม่ได้ทำเอกสาร — เลือกลูกค้าด้านบนแล้วใช้ “แนบไฟล์ให้ระบบอ่าน” เพื่อดึงรายการ
            </p>
            <div className="mt-2 max-h-40 overflow-y-auto">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
                  <span className="min-w-0 truncate">{j.customerName} · {j.filename}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{j.phone}</span>
                </div>
              ))}
              {!jobs.length && <p className="py-2 text-sm text-muted-foreground">ยังไม่มีงานค้างจาก LINE</p>}
            </div>
          </div>
        )}

        {/* 4. รายการ */}
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[14px] font-semibold">รายการ ({items.length})</span>
            <span className="text-xs text-muted-foreground">รวม {total.toLocaleString("th-TH")} บาท</span>
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto p-2">
            {!items.length && <p className="p-2 text-sm text-muted-foreground">ยังไม่มีรายการ — กด “เพิ่มรายการ” หรืออ่านรายการจากไฟล์</p>}
            {items.map((it, idx) => (
              <div key={it.id} className="grid grid-cols-[1fr_70px_90px_90px_36px] items-center gap-2">
                <Input
                  value={it.name} placeholder="ชื่อสินค้า" aria-label={`ชื่อรายการที่ ${idx + 1}`}
                  onChange={(e) => patch(it.id, { name: e.target.value })} className="h-9"
                />
                <Input
                  type="number" min={1} value={it.qty} aria-label={`จำนวนรายการที่ ${idx + 1}`}
                  onChange={(e) => patch(it.id, { qty: Number(e.target.value) || 0 })} className="h-9"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={it.unit} aria-label={`หน่วยรายการที่ ${idx + 1}`}
                  onChange={(e) => patch(it.id, { unit: e.target.value })}
                >
                  {[...new Set([it.unit, ...units])].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <Input
                  type="number" min={0} value={it.price} aria-label={`ราคารายการที่ ${idx + 1}`}
                  onChange={(e) => patch(it.id, { price: Number(e.target.value) || 0 })} className="h-9"
                />
                <button type="button" aria-label={`ลบรายการที่ ${idx + 1}`} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 py-2">
            <Button
              type="button" variant="ghost" size="sm" data-testid="new-work-add-item"
              onClick={() => setItems((p) => [...p, { id: newItemId(), code: "", name: "", unit: units[0] ?? "ชิ้น", price: 0, qty: 1, source: "manual" }])}
            >
              <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ
            </Button>
          </div>
        </div>

        {/* 5. รายละเอียดและชนิดเอกสาร */}
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">วันที่ต้องการรับ</span>
            <Input type="date" value={wantDate} onChange={(e) => setWantDate(e.target.value)} className="h-9" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">วิธีรับของ</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={receive} onChange={(e) => setReceive(e.target.value)}
            >
              {RECEIVE_METHODS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">หมายเหตุ</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" placeholder="ถ้ามี" />
          </label>
        </div>

         <div className="flex flex-wrap items-center justify-end gap-2">
           <Button type="button" onClick={save} disabled={saving} data-testid="new-work-save">
             {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
             บันทึก{NEW_WORK_KIND_LABEL[kind]}
           </Button>
         </div>
      </DialogContent>
    </Dialog>
  );
}
