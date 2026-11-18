import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Search, LayoutGrid, List } from "lucide-react";
import { tbl } from "../lib/tbl";

export type ProductPick = { id: string; name: string; price: number; unit: string | null };

function useProductSearch(storeId: string | undefined, q: string, enabledEmpty: boolean) {
  return useQuery({
    queryKey: ["rds_products_search", storeId, q, enabledEmpty],
    enabled: !!storeId && (q.length >= 1 || enabledEmpty),
    queryFn: async () => {
      let query = supabase
        .from(tbl("products") as any)
        .select("id,name,price,unit")
        .eq("store_id", storeId!)
        .eq("is_active", true);
      if (q.length >= 1) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query.order("updated_at", { ascending: false }).limit(12);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export default function ProductInput({
  storeId,
  value,
  onPick,
  onChange,
  onPaste,
  placeholder = "พิมพ์ชื่อสินค้า…",
  className,
  showSearchButton = true,
}: {
  storeId?: string;
  value: string;
  onPick: (p: ProductPick) => void;
  onChange: (v: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  showSearchButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [view, setView] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("rds_pi_view") as "grid" | "list") || "grid";
  });
  const setViewMode = (m: "grid" | "list") => {
    setView(m);
    try { localStorage.setItem("rds_pi_view", m); } catch {}
  };
  const { data, isFetching } = useProductSearch(storeId, value, open && browseAll);
  const showList = open && ((data?.length ?? 0) > 0 || isFetching);
  const items = (data ?? []).slice(0, 6);

  return (
    <Popover open={showList} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setBrowseAll(false);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onPaste={onPaste}
            placeholder={placeholder}
            className={`${className ?? ""} ${showSearchButton ? "pr-8" : ""}`.trim()}
          />
          {showSearchButton && (
            <button
              type="button"
              aria-label="ค้นหาสินค้า"
              onClick={(e) => { e.preventDefault(); setBrowseAll(true); setOpen(true); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent text-muted-foreground"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={view === "grid" ? "w-[22rem] p-2" : "w-80 p-1"}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-border">
          <span className="text-[11px] text-muted-foreground">
            {isFetching ? "กำลังโหลด…" : `${items.length} รายการ`}
          </span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              aria-label="แสดงเป็นตาราง"
              onClick={() => setViewMode("grid")}
              className={`p-1 ${view === "grid" ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="แสดงเป็นรายการ"
              onClick={() => setViewMode("list")}
              className={`p-1 ${view === "list" ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {items.length === 0 && isFetching && (
          <p className="text-xs text-muted-foreground px-2 py-1.5">กำลังโหลด…</p>
        )}
        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="text-left rounded-md border border-border px-2 py-2 text-sm hover:bg-accent flex flex-col gap-0.5"
                onClick={() => {
                  onPick(p as ProductPick);
                  setOpen(false);
                  setBrowseAll(false);
                }}
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  ฿{Number(p.price).toLocaleString()}{p.unit ? ` / ${p.unit}` : ""}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent flex justify-between gap-2"
                onClick={() => {
                  onPick(p as ProductPick);
                  setOpen(false);
                  setBrowseAll(false);
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  ฿{Number(p.price).toLocaleString()}{p.unit ? ` / ${p.unit}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}