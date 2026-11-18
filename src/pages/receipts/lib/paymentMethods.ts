import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { tbl } from "./tbl";

/**
 * Unified payment-method schema used everywhere in Receipts (POS + DocumentForm).
 *
 * The DB table `rds_payment_methods` only stores `name` (no `code` column).
 * To keep a single shape across the app and avoid the recurring schema drift
 * that has broken POS / DocumentForm several times, all consumers MUST go
 * through `usePaymentMethods` and read `{ code, name }`. `code` is derived
 * from `name` so that legacy callers using `payment_method = code` keep
 * working without a migration.
 */
export type PaymentMethod = { code: string; name: string };

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { code: "cash", name: "เงินสด" },
  { code: "transfer", name: "โอนเงิน" },
  { code: "qr", name: "QR" },
  { code: "card", name: "บัตร" },
  { code: "credit", name: "เครดิต" },
];

export function mapPaymentMethodRows(rows: Array<{ name?: string | null }> | null | undefined): PaymentMethod[] {
  return (rows ?? [])
    .map((r) => (r?.name ?? "").trim())
    .filter((n) => n.length > 0)
    .map((n) => ({ code: n, name: n }));
}

export async function fetchPaymentMethods(storeId: string): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from(tbl("payment_methods") as any)
    .select("name")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  const mapped = mapPaymentMethodRows(data as any[]);
  return mapped.length > 0 ? mapped : DEFAULT_PAYMENT_METHODS;
}

/**
 * React-Query hook that always returns a usable list of payment methods.
 * On error, falls back to `DEFAULT_PAYMENT_METHODS` and shows a single toast
 * so users can still complete the document.
 */
export function usePaymentMethods(storeId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["rds_payment_methods", storeId],
    enabled: !!storeId,
    queryFn: () => fetchPaymentMethods(storeId!),
    retry: 1,
  });

  const warned = useRef(false);
  useEffect(() => {
    if (q.error && !warned.current) {
      warned.current = true;
      toast({
        title: "โหลดวิธีชำระเงินไม่สำเร็จ",
        description: "ใช้รายการมาตรฐานชั่วคราว — สามารถสร้างเอกสารต่อได้",
        variant: "destructive",
      });
    }
  }, [q.error]);

  return {
    ...q,
    methods: (q.data ?? DEFAULT_PAYMENT_METHODS) as PaymentMethod[],
    isFallback: !!q.error || (!q.data && !q.isLoading),
  };
}