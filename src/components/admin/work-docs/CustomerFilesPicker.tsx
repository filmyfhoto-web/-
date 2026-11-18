/**
 * "แนบไฟล์ให้ระบบอ่านเป็นรายการ" — ย้ายมาจากหน้ารับงานเดิม
 * ตัวอ่านไฟล์เป็นของเดิมทั้งหมด (`@/lib/workDesk`) ไม่ได้เขียนใหม่
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, FileType2, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  KIND_LABEL, fmtSize, listCustomerFiles, newItemId, signFileUrl,
  type CustomerFile, type DeskCustomer, type WorkFileKind, type WorkLineItem,
} from "@/lib/workDesk";
import type { SourceFile } from "@/lib/workIntake";

const FileIcon = ({ kind }: { kind: WorkFileKind }) => {
  const cls = "h-4 w-4";
  if (kind === "excel") return <FileSpreadsheet className={cls} />;
  if (kind === "pdf") return <FileText className={cls} />;
  if (kind === "word") return <FileType2 className={cls} />;
  return <ImageIcon className={cls} />;
};

export default function CustomerFilesPicker({
  customer,
  onAdd,
}: {
  customer: DeskCustomer | null;
  onAdd: (items: WorkLineItem[], files: SourceFile[]) => void;
}) {
  const [files, setFiles] = useState<CustomerFile[]>([]);

  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setPicked({}); setPreviews({}); setMsg("");
    if (!customer) { setFiles([]); return; }
    let alive = true;
    setLoading(true);
    listCustomerFiles(customer)
      .then(async (fs) => {
        if (!alive) return;
        setFiles(fs);
        const urls: Record<string, string> = {};
        await Promise.all(fs.filter((f) => f.kind === "image" && f.bucket && f.path).slice(0, 12).map(async (f) => {
          const u = await signFileUrl(f.bucket!, f.path!);
          if (u) urls[f.id] = u;
        }));
        if (alive) setPreviews(urls);
      })
      .catch(() => { if (alive) setFiles([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [customer]);

  const pickedIds = Object.keys(picked);

  function toggle(id: string) {
    setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  }

  function read() {
    const src = files.filter((f) => picked[f.id]);
    if (!src.length) { toast.error("เลือกไฟล์อย่างน้อย 1 ไฟล์ก่อน"); return; }
    const rows = src.flatMap((f) => f.items);
    if (!rows.length) {
      setMsg("อ่านไฟล์ที่เลือกเป็นรายการไม่ได้ กรุณาพิมพ์รายการเอง");
      toast.error("อ่านไฟล์ที่เลือกเป็นรายการไม่ได้");
      return;
    }
    onAdd(
      rows.map((r) => ({ ...r, id: newItemId() })),
      src.map((f) => ({ id: f.id, name: f.name, kind: f.kind, bucket: f.bucket, path: f.path })),
    );
    const unclear = rows.filter((r) => r.needsReview).length;
    setMsg(`ตรวจพบ ${rows.length} รายการจากไฟล์${unclear ? ` • ${unclear} รายการอ่านได้ไม่ชัด โปรดตรวจสอบ` : ""}`);
    toast.success(`ตรวจพบ ${rows.length} รายการจากไฟล์`);
  }

  return (
    <div data-testid="work-files-picker" className="rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-[14px] font-semibold">ไฟล์ที่ลูกค้าส่งมา</span>
        <Button type="button" size="sm" disabled={!pickedIds.length} onClick={read} data-testid="work-files-read">
          อ่านไฟล์เป็นรายการ
        </Button>
      </div>
      {msg && <p className="px-3 pt-2 text-[13px] text-primary">{msg}</p>}
      <div className="max-h-56 overflow-y-auto p-2">
        {!customer && <p className="p-2 text-sm text-muted-foreground">เลือกลูกค้าก่อน เพื่อดูไฟล์ที่ลูกค้าส่งเข้ามา</p>}
        {customer && loading && (
          <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดไฟล์…
          </p>
        )}
        {customer && !loading && !files.length && (
          <p className="p-2 text-sm text-muted-foreground">ลูกค้ารายนี้ยังไม่ได้ส่งไฟล์เข้ามา — เลือก “พิมพ์รายการเอง” แทนได้</p>
        )}
        {files.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
            <input
              type="checkbox" className="h-4 w-4" checked={!!picked[f.id]}
              onChange={() => toggle(f.id)} aria-label={`เลือก ${f.name}`}
            />
            {previews[f.id]
              ? <img src={previews[f.id]} alt="" className="h-9 w-12 rounded object-cover" />
              : <span className="grid h-9 w-12 place-items-center rounded bg-muted"><FileIcon kind={f.kind} /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{f.name}</span>
              <span className="block text-xs text-muted-foreground">
                {KIND_LABEL[f.kind]} · {fmtSize(f.sizeBytes)} · {f.items.length} รายการ
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
