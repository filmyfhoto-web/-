import { usePresence } from "@/hooks/usePresence";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

/**
 * Topbar widget: connection dot + online users.
 */
export function RealtimePresenceBar({ roomKey = "global", className }: { roomKey?: string; className?: string }) {
  const { users, status, lastSyncAt } = usePresence(roomKey);
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);
  const dot =
    status === "live" ? "bg-emerald-500"
    : status === "connecting" ? "bg-amber-500"
    : status === "reconnecting" ? "bg-amber-500"
    : status === "failed" ? "bg-rose-500"
    : "bg-rose-500";
  const label =
    status === "live" ? "เชื่อมต่อแล้ว"
    : status === "connecting" ? "กำลังเชื่อมต่อ"
    : status === "reconnecting" ? "กำลังลองเชื่อมต่อใหม่"
    : status === "failed" ? "เชื่อมต่อไม่สำเร็จ"
    : "ออฟไลน์";
  const syncText = lastSyncAt
    ? `ซิงก์ล่าสุดเมื่อ ${Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000))} วินาทีที่แล้ว`
    : "ยังไม่เคยซิงก์";

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("flex items-center gap-2", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", dot, status === "live" && "animate-pulse")} />
              <span className="hidden sm:inline">{label}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-0.5">
              <p className="font-medium">เรียลไทม์: {label}</p>
              <p className="text-muted-foreground">{syncText}</p>
              {status !== "live" && (
                <p className="text-muted-foreground">ข้อมูลอาจยังไม่อัปเดตล่าสุด — ระบบกำลังลองอัตโนมัติ</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        <div className="flex -space-x-2">
          {users.slice(0, 5).map((u) => (
            <Tooltip key={u.user_id}>
              <TooltipTrigger asChild>
                <div
                  className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold ring-2 ring-card flex items-center justify-center"
                  aria-label={u.name}
                >
                  {initials(u.name)}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <p className="font-medium">{u.name}</p>
                  {u.route && <p className="text-muted-foreground">{u.route}</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
          {users.length > 5 && (
            <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] font-medium ring-2 ring-card flex items-center justify-center">
              +{users.length - 5}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}