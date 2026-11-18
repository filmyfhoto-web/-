import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MovedToMyShop from "@/pages/MovedToMyShop";
import { LEGACY_CUSTOMER_UI } from "@/lib/legacyUi";
import { useLineCustomer, readLiffPictureHint } from "@/contexts/LineCustomerContext";
import {
  useLineBindingState,
  refreshLineBinding,
  __resetLineBindingStateForTests,
} from "@/hooks/useLineBindingState";

/**
 * Verified-LINE gate.
 *
 * Authorization decision is made ONLY by the server response from
 * `line-link-lookup`, which:
 *   1. derives a trusted LINE userId from the caller's LIFF id_token
 *      (verified against LINE's oauth2 endpoint) or Supabase JWT;
 *   2. returns `bound: boolean`;
 *   3. returns `friend_confirmed` / `friend_status` as an OA-friend signal.
 *
 * Children render when `bound === true`. A positive `not_friend` response
 * still sends the customer to the add-friend step, but transient LINE/OA API
 * failures (`unknown` / `config_missing`) must not brick the product page.
 * Nothing in `sessionStorage` / `localStorage` (line_binding, id_token,
 * friendship hints, etc.) is trusted for the unlock decision — those are
 * only used to attach the caller's proof to the server request.
 *
 * Staff/admin bypass via `useAuth().isStaffAny` is preserved and does not
 * involve LINE state at all.
 */

/** Test-only: reset the shared binding cache between test cases. */
export function __resetVerifiedCacheForTests() { __resetLineBindingStateForTests(); }

export default function RequireLineLink({ children }: { children: ReactNode }) {
  // เฟส 1: หน้าลูกค้าเลิกใช้ — ย้ายไปขายที่ LINE MyShop (คืนค่าก่อนเรียก hook ใด ๆ)
  if (!LEGACY_CUSTOMER_UI) return <MovedToMyShop />;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const location = useLocation();
  const { isStaffAny, loading } = useAuth();
  const { setProfile } = useLineCustomer();
  // Single central source of truth. `auto: false` here — the effect below
  // owns the trigger so staff never pay for a LINE lookup.
  const binding = useLineBindingState({ auto: false });

  useEffect(() => {
    if (loading || isStaffAny) return;
    // Cached-fresh calls resolve instantly and concurrent callers share one
    // request, so route changes never re-trigger the onboarding prompt.
    void refreshLineBinding();
  }, [loading, isStaffAny, location.pathname]);

  // Mirror the server-verified profile into the customer context.
  useEffect(() => {
    if (binding.status === "linked" || binding.status === "needs_friend") {
      if (!binding.lineUserId) return;
      setProfile({
        line_user_id: binding.lineUserId,
        display_name: binding.displayName,
        customer_id: binding.customerId,
        customer_source: null,
        customer_name: binding.customerName,
        phone: binding.phone,
        // Server-verified LINE avatar; the LIFF hint is only a fallback.
        picture_url: binding.pictureUrl || readLiffPictureHint(),
        verified_at: new Date().toISOString(),
      });
    } else if (binding.status === "unlinked") {
      setProfile(null);
    }
  }, [binding.status, binding.lineUserId, binding.displayName, binding.pictureUrl, binding.customerId, binding.customerName, binding.phone, setProfile]);

  // ไม่บังคับเชื่อม LINE อีกต่อไป — ลูกค้าที่ทักมาทาง LINE OA แล้วแอดมิน
  // กดเชื่อมให้ ใช้งาน/สั่งซื้อได้เลย (ทุกออเดอร์ต้องผ่านการเสนอราคาก่อนอยู่แล้ว)
  // คอมโพเนนต์นี้เหลือหน้าที่เดียว: ดึงโปรไฟล์ที่เซิร์ฟเวอร์ยืนยันมาแสดง
  return <>{children}</>;
}

