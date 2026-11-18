import { RefreshCw, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useRealtimeStatus } from '@/film-shop/lib/realtimeStatus';

function formatTime(ts: number | null) {
  if (!ts) return 'ยังไม่ได้ซิงก์';
  return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const LABEL: Record<string, string> = {
  connected: 'เรียลไทม์',
  connecting: 'กำลังเชื่อมต่อ',
  offline: 'ออฟไลน์',
};

export function RealtimeStatusButton({ compact = false }: { compact?: boolean }) {
  const { state, lastSyncedAt, refreshing, refresh } = useRealtimeStatus();

  const dot = cn(
    'h-2 w-2 rounded-full',
    state === 'connected' && 'bg-emerald-500 animate-pulse',
    state === 'connecting' && 'bg-amber-500 animate-pulse',
    state === 'offline' && 'bg-destructive',
  );

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {!compact && (
          <div
            data-testid="realtime-status"
            data-state={state}
            className="hidden items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground sm:flex"
          >
            <span className={dot} />
            <span className="font-medium text-foreground">{LABEL[state]}</span>
            <span className="tabular-nums">· {formatTime(lastSyncedAt)}</span>
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="รีเฟรชข้อมูลเรียลไทม์"
              data-testid="realtime-refresh"
              data-state={state}
              onClick={() => void refresh()}
              disabled={refreshing}
              className="relative h-9 w-9"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {compact && <span className={cn(dot, 'absolute right-1 top-1')} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex items-center gap-2 text-xs">
              {state === 'offline' ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              <span>{LABEL[state]} · อัปเดตล่าสุด {formatTime(lastSyncedAt)}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
