import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AccountPage, { AccountCard, EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useMyOrders } from "@/hooks/useMyOrders";
import { fmtDateTime } from "@/lib/format";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const BUCKET = "customer-uploads";
const MAX_MB = 25;
const ALLOWED = /\.(pdf|jpe?g|png|ai|psd)$/i;

type FileRow = { id: string; file_name: string; file_path: string; size_bytes: number | null; created_at: string; order_id: string | null };

export default function UploadFiles() {
  const userId = useAuthUserId();
  const { orders } = useMyOrders();
  const [rows, setRows] = useState<FileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string>("none");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: e } = await (supabase as any)
        .from("order_files").select("*").order("created_at", { ascending: false });
      if (e) throw e;
      setRows((data ?? []) as FileRow[]);
    } catch {
      setRows([]);
      setError("โหลดรายการไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }, []);

  useEffect(() => { void load(); }, [load, userId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length || !userId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ALLOWED.test(file.name)) { toast.error(`ไฟล์ ${file.name} ไม่รองรับ (PDF JPG PNG AI PSD)`); continue; }
        if (file.size > MAX_MB * 1024 * 1024) { toast.error(`ไฟล์ ${file.name} ใหญ่เกิน ${MAX_MB} MB`); continue; }
        const safe = file.name.replace(/[^\w.\-ก-๙]+/g, "_");
        const path = `${userId}/${orderId !== "none" ? `order/${orderId}/` : ""}${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (upErr) { toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ`); continue; }
        const { error: rowErr } = await (supabase as any).from("order_files").insert({
          user_id: userId,
          order_id: orderId !== "none" ? orderId : null,
          file_path: path,
          file_name: file.name,
          file_type: file.type || null,
          size_bytes: file.size,
        });
        if (rowErr) toast.error(`บันทึกข้อมูลไฟล์ ${file.name} ไม่สำเร็จ`);
      }
      toast.success("อัปโหลดไฟล์เรียบร้อย");
      await load();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noreferrer");
    else toast.error("เปิดไฟล์ไม่สำเร็จ");
  };

  const remove = async (row: FileRow) => {
    await supabase.storage.from(BUCKET).remove([row.file_path]);
    await (supabase as any).from("order_files").delete().eq("id", row.id);
    toast.success("ลบไฟล์แล้ว");
    await load();
  };

  return (
    <AccountPage title="อัปโหลดไฟล์งาน" description="ส่งไฟล์งานให้ร้านได้โดยตรงจากบัญชีของคุณ" path={ACCOUNT_ROUTES.upload}>
      <AccountCard>
        <label className="block text-[13px] font-medium mb-1">แนบกับงาน (ไม่บังคับ)</label>
        <Select value={orderId} onValueChange={setOrderId}>
          <SelectTrigger className="min-h-11 rounded-xl"><SelectValue placeholder="เลือกงาน" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">ไม่ระบุงาน</SelectItem>
            {(orders ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>#{o.order_no || o.id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.ai,.psd,image/*"
          className="sr-only"
          data-testid="upload-input"
          onChange={(e) => void upload(e.target.files)}
        />
        <Button
          className="mt-3 w-full min-h-12 rounded-xl"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          data-testid="upload-button"
        >
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden /> : <FileUp className="w-4 h-4 mr-2" aria-hidden />}
          {uploading ? "กำลังอัปโหลด…" : "เลือกไฟล์ / ถ่ายรูป"}
        </Button>
        <p className="mt-2 text-[12px] text-muted-foreground">รองรับ PDF JPG PNG AI PSD ขนาดไม่เกิน {MAX_MB} MB ต่อไฟล์</p>
      </AccountCard>

      {rows === null ? <ListSkeleton rows={2} /> : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีไฟล์ที่อัปโหลด" hint="ไฟล์ที่อัปโหลดจะเห็นได้เฉพาะคุณและทางร้านเท่านั้น" />
      ) : (
        <div className="space-y-2">
          {rows.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-primary/10" data-testid={`file-${f.id}`}>
              <button type="button" onClick={() => void open(f.file_path)} className="min-w-0 flex-1 text-left min-h-11">
                <span className="block text-[14px] truncate">{f.file_name}</span>
                <span className="block text-[12px] text-muted-foreground">{fmtDateTime(f.created_at)}</span>
              </button>
              <button type="button" aria-label={`ลบไฟล์ ${f.file_name}`} onClick={() => void remove(f)} className="min-h-11 min-w-11 grid place-items-center text-destructive">
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </AccountPage>
  );
}
