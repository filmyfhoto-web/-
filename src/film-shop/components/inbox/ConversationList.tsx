import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { Search, MessageCircle, MapPin, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useLineProfiles } from '@/film-shop/hooks/useLineProfiles';
import { refreshLineAvatars } from '@/film-shop/lib/refreshLineAvatars';
import {
  CONVERSATION_STATUS_LABEL, INBOX_FILTERS,
  type InboxConversation, type InboxEmployee, type InboxFilter,
} from '@/film-shop/hooks/useFilmInbox';

function timeLabel(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
}

const STATUS_LABEL = CONVERSATION_STATUS_LABEL;

interface Props {
  conversations: InboxConversation[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: InboxFilter;
  onFilter: (f: InboxFilter) => void;
  search: string;
  onSearch: (s: string) => void;
  counts?: Partial<Record<InboxFilter, number>>;
  employees?: InboxEmployee[];
  stores?: { id: string; label: string }[];
  storeId?: string;
  onStore?: (id: string) => void;
  unreadTotal?: number;
  /** เรียกใหม่หลังดึงรูปโปรไฟล์ LINE สำเร็จ */
  onRefreshed?: () => void;
  /** มือถือ: ซ่อนหัวข้อ "บทสนทนา" เพราะมีหัวหน้าจอ "กล่องข้อความ" อยู่แล้ว */
  compact?: boolean;
}

export function ConversationList({
  conversations, loading, error, selectedId, onSelect, filter, onFilter, search, onSearch, counts, employees,
  stores, storeId, onStore, unreadTotal, onRefreshed, compact,
}: Props) {
  const nameOf = (id: string | null) => employees?.find((e) => e.id === id)?.name ?? null;
  // รูป/ชื่อ LINE สำรอง: ถ้าห้องแชตยังไม่มี avatar_url ให้ดึงจากโปรไฟล์ LINE ที่เก็บไว้
  const lineProfiles = useLineProfiles(conversations.map((c) => c.external_user_id));
  const [syncing, setSyncing] = useState(false);
  const syncAvatars = async () => {
    setSyncing(true);
    const res = await refreshLineAvatars({ storeId: storeId ?? null });
    setSyncing(false);
    if (res.ok) onRefreshed?.();
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-testid="inbox-conversation-list">
      <div className={cn('border-b px-3 py-3', compact ? 'space-y-2' : 'space-y-2.5')}>
        {stores && stores.length > 0 && onStore && (
          <Select value={storeId ?? 'all'} onValueChange={onStore}>
            <SelectTrigger className="h-9 gap-1.5 rounded-xl text-sm font-semibold" aria-label="เลือกร้าน" data-testid="inbox-store-switch">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">ทุกร้าน</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id} className="text-sm">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!compact && (
        <div className="flex items-baseline justify-between">
          <p className={cn('flex items-center gap-1.5 text-sm font-semibold tracking-tight', compact && 'text-xs font-medium text-muted-foreground')}>
            {compact ? `บทสนทนา ${conversations.length}` : 'บทสนทนา'}
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
            </span>
          </p>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
            {!compact && `${conversations.length} รายการ`}
            {(unreadTotal ?? 0) > 0 && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{unreadTotal} ยังไม่อ่าน</Badge>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="ดึงรูปโปรไฟล์ลูกค้าจาก LINE ใหม่"
              aria-label="ดึงรูปโปรไฟล์ลูกค้าจาก LINE ใหม่"
              data-testid="inbox-refresh-avatars"
              disabled={syncing}
              onClick={() => void syncAvatars()}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </Button>
          </span>
        </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า หรือเบอร์โทร..."
            className={cn('h-9 rounded-xl bg-muted/50 pl-8 text-sm', compact && 'pr-10')}
            aria-label="ค้นหาบทสนทนา"
          />
          {compact && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              title="ดึงรูปโปรไฟล์ลูกค้าจาก LINE ใหม่"
              aria-label="ดึงรูปโปรไฟล์ลูกค้าจาก LINE ใหม่"
              data-testid="inbox-refresh-avatars"
              disabled={syncing}
              onClick={() => void syncAvatars()}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </Button>
          )}
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {INBOX_FILTERS.map((f) => {
            const n = counts?.[f.id] ?? 0;
            return (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={filter === f.id ? 'default' : 'outline'}
                className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs"
                onClick={() => onFilter(f.id)}
              >
                {f.label}
                {n > 0 && (
                  <span className={cn(
                    'rounded-full px-1 text-[10px] font-semibold tabular-nums',
                    filter === f.id ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                  )}>
                    {n}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading && (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1 space-y-1.5 py-1">
                  <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
                  <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
                </span>
              </div>
            ))}
          </div>
        )}
        {error && <p className="p-4 text-sm text-destructive">โหลดไม่สำเร็จ: {error}</p>}
        {!loading && !error && conversations.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <MessageCircle className="mx-auto mb-2 h-6 w-6 opacity-60" />
            ยังไม่มีบทสนทนาในตัวกรองนี้
          </div>
        )}
        <ul className={cn(compact ? 'divide-y' : 'p-1.5')}>
          {conversations.map((c) => {
            const active = selectedId === c.id;
            const unread = c.unread_count > 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'relative flex w-full items-start gap-3 text-left transition-colors',
                    compact ? 'px-3 py-3' : 'rounded-xl px-2.5 py-2.5',
                    active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-primary" />}
                  <span className="mt-0.5">
                    <CustomerAvatar
                      name={c.display_name || (c.external_user_id ? lineProfiles[c.external_user_id]?.displayName : null)}
                      pictureUrl={c.avatar_url || (c.external_user_id ? lineProfiles[c.external_user_id]?.pictureUrl ?? null : null)}
                      className={cn(compact ? 'h-12 w-12' : 'h-10 w-10')}
                      unread={c.unread_count}
                      online={!!c.external_user_id}
                      ring={active}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('truncate', compact ? 'text-[15px]' : 'text-sm', unread ? 'font-semibold' : 'font-medium')}>
                        {c.display_name || (c.external_user_id ? lineProfiles[c.external_user_id]?.displayName : null) || 'ลูกค้า LINE'}
                      </span>
                      {c.is_test && <Badge variant="secondary" className="h-4 px-1 text-[10px]">TEST</Badge>}
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">{timeLabel(c.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn('truncate', compact ? 'text-[13px]' : 'text-xs', unread ? 'text-foreground' : 'text-muted-foreground')}>
                        {c.last_message_preview || '—'}
                      </span>
                      {unread && (
                        <span className={cn(
                          'ml-auto shrink-0 rounded-full bg-primary font-semibold text-primary-foreground tabular-nums',
                          compact ? 'grid h-5 min-w-5 place-items-center px-1.5 text-[11px]' : 'px-1.5 text-[10px]',
                        )}>
                          {c.unread_count}
                        </span>
                      )}
                    </span>
                    <span className={cn(
                      'mt-1 flex items-center gap-1',
                      compact && !(c.status && c.status !== 'open') && !c.last_order_id && !c.assignee && 'hidden',
                    )}>
                      {!compact && <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase">{c.channel}</Badge>}
                      {c.status && c.status !== 'open' && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">{STATUS_LABEL[c.status] ?? c.status}</Badge>
                      )}
                      {c.last_order_id && <Badge variant="outline" className="h-4 px-1 text-[10px]">มีงาน</Badge>}
                      {c.assignee && (
                        <Badge variant="outline" className="h-4 max-w-[92px] truncate px-1 text-[10px]" data-testid="inbox-assignee-chip">
                          👤 {nameOf(c.assignee) ?? 'มีผู้ดูแล'}
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
