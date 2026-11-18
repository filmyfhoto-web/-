import { useEffect, useState } from "react";
import { getRealtimeState, subscribeRealtimeState, REALTIME_LABEL_TH, type RealtimeState } from "@/lib/realtimeStatus";
import { cn } from "@/lib/utils";

const DOT: Record<RealtimeState, string> = {
  connecting: "bg-muted-foreground",
  online: "bg-emerald-500",
  syncing: "bg-amber-500",
  offline: "bg-destructive",
};

/** Small, non-intrusive realtime connection indicator. */
export default function ConnectionBadge({ className }: { className?: string }) {
  const [state, setState] = useState<RealtimeState>(getRealtimeState);
  useEffect(() => subscribeRealtimeState(setState), []);

  return (
    <span
      data-testid="realtime-badge"
      data-state={state}
      title={REALTIME_LABEL_TH[state]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2 py-0.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[state])} aria-hidden />
      <span>{REALTIME_LABEL_TH[state]}</span>
    </span>
  );
}
