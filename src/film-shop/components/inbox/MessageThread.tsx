import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, RotateCcw, AlertTriangle, Paperclip, Check, CheckCheck, X, ImagePlus, FilePlus2, FileText, FileArchive, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/film-shop/lib/supabase';
import { CANNED_REPLIES } from '@/film-shop/lib/cannedReplies';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import {
  CONVERSATION_STATUSES, setConversationAssignee, setConversationStatus, signedAttachmentUrl,
  uploadOutboundAttachment, validateOutboundFile,
  type InboxAttachment, type InboxConversation, type InboxEmployee, type InboxMessage,
} from '@/film-shop/hooks/useFilmInbox';

interface Props {
  conversation: InboxConversation | null;
  messages: InboxMessage[];
  loading: boolean;
  error: string | null;
  lineReady: boolean | null;
  lineReadyLabel?: string;
  employees: InboxEmployee[];
  onSent: () => void;
  onUpdated: () => void;
  /** ข้อความตั้งต้นจากภายนอก (เช่น เปิดแชตจากออเดอร์) — key เปลี่ยนเมื่อกดปุ่มใหม่ */
  draft?: { text: string; key: number } | null;
  /** ปุ่มหลักบนหัวห้องแชต — เปิดฟอร์มรับงานจริง */
  onCreateJob?: () => void;
}

const UNASSIGNED = '__none__';

/** รูปภาพแนบ: โหลด signed URL อายุสั้นเมื่อแสดงผลเท่านั้น */
function AttachmentImage({ att }: { att: InboxAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!att.path) return;
    void signedAttachmentUrl(att.path).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [att.path]);
  if (!url) {
    return <span className="grid h-36 w-48 animate-pulse place-items-center rounded-xl bg-muted/70"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></span>;
  }
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-xl border bg-muted shadow-sm"
    >
      <img src={url} alt={att.name || 'รูปจากลูกค้า'} loading="lazy" className="h-36 w-48 object-cover transition-transform duration-200 group-hover:scale-105" />
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-background/85 to-transparent px-2 py-1 text-[10px] font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <Download className="h-3 w-3" /> เปิดรูปเต็ม
      </span>
    </a>
  );
}

function fileIcon(att: InboxAttachment) {
  const n = (att.name || '').toLowerCase();
  if (n.endsWith('.pdf')) return FileText;
  if (n.endsWith('.zip') || n.endsWith('.rar')) return FileArchive;
  return Paperclip;
}

