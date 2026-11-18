import { supabase } from '@/film-shop/lib/supabase';
import type { OrderAttachment } from '@/film-shop/types/order';

const BUCKET = 'invoice-attachments';

/** Upload one intake attachment and return the stored reference. */
export async function uploadOrderAttachment(file: File): Promise<OrderAttachment | null> {
  const safe = file.name.replace(/[^\w.\-ก-๙]+/g, '_');
  const path = `film-orders/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) {
    console.error('upload order attachment failed', error);
    return null;
  }
  return { name: file.name, url: path, size: file.size };
}

/** Private bucket → short-lived signed URL for viewing. */
export async function signedAttachmentUrl(path: string, expiresIn = 3600): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
