import { useEffect, useRef } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Notification types that should surface an instant in-app toast. */
const INSTANT_TYPES = new Set([
  "staff_line_approved",
  "staff_line_revoked",
  "line_login_failure",
  "line_link_failure",
]);

/**
 * Subscribes to `notifications` INSERTs and raises an instant sonner toast
 * (with a deep link back to the related page) for staff approval/revocation
 * events — both for the affected staff member and for the admin team.
 */
export default function NotificationToasts() {
  const navigate = useNavigate();
  const nav = useRef(navigate);
  nav.current = navigate;

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!uid || cancelled) return;

      channel = liveChannel(`notif-toasts-${uid}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          (payload: any) => {
            const n = payload?.new ?? {};
            if (!INSTANT_TYPES.has(String(n.type))) return;
            // RLS already limits what we receive, but be explicit.
            if (n.user_id && n.user_id !== uid && !n.for_staff) return;
            const isLineFailure = n.type === "line_login_failure" || n.type === "line_link_failure";
            const show = isLineFailure
              ? toast.error
              : n.type === "staff_line_revoked"
                ? toast.warning
                : toast.success;
            show(String(n.title || "การแจ้งเตือนใหม่"), {
              description: n.body ? String(n.body) : undefined,
              duration: isLineFailure ? 20000 : 10000,
              action: n.link
                ? { label: "ไปยังหน้าที่เกี่ยวข้อง", onClick: () => nav.current(String(n.link)) }
                : undefined,
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
