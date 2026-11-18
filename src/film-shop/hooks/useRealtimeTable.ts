import { useEffect, useRef } from 'react';
import { supabase } from '@/film-shop/lib/supabase';

/**
 * Subscribe to all changes (INSERT/UPDATE/DELETE) on one or more Postgres tables
 * and run `onChange` whenever any event arrives. Channel is unique per mount
 * to avoid duplicate-subscription errors when a component remounts.
 */
export function useRealtimeTable(
  tables: string | string[],
  onChange: () => void,
  enabled: boolean = true,
) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(tables) ? tables : [tables];
    const channelName = `rt-${list.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let channel = supabase.channel(channelName);
    list.forEach((t) => {
      channel = channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: t },
        () => cbRef.current?.(),
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(tables) ? tables.join('|') : tables, enabled]);
}
