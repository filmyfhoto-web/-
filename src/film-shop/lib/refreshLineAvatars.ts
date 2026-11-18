import { supabase } from '@/film-shop/lib/supabase';
import { toast } from 'sonner';

export interface RefreshAvatarsResult {
  ok: boolean;
  checked?: number;
  updated?: number;
  message_th?: string;
}

/**
 * ให้แอดมินกดดึงรูปโปรไฟล์ (pictureUrl) จาก LINE ใหม่
 * - ระบุ conversationId = ดึงเฉพาะลูกค้ารายนั้น (บังคับดึงใหม่)
 * - ไม่ระบุ = ดึงเฉพาะห้องแชตที่ยังไม่มีรูป (ตามร้านที่เลือก)
 */
export async function refreshLineAvatars(opts: {
  conversationId?: string | null;
  storeId?: string | null;
} = {}): Promise<RefreshAvatarsResult> {
  const toastId = toast.loading('กำลังดึงรูปโปรไฟล์จาก LINE...');
  try {
    const { data, error } = await supabase.functions.invoke('film-inbox-refresh-profiles', {
      body: {
        conversation_id: opts.conversationId ?? undefined,
        store_id: opts.storeId ?? undefined,
        force: Boolean(opts.conversationId),
      },
    });
    if (error) throw error;
    const res = (data ?? {}) as RefreshAvatarsResult;
    if (res.ok) toast.success(res.message_th ?? 'อัปเดตรูปโปรไฟล์แล้ว', { id: toastId });
    else toast.error(res.message_th ?? 'ดึงรูปโปรไฟล์ไม่สำเร็จ', { id: toastId });
    return res;
  } catch (e) {
    toast.error(`ดึงรูปโปรไฟล์ไม่สำเร็จ: ${(e as Error)?.message ?? 'unknown'}`, { id: toastId });
    return { ok: false };
  }
}
