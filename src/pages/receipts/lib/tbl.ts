import { createContext, createElement, useContext, useLayoutEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TablePrefix = "rds" | "film";

/**
 * Module-scoped active prefix. React renders parents before children synchronously,
 * so setting this eagerly inside `TablePrefixProvider` render guarantees descendants
 * (and their effects/queries) see the correct value. `useLayoutEffect` restores the
 * previous prefix on unmount so nested/sibling shells cannot leak into one another.
 */
let currentPrefix: TablePrefix = "rds";

export const TablePrefixContext = createContext<TablePrefix>("rds");

export function TablePrefixProvider({
  value,
  children,
}: {
  value: TablePrefix;
  children: ReactNode;
}) {
  // Eager set so children's initial render already sees the right prefix.
  currentPrefix = value;
  useLayoutEffect(() => {
    const prev = currentPrefix;
    currentPrefix = value;
    return () => {
      currentPrefix = prev;
    };
  }, [value]);
  return createElement(TablePrefixContext.Provider, { value }, children);
}

export function useTablePrefix(): TablePrefix {
  return useContext(TablePrefixContext);
}

/** Full table name for the currently active store shell. */
export function tbl(name: string): string {
  return `${currentPrefix}_${name}`;
}

/** RPC helper — wraps `supabase.rpc("rds_x" | "film_x", args)`. */
export function rpc(name: string, args?: Record<string, unknown>) {
  return supabase.rpc(`${currentPrefix}_${name}` as any, args as any);
}
