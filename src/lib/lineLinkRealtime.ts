import { supabase } from "@/integrations/supabase/client";

/**
 * Client half of the realtime "LINE linked / followed" signal.
 * Mirrors `supabase/functions/_shared/lineLinkRealtime.ts`: the topic is a
 * SHA-256 of the LINE userId so the channel name never carries the raw id.
 *
 * This is only a *trigger* to re-verify — the unlock decision still comes
 * from the server (`line-link-lookup`) via the caller's recheck.
 */
export async function lineLinkTopic(lineUserId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`line-link:${lineUserId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `line-link-${hex.slice(0, 32)}`;
}

export type LineLinkRealtimeHandle = { unsubscribe: () => void };

/**
 * Subscribe to link/follow pushes for one LINE identity.
 * `onSignal` may fire more than once — make it idempotent.
 * Returns a handle whose `unsubscribe()` is safe to call twice.
 */
export function subscribeLineLinked(
  lineUserId: string,
  onSignal: (event: string) => void,
  onStatus?: (connected: boolean) => void,
): LineLinkRealtimeHandle {
  let disposed = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  void (async () => {
    const topic = await lineLinkTopic(lineUserId);
    if (disposed) return;
    channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "linked" }, () => onSignal("linked"))
      .on("broadcast", { event: "followed" }, () => onSignal("followed"))
      .subscribe((status: string) => {
        onStatus?.(status === "SUBSCRIBED");
      });
  })();

  return {
    unsubscribe: () => {
      if (disposed) return;
      disposed = true;
      onStatus?.(false);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
        channel = null;
      }
    },
  };
}
