// Server-side friendship check shared by order-creating flows.
//
// `GET /v2/bot/profile/{userId}` with the OA channel access token is the only
// server-trustworthy friendship signal: 200 = friend, 404 = not a friend.
// Anything else (401/403/5xx/network) is "unknown" and must never be treated
// as a positive. The token is read from env by the caller and is never logged.
export type FriendStatus = "confirmed" | "not_friend" | "unknown" | "config_missing";

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
    try { await r.text(); } catch { /* ignore */ }
    return interpretProfileStatus(r.status);
  } catch {
    return { confirmed: false, status: "unknown" };
  }
}

/**
 * นโยบายตอน "สร้างออเดอร์":
 *
 * ตัวตน (LINE Login / linked binding) ยัง fail-closed เสมอ — บังคับก่อนถึงจุดนี้
 * ส่วน "สถานะเพื่อน" เป็นเพียง best-effort UX signal:
 *   - confirmed                      → ผ่าน
 *   - not_friend (ยืนยันได้จริง)      → บล็อก + ให้ไปเพิ่มเพื่อนก่อน
 *   - unknown / config_missing        → ตรวจไม่ได้ ห้ามปลอมเป็นเพื่อน แต่ต้อง
 *                                        ไม่บล็อกลูกค้าที่ยืนยันตัวตน LINE แล้ว
 * สถานะจริงถูกบันทึกลง metadata/log เสมอ (ไม่มีการ set true ปลอม)
 */
export function blocksOrder(status: FriendStatus): boolean {
  return status === "not_friend";
}

export type OrderFriendErrorCode =
  | "LINE_NOT_FRIEND"
  | "LINE_FRIEND_CHECK_UNAVAILABLE"
  | "LINE_CONFIG_MISSING";

export type OrderFriendDecision =
  | { allow: true }
  | { allow: false; code: OrderFriendErrorCode; httpStatus: number; detail: string };

/** แปลงสถานะเพื่อนเป็นการตัดสินใจ + error code ที่ client แยกการ์ดได้ */
export function orderGateDecision(status: FriendStatus): OrderFriendDecision {
  if (status === "confirmed") return { allow: true };
  if (status === "not_friend") {
    return {
      allow: false,
      code: "LINE_NOT_FRIEND",
      httpStatus: 403,
      detail: "กรุณาเพิ่มเพื่อน LINE ของร้านก่อนยืนยันสั่งซื้อ",
    };
  }
  // unknown / config_missing → ตรวจไม่ได้: ปล่อยผ่านแบบ best-effort
  // (ตัวตน LINE ถูก verify แล้วก่อนหน้านี้) และบันทึกสถานะจริงไว้
  return { allow: true };
}
