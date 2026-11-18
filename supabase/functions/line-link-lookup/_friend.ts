// Pure helper: interpret a LINE Messaging API `/v2/bot/profile/{userId}`
// response into the tri-state friendship signal used by the gate.
//
// Contract:
//   - HTTP 200                → { confirmed: true,  status: "confirmed"     }
//   - HTTP 404                → { confirmed: false, status: "not_friend"    }
//   - anything else (401/403/
//       5xx / network error)  → { confirmed: false, status: "unknown"      }
//   - LINE_CHANNEL_ACCESS_TOKEN
//     absent                  → { confirmed: false, status: "config_missing" }
//
// The gate MUST NOT unlock unless `confirmed === true`. Any other status
// keeps the customer in the onboarding flow.
export type FriendStatus =
  | "confirmed"
  | "not_friend"
  | "unknown"
  | "config_missing";

export function interpretProfileStatus(
  status: number | null | undefined,
): { confirmed: boolean; status: FriendStatus } {
  if (status === 200) return { confirmed: true, status: "confirmed" };
  if (status === 404) return { confirmed: false, status: "not_friend" };
  return { confirmed: false, status: "unknown" };
}

export async function checkFriendshipViaMessagingApi(
  channelAccessToken: string | undefined,
  lineUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ confirmed: boolean; status: FriendStatus }> {
  if (!channelAccessToken) return { confirmed: false, status: "config_missing" };
  try {
    const r = await fetchImpl(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
      { headers: { Authorization: `Bearer ${channelAccessToken}` } },
    );
    // Consume the body to avoid leaks — we never expose it to the caller.
    try { await r.text(); } catch { /* ignore */ }
    return interpretProfileStatus(r.status);
  } catch {
    return { confirmed: false, status: "unknown" };
  }
}