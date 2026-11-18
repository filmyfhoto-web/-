import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeWithFallback } from '@/film-shop/hooks/useRealtimeWithFallback';

const db = supabase as any;

export interface InboxConversation {
  id: string;
  channel: string;
  store_id: string;
  external_user_id: string | null;
  external_thread_id: string;
  customer_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  assignee: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_order_id: string | null;
  is_test: boolean;
}

export interface InboxAttachment {
  kind?: string;
  name?: string;
  path?: string;
  mime?: string;
  size?: number;
  error?: string;
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound' | 'system';
  text: string | null;
  attachments: InboxAttachment[];
  delivery_status: 'pending' | 'sent' | 'failed';
  error_code: string | null;
  sender_user_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export type InboxFilter =
  | 'all' | 'unread' | 'quoting' | 'waiting_customer' | 'in_progress' | 'has_job' | 'mine' | 'closed';

export const INBOX_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'unread', label: 'ยังไม่อ่าน' },
  { id: 'quoting', label: 'รอราคา' },
  { id: 'waiting_customer', label: 'รอลูกค้า' },
  { id: 'in_progress', label: 'กำลังดำเนินการ' },
  { id: 'has_job', label: 'มีงาน' },
  { id: 'closed', label: 'ปิดแล้ว' },
];

/** สถานะของ "บทสนทนา" — คนละชุดกับสถานะงาน/ออเดอร์ในคิว NATTA.Q */
export const CONVERSATION_STATUSES: { id: string; label: string }[] = [
  { id: 'open', label: 'เปิดอยู่' },
  { id: 'quoting', label: 'รอราคา' },
  { id: 'waiting_customer', label: 'รอลูกค้า' },
  { id: 'in_progress', label: 'กำลังดำเนินการ' },
  { id: 'closed', label: 'ปิดแล้ว' },
];

export const CONVERSATION_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  CONVERSATION_STATUSES.map((s) => [s.id, s.label]),
);

/** รายการบทสนทนา + realtime (cleanup ทุกครั้งที่ unmount) */
export function useConversations() {
  const [rows, setRows] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db
      .from('film_conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) setError(error.message);
    else { setError(null); setRows((data ?? []) as InboxConversation[]); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('film-inbox-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_conversations' }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { conversations: rows, loading, error, reload: load, setRows };
}

/** ข้อความของบทสนทนาที่เปิดอยู่ + realtime (ยกเลิก subscription เมื่อสลับ thread) */
export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentId = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    const { data, error } = await db
      .from('film_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(300);
    if (currentId.current !== id) return;
    if (error) setError(error.message);
    else {
      setError(null);
      setMessages(((data ?? []) as any[]).map((m) => ({
        ...m,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
      })) as InboxMessage[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    currentId.current = conversationId;
    setMessages([]);
    if (!conversationId) { setLoading(false); return; }
    setLoading(true);
    void load(conversationId);
    const channel = supabase
      .channel(`film-inbox-messages-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'film_messages', filter: `conversation_id=eq.${conversationId}` },
        () => { void load(conversationId); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, load]);

  return { messages, loading, error, reload: () => conversationId && load(conversationId), setMessages };
}

/** กรอง + ค้นหาแบบ client (รายการสูงสุด 200 รายการล่าสุด) */
export function useFilteredConversations(
  conversations: InboxConversation[],
  filter: InboxFilter,
  search: string,
) {
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unread_count <= 0) return false;
      if (filter === 'closed' && c.status !== 'closed') return false;
      if (filter !== 'closed' && c.status === 'closed') return false;
      if (filter === 'quoting' && c.status !== 'quoting') return false;
      if (filter === 'waiting_customer' && c.status !== 'waiting_customer') return false;
      if (filter === 'in_progress' && c.status !== 'in_progress') return false;
      if (filter === 'has_job' && !c.last_order_id) return false;
      if (!q) return true;
      return [c.display_name, c.last_message_preview, c.external_user_id]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [conversations, filter, search]);
}

/**
 * ล้าง unread ได้เฉพาะตอน "แอดมินเปิดอ่านจริง" เท่านั้น
 * (การส่งข้อความออกไม่ล้าง unread — แก้ bug จาก Phase 1)
 */
export async function markConversationRead(id: string) {
  const { data } = await supabase.auth.getUser();
  await db.from('film_conversations').update({
    unread_count: 0,
    last_read_at: new Date().toISOString(),
    last_read_by: data?.user?.id ?? null,
  }).eq('id', id);
}

export async function setConversationStatus(id: string, status: string) {
  await db.from('film_conversations')
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function setConversationAssignee(id: string, assignee: string | null) {
  await db.from('film_conversations')
    .update({ assignee, assignee_updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function linkConversationCustomer(id: string, customerId: string | null) {
  await db.from('film_conversations').update({ customer_id: customerId }).eq('id', id);
}

export interface InboxEmployee { id: string; name: string; position: string | null }

/** พนักงานจากตารางเดิม film_employees — ไม่สร้างระบบพนักงานซ้ำ */
export function useInboxEmployees() {
  const [employees, setEmployees] = useState<InboxEmployee[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await db.from('film_employees')
        .select('id,name,position').eq('is_active', true).order('name');
      if (!cancelled) setEmployees((data ?? []) as InboxEmployee[]);
    })();
    return () => { cancelled = true; };
  }, []);
  return employees;
}

export const OUTBOUND_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * เด้งแจ้งเตือนทันทีเมื่อมีข้อความขาเข้าใหม่ (webhook → realtime)
 * โดยไม่ต้องรีเฟรชหน้า — ข้ามห้องที่กำลังเปิดอ่านอยู่
 *
 * ความเสถียร (ไม่ให้ "หลุด" แจ้งเตือน):
 *  - reconnect อัตโนมัติแบบ exponential backoff เมื่อ websocket ตาย
 *  - catch-up polling ทุก 20 วินาทีเมื่อ realtime ไม่ปกติ + ตอนกลับมาโฟกัสแท็บ
 *    โดยดึงเฉพาะข้อความ inbound ที่ใหม่กว่าเวลาที่เห็นล่าสุด
 *  - กันแจ้งเตือนซ้ำด้วยชุด id ที่เคยแจ้งไปแล้ว
 */
export function useInboxLiveAlerts(
  activeConversationId: string | null,
  onInbound: (message: InboxMessage) => void,
) {
  const handler = useRef(onInbound);
  handler.current = onInbound;
  const activeRef = useRef(activeConversationId);
  activeRef.current = activeConversationId;

  useEffect(() => {
    let disposed = false;
    let healthy = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const seen = new Set<string>();
    let since = new Date(Date.now() - 60_000).toISOString();

    const emit = (row: any) => {
      if (!row || row.direction !== 'inbound') return;
      if (!row.id || seen.has(row.id)) return;
      seen.add(row.id);
      if (seen.size > 500) seen.delete(seen.values().next().value as string);
      if (row.created_at && row.created_at > since) since = row.created_at;
      if (row.conversation_id === activeRef.current) return;
      handler.current({
        ...row,
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
      } as InboxMessage);
    };

    const catchUp = async () => {
      const { data } = await db.from('film_messages')
        .select('*')
        .eq('direction', 'inbound')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50);
      (data ?? []).forEach(emit);
    };

    const teardown = () => {
      if (!channel) return;
      const c = channel;
      channel = null;
      try { supabase.removeChannel(c); } catch { /* noop */ }
    };

    const connect = () => {
      if (disposed) return;
      channel = supabase
        .channel(`film-inbox-live-alerts-${attempt}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'film_messages' },
          (payload) => emit(payload.new),
        )
        .subscribe((status: string) => {
          if (disposed) return;
          const wasHealthy = healthy;
          healthy = status === 'SUBSCRIBED';
          if (healthy) {
            attempt = 0;
            if (!wasHealthy) void catchUp();
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && !retryTimer) {
            attempt += 1;
            const delay = Math.round(Math.min(30000, 1000 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5));
            retryTimer = window.setTimeout(() => {
              retryTimer = undefined;
              teardown();
              connect();
            }, delay);
          }
        });
    };

    connect();

    const wake = () => {
      if (disposed) return;
      void catchUp();
      if (!healthy && !retryTimer) { attempt = 0; teardown(); connect(); }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') wake(); };
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisibility);
    const poll = window.setInterval(() => { if (!healthy) wake(); }, 20000);

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.clearInterval(poll);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisibility);
      teardown();
    };
  }, []);
}

