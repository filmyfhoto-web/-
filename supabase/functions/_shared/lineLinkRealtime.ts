// Realtime "LINE linked / followed" signal.
//
// Instead of the browser polling `line-link-lookup` every 1.5s while the
// customer scans the add-friend QR on their phone, the server pushes one
// broadcast message the moment it learns the identity is usable:
//   - `line-webhook` receives the `follow` event (add-friend done)
//   - `line-link-bind` finishes binding the identity
//
// The topic is derived from a SHA-256 of the LINE userId (never the raw id),
// so the channel name cannot be used to enumerate/leak real LINE ids.

export async function lineLinkTopic(lineUserId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`line-link:${lineUserId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `line-link-${hex.slice(0, 32)}`;
}

/**
 * Fire-and-forget broadcast. Never throws — a realtime hiccup must not fail
 * the webhook or the bind; the client keeps a slow poll as a safety net.
 */
export async function broadcastLineLinked(
  lineUserId: string | null | undefined,
  event: "linked" | "followed",
): Promise<void> {
  if (!lineUserId) return;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    const topic = await lineLinkTopic(lineUserId);
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{ topic, event, payload: { event, at: new Date().toISOString() } }],
      }),
    });
  } catch (e) {
    console.warn("[lineLinkRealtime] broadcast_failed", String((e as Error)?.message || e));
  }
}