function AttachmentChip({ att }: { att: InboxAttachment }) {
  const [busy, setBusy] = useState(false);
  const Icon = fileIcon(att);
  const open = async () => {
    if (!att.path) return;
    setBusy(true);
    const url = await signedAttachmentUrl(att.path);
    setBusy(false);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('เปิดไฟล์แนบไม่สำเร็จ');
  };
  return (
    <button
      type="button"
      disabled={!att.path || busy}
      onClick={open}
      className="flex max-w-[240px] items-center gap-2 rounded-xl border bg-card px-2.5 py-2 text-left text-xs shadow-sm transition-colors hover:bg-accent/50 disabled:opacity-60"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{att.name || att.kind || 'ไฟล์แนบ'}</span>
        <span className="block text-[10px] text-muted-foreground">
          {att.error ? <span className="text-destructive">{att.error}</span> : 'แตะเพื่อเปิด/ดาวน์โหลด'}
        </span>
      </span>
    </button>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'วันนี้';
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'เมื่อวาน';
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
}

/** กลาง: เธรดข้อความจริง + composer + ข้อความด่วน */
export function MessageThread({
  conversation, messages, loading, error, lineReady, lineReadyLabel, employees, onSent, onUpdated, draft, onCreateJob,
}: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pending, setPending] = useState<InboxAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages.length, conversation?.id]);
  useEffect(() => { setText(''); setPending([]); }, [conversation?.id]);
  // เติมข้อความตั้งต้นหลังสลับห้องแชต เพื่อไม่ให้ถูกล้างทิ้ง (ครั้งเดียวต่อการกดปุ่ม)
  const appliedDraft = useRef<number | null>(null);
  useEffect(() => {
    if (!draft?.text || !conversation?.id) return;
    if (appliedDraft.current === draft.key) return;
    appliedDraft.current = draft.key;
    setText(draft.text);
  }, [draft?.key, draft?.text, conversation?.id]);

  const pickFiles = async (files: FileList | null) => {
    if (!conversation || !files?.length) return;
    setUploading(true);
    for (const file of Array.from(files).slice(0, 4 - pending.length)) {
      const invalid = validateOutboundFile(file);
      if (invalid) { toast.error(`${file.name}: ${invalid}`); continue; }
      const res = await uploadOutboundAttachment(conversation.id, file);
      if (res.ok === true) {
        setPending((prev) => [...prev, res.attachment]);
      } else {
        toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ: ${(res as { error: string }).error}`);
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const send = async () => {
    const body = text.trim();
    if (!conversation || sending || (!body && pending.length === 0)) return;
    setSending(true);
    const key = `${conversation.id}:${crypto.randomUUID()}`;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('film-inbox-send-message', {
        body: {
          conversation_id: conversation.id,
          text: body,
          attachments: pending,
          idempotency_key: key,
        },
      });
      if (fnErr) { toast.error(fnErr.message); return; }
      if (data?.ok) { setText(''); setPending([]); onSent(); }
      else toast.error(data?.message_th || 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  /** ส่งใหม่ = แถวเดิม + idempotency key เดิม (ไม่สร้างข้อความขาออกซ้ำ) */
  const retry = async (messageId: string) => {
    if (!conversation || retryingId) return;
    setRetryingId(messageId);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('film-inbox-send-message', {
        body: { conversation_id: conversation.id, retry_message_id: messageId },
      });
      if (fnErr) { toast.error(fnErr.message); return; }
      if (data?.ok) onSent();
      else toast.error(data?.message_th || 'ส่งใหม่ไม่สำเร็จ');
    } finally {
      setRetryingId(null);
    }
  };

  const updateStatus = async (status: string) => {
    if (!conversation) return;
    await setConversationStatus(conversation.id, status);
    onUpdated();
  };

  const updateAssignee = async (value: string) => {
    if (!conversation) return;
    await setConversationAssignee(conversation.id, value === UNASSIGNED ? null : value);
    onUpdated();
  };

  if (!conversation) {
    return (
      <div className="grid h-full place-items-center bg-muted/20 p-8 text-center">
        <div className="max-w-xs space-y-2">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
            <Send className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium">เลือกบทสนทนาทางซ้ายเพื่อเริ่มตอบลูกค้า</p>
          <p className="text-xs text-muted-foreground">ข้อความจาก LINE OA จะเข้ามาที่นี่แบบเรียลไทม์</p>
        </div>
      </div>
    );
  }

  let lastDay = '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20" data-testid="inbox-message-thread">
      <div className="flex flex-wrap items-center gap-2.5 border-b bg-card px-4 py-2.5">
        <CustomerAvatar
          name={conversation.display_name}
          pictureUrl={conversation.avatar_url}
          className="h-10 w-10"
          online={!!conversation.external_user_id}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{conversation.display_name || 'ลูกค้า LINE'}</p>
          <p className="truncate text-xs text-muted-foreground">ติดต่อผ่าน: {conversation.channel.toUpperCase() === 'LINE' ? 'LINE OA' : conversation.channel.toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-1.5" data-testid="inbox-thread-controls">
          <Select value={conversation.status || 'open'} onValueChange={updateStatus}>
            <SelectTrigger className="h-7 w-[132px] rounded-full text-xs" aria-label="สถานะบทสนทนา">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONVERSATION_STATUSES.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={conversation.assignee ?? UNASSIGNED} onValueChange={updateAssignee}>
            <SelectTrigger className="h-7 w-[136px] rounded-full text-xs" aria-label="ผู้รับผิดชอบ">
              <SelectValue placeholder="ผู้รับผิดชอบ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED} className="text-xs">ยังไม่มีผู้รับผิดชอบ</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Badge
          variant={lineReady === false ? 'destructive' : 'secondary'}
          className="ml-auto shrink-0 gap-1 text-[11px]"
          data-testid="inbox-line-status"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', lineReady ? 'bg-success' : lineReady === false ? 'bg-destructive-foreground' : 'bg-muted-foreground')} />
          {lineReadyLabel ?? (lineReady === null ? 'กำลังตรวจสอบ LINE' : lineReady ? 'LINE พร้อมใช้งาน' : 'LINE ต้องตั้งค่า')}
        </Badge>
        {onCreateJob && (
          <Button type="button" size="sm" className="h-8 shrink-0 gap-1 rounded-lg text-xs" data-testid="inbox-create-job" onClick={onCreateJob}>
            <FilePlus2 className="h-3.5 w-3.5" /> สร้างใบงาน (NATTA.Q)
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        {loading && <p className="text-sm text-muted-foreground">กำลังโหลดข้อความ…</p>}
        {error && <p className="text-sm text-destructive">โหลดข้อความไม่สำเร็จ: {error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อความในบทสนทนานี้</p>
        )}
        <ul className="space-y-2.5">
          {messages.map((m) => {
            const mine = m.direction === 'outbound';
            const system = m.direction === 'system';
            const stamp = m.sent_at || m.created_at;
            const day = dayLabel(stamp);
            const showDay = day !== lastDay;
            lastDay = day;
            const images = m.attachments.filter((a) => a.kind === 'image' && a.path);
            const files = m.attachments.filter((a) => !(a.kind === 'image' && a.path));
            return (
              <li key={m.id}>
                {showDay && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">{day}</span>
                  </div>
                )}
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[78%] px-3 py-2 text-sm shadow-sm', system
                    ? 'rounded-2xl bg-muted text-muted-foreground'
                    : mine
                      ? 'rounded-2xl rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-2xl rounded-bl-md bg-card')}
                  >
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    {images.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {images.map((a, i) => <AttachmentImage key={i} att={a} />)}
                      </div>
                    )}
                    {files.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {files.map((a, i) => <AttachmentChip key={i} att={a} />)}
                      </div>
                    )}
                    <p className={cn('mt-1 flex items-center gap-1 text-[10px]', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                      {new Date(stamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      {mine && m.delivery_status === 'pending' && <><Check className="h-3 w-3" /> กำลังส่ง</>}
                      {mine && m.delivery_status === 'sent' && <><CheckCheck className="h-3 w-3" /> ส่งแล้ว</>}
                      {mine && m.delivery_status === 'failed' && (
                        <>
                          <AlertTriangle className="h-3 w-3" /> ส่งไม่สำเร็จ
                          <button
                            type="button"
                            className="underline"
                            disabled={retryingId === m.id}
                            data-testid="inbox-retry"
                            onClick={() => retry(m.id)}
                          >
                            <RotateCcw className={cn('mr-0.5 inline h-3 w-3', retryingId === m.id && 'animate-spin')} />ส่งใหม่
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottom} />
      </ScrollArea>

      <div className="space-y-2 border-t bg-card p-3">
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1 pb-0.5 sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden" data-testid="inbox-canned-replies">
          {CANNED_REPLIES.map((r) => (
            <Button
              key={r.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded-full px-2.5 text-xs"
              onClick={() => setText((prev) => (prev ? `${prev}\n${r.text}` : r.text))}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx,.ai,.psd,.zip"
            className="hidden"
            onChange={(e) => void pickFiles(e.target.files)}
          />
          <Button
            type="button" variant="ghost" size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            data-testid="inbox-attach"
            aria-label="แนบไฟล์"
            disabled={uploading || pending.length >= 4}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </Button>
          <Textarea
            lang="th"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={lineReady === false ? 'ต้องตั้งค่า LINE OA ก่อนจึงจะส่งได้' : 'พิมพ์ข้อความถึงลูกค้า…'}
            className="min-h-[44px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label="ข้อความถึงลูกค้า"
          />
          <Button
            type="button" onClick={() => void send()}
            disabled={sending || uploading || (!text.trim() && pending.length === 0)}
            className="h-10 shrink-0 gap-1 rounded-xl"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ส่ง
          </Button>
        </div>
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="inbox-pending-attachments">
            {pending.map((a) => (
              <span key={a.path} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]">
                <Paperclip className="h-3 w-3" />
                {a.name}
                {a.kind !== 'image' && <span className="text-muted-foreground">· ส่งเป็นลิงก์ดาวน์โหลด</span>}
                <button type="button" aria-label={`ลบ ${a.name}`} onClick={() => setPending((p) => p.filter((x) => x.path !== a.path))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="hidden text-[10px] text-muted-foreground sm:block">
          LINE รองรับส่งรูป JPEG/PNG ไม่เกิน 10 MB โดยตรง · ไฟล์ประเภทอื่นจะถูกส่งเป็นลิงก์ดาวน์โหลดที่มีวันหมดอายุ
        </p>
      </div>
    </div>
  );
}
