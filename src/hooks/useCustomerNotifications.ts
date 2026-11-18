import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createThrottledRefresh } from "@/lib/throttleRefresh";

export type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ref_id: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/**
 * Realtime feed of the signed-in customer's own in-app notifications.
 * Rows are produced server-side by database triggers (order created /
 * status changed) and are RLS-scoped to `user_id = auth.uid()`.
 */
export function useCustomerNotifications() {
  const [items, setItems] = useState<CustomerNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setItems([]); return; }
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, ref_id, link, read, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { setItems([]); setError(error.message); return; }
    setItems((data ?? []) as CustomerNotification[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime bursts (several rows inserted at once) must not fan out into a
  // query per event — collapse them into at most one refetch per 1.5s.
  const throttledLoad = useMemo(() => createThrottledRefresh(() => void load(), 1500), [load]);
  useEffect(() => () => throttledLoad.cancel(), [throttledLoad]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`customer-notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { throttledLoad(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, throttledLoad]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, read: true } : n)) : prev));
    const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
    if (error) setError(error.message);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : prev));
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) setError(error.message);
  }, []);

  const unread = (items ?? []).filter((n) => !n.read).length;
  return { items, unread, error, reload: load, markRead, markAllRead };
}
