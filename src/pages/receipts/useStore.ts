import { createContext, createElement, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { RdsStore, StoreSlug } from "./types";
import { tbl, useTablePrefix } from "./lib/tbl";

/**
 * Store slug context — lets non-URL-based layouts (e.g. NattaworksLayout at
 * /nattaworks/*) provide the current store slug to shared child components
 * without changing the URL structure of the existing /receipts/:storeSlug
 * routes.
 */
const StoreSlugContext = createContext<StoreSlug | null>(null);

export function StoreSlugProvider({
  value,
  children,
}: {
  value: StoreSlug;
  children: ReactNode;
}) {
  return createElement(StoreSlugContext.Provider, { value }, children);
}

/** Read the current store slug — context first, then URL param fallback. */
export function useStoreSlug(): StoreSlug | undefined {
  const ctx = useContext(StoreSlugContext);
  const { storeSlug } = useParams<{ storeSlug: StoreSlug }>();
  return (ctx ?? storeSlug) as StoreSlug | undefined;
}

/** Base path for a given store slug. */
export function storeBasePath(slug: string | null | undefined): string {
  return `/receipts/${slug}`;
}

export function useStores() {
  const prefix = useTablePrefix();
  return useQuery({
    queryKey: ["receipts_stores", prefix],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("stores") as any)
        .select("id, slug, name, tax_id, phone, address, logo_url, default_vat_rate, vat_enabled, brand_color, doc_theme, attach_biz_reg_url, attach_id_copy_url, attach_bankbook_url")
        .order("slug");
      if (error) throw error;
      return (data ?? []) as unknown as RdsStore[];
    },
    staleTime: 60_000,
  });
}

export function useCurrentStore() {
  const slug = useStoreSlug();
  const stores = useStores();
  const store = stores.data?.find((s) => s.slug === slug) ?? null;
  return { store, slug, isLoading: stores.isLoading, error: stores.error };
}