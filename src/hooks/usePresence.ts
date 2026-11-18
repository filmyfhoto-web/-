import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PresenceUser = {
  user_id: string;
  name: string;
  email?: string;
  route?: string;
  online_at: string;
};

/**
 * Presence on a shared room. Defaults to a per-store room when storeSlug is provided.
 * Returns the list of currently online users (deduped by user_id).
 */
export type PresenceStatus = "connecting" | "live" | "offline" | "reconnecting" | "failed";

export function usePresence(roomKey: string = "global") {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<PresenceStatus>("connecting");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) { setUsers([]); setStatus("offline"); return; }
    const channel = supabase.channel(`presence:${roomKey}`, {
      config: { presence: { key: user.id } },
    });

    const flush = () => {
      const state = channel.presenceState() as Record<string, PresenceUser[]>;
      const seen = new Map<string, PresenceUser>();
      Object.values(state).flat().forEach((p: any) => {
        if (p?.user_id) seen.set(p.user_id, p as PresenceUser);
      });
      setUsers(Array.from(seen.values()));
      setLastSyncAt(Date.now());
    };

    channel
      .on("presence", { event: "sync" }, flush)
      .on("presence", { event: "join" }, flush)
      .on("presence", { event: "leave" }, flush)
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live");
          await channel.track({
            user_id: user.id,
            name: profile?.full_name || user.email?.split("@")[0] || "ผู้ใช้",
            email: user.email,
            route: typeof window !== "undefined" ? window.location.pathname : "",
            online_at: new Date().toISOString(),
          });
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setStatus("reconnecting");
        } else if (s === "CLOSED") {
          setStatus("offline");
        }
      });

    const onOnline = () => setStatus("reconnecting");
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.full_name, roomKey]);

  return { users, status, lastSyncAt };
}