import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * POS bill attachments — เอกสารประกอบที่แนบก่อนปิดบิล.
 * Files land in the private `pos-attachments` bucket immediately (so nothing
 * is lost if the tab closes) and the rows are stamped with the receipt once
 * the sale goes through, which is what staff/admin browse later.
 */

export const POS_ATTACH_BUCKET = "pos-attachments";
export const POS_ATTACH_MAX_BYTES = 20 * 1024 * 1024;

export type PosAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
};

const safeName = (name: string) => name.replace(/[^\w.\-ก-๙ ]+/g, "_").slice(-80);

export function usePosAttachments(idemKey: () => string) {
  const [files, setFiles] = useState<PosAttachment[]>([]);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(async (picked: File[]): Promise<string | null> => {
    if (picked.length === 0) return null;
    setBusy(true);
    try {
      const key = idemKey();
      for (const file of picked) {
        if (file.size > POS_ATTACH_MAX_BYTES) return `ไฟล์ ${file.name} ใหญ่เกิน 20MB`;
        const path = `${key}/${Date.now()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from(POS_ATTACH_BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) return upErr.message;
        const { data, error } = await supabase
          .from("pos_receipt_attachments" as never)
          .insert({
            idem_key: key,
            file_name: file.name,
            storage_path: path,
            mime_type: file.type || null,
            size_bytes: file.size,
          } as never)
          .select("id,file_name,storage_path,mime_type,size_bytes")
          .single();
        if (error) return error.message;
        const row = data as unknown as PosAttachment;
        setFiles((prev) => [...prev, { ...row, size_bytes: Number(row.size_bytes ?? file.size) }]);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, [idemKey]);

  const remove = useCallback(async (row: PosAttachment) => {
    setFiles((prev) => prev.filter((f) => f.id !== row.id));
    await supabase.storage.from(POS_ATTACH_BUCKET).remove([row.storage_path]);
    await supabase.from("pos_receipt_attachments" as never).delete().eq("id", row.id);
  }, []);

  /** Stamp the uploaded files with the receipt they belong to. */
  const commit = useCallback(async (receiptId: string, receiptNumber: string | null) => {
    const key = idemKey();
    if (files.length === 0) return;
    await supabase
      .from("pos_receipt_attachments" as never)
      .update({ receipt_id: receiptId, receipt_number: receiptNumber } as never)
      .eq("idem_key", key);
  }, [files.length, idemKey]);

  const reset = useCallback(() => setFiles([]), []);

  return { files, busy, upload, remove, commit, reset };
}

/** Short-lived link so staff can open an attachment from the admin side. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(POS_ATTACH_BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;