import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface CartItem {
  product_id: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  image_url?: string | null;
  /** Snapshot of the price shown at the moment the item was added to the
   * cart. This is what gets persisted with the order so history stays
   * consistent even if the catalog price changes later. */
  price?: number | null;
}

interface CartCtx {
  items: CartItem[];
  add: (it: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  note: string;
  setNote: (s: string) => void;
  count: number;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "cart_v1";
const NOTE_KEY = "cart_note_v1";
const CART_EVENT = "cart:updated";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });
  const [note, setNote] = useState<string>(() => localStorage.getItem(NOTE_KEY) || "");

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
    // Notify other components in this tab so header/cart badges refresh live.
    try { window.dispatchEvent(new Event(CART_EVENT)); } catch {}
  }, [items]);
  useEffect(() => { localStorage.setItem(NOTE_KEY, note); }, [note]);

  // Sync across tabs/windows (storage) and across CartProvider instances in
  // the same tab (custom event). This keeps the cart icon count consistent
  // in every open page as soon as the cart is added/removed anywhere.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reload = () => {
      try {
        const next = JSON.parse(localStorage.getItem(KEY) || "[]");
        setItems((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } catch {}
      const n = localStorage.getItem(NOTE_KEY) || "";
      setNote((prev) => (prev === n ? prev : n));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === NOTE_KEY) reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CART_EVENT, reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CART_EVENT, reload);
    };
  }, []);

  const add: CartCtx["add"] = (it, qty = 1) => {
    setItems(prev => {
      const i = prev.findIndex(x => x.product_id === it.product_id);
      if (i >= 0) {
        const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + qty }; return next;
      }
      return [...prev, { ...it, qty }];
    });
  };
  const setQty: CartCtx["setQty"] = (id, qty) => setItems(prev => prev.map(x => x.product_id === id ? { ...x, qty: Math.max(1, qty) } : x));
  const remove: CartCtx["remove"] = (id) => setItems(prev => prev.filter(x => x.product_id !== id));
  const clear = () => { setItems([]); setNote(""); };

  return <Ctx.Provider value={{ items, add, setQty, remove, clear, note, setNote, count: items.reduce((s, x) => s + x.qty, 0) }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart outside CartProvider");
  return v;
}