/** จำนวนบทสนทนาที่ยังไม่อ่าน (ใช้ร่วมกันทั้ง sidebar และเมนูมือถือ) */
export function useInboxUnread() {
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    const { count } = await db.from('film_conversations')
      .select('*', { count: 'exact', head: true })
      .gt('unread_count', 0)
      .neq('status', 'closed');
    setUnread(count ?? 0);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useRealtimeWithFallback('film_conversations', load);
  return unread;
}
export const OUTBOUND_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const OUTBOUND_MAX_FILE_BYTES = 25 * 1024 * 1024;

export function validateOutboundFile(file: File): string | null {
  const isImage = OUTBOUND_IMAGE_MIMES.includes(file.type.toLowerCase());
  if (isImage && file.size > OUTBOUND_MAX_IMAGE_BYTES) return 'รูปภาพต้องไม่เกิน 10 MB (ข้อจำกัดของ LINE)';
  if (!isImage && file.size > OUTBOUND_MAX_FILE_BYTES) return 'ไฟล์ต้องไม่เกิน 25 MB';
  if (file.size <= 0) return 'ไฟล์เสียหายหรือว่างเปล่า';
  return null;
}

export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  return (base.replace(/[\u0000-\u001f<>"|?*]/g, '').trim() || 'attachment').slice(0, 120);
}

/** อัปโหลดไฟล์แนบขาออกเข้า private bucket เดิม (ไม่มี public URL, ไม่มี token ฝั่ง client) */
export async function uploadOutboundAttachment(
  conversationId: string,
  file: File,
): Promise<{ ok: true; attachment: InboxAttachment } | { ok: false; error: string }> {
  const invalid = validateOutboundFile(file);
  if (invalid) return { ok: false, error: invalid };
  const name = safeFileName(file.name);
  const path = `outbound/${conversationId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${name}`;
  const { error } = await supabase.storage.from('film-line-attachments')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    attachment: {
      kind: OUTBOUND_IMAGE_MIMES.includes(file.type.toLowerCase()) ? 'image' : 'file',
      name, path, mime: file.type || 'application/octet-stream', size: file.size,
    },
  };
}

/** signed URL อายุสั้นสำหรับไฟล์แนบใน private bucket */
export async function signedAttachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('film-line-attachments').createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}
