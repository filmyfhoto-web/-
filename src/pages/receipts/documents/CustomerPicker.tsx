import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ChevronDown } from "lucide-react";
import { tbl } from "../lib/tbl";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  branch_name: string | null;
}

export default function CustomerPicker({
  storeId,
  value,
  onChange,
  onPick,
}: {
  storeId: string | undefined;
  value: string;
  onChange: (v: string) => void;
  onPick: (c: Customer) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["rds_customer_search", storeId, value],
    enabled: !!storeId,
    queryFn: async () => {
      let q = supabase
        .from(tbl("customers") as any)
        .select("id,name,phone,address,tax_id,branch_name")
        .eq("store_id", storeId!)
        .order("name", { ascending: true })
        .limit(50);
      if (value && value.trim().length > 0) {
        q = q.or(`name.ilike.%${value}%,phone.ilike.%${value}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as Customer[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="ค้นหาหรือพิมพ์ชื่อลูกค้า"
            className="pl-8 pr-8"
          />
          <button
            type="button"
            aria-label="แสดงรายชื่อลูกค้า"
            onClick={() => setOpen((o) => !o)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
          >
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1 max-h-72 overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        {(data?.length ?? 0) === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">ไม่พบลูกค้า — พิมพ์ชื่อใหม่เพื่อเพิ่ม</div>
        ) : (
          data!.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
            >
              <div className="font-medium">{c.name}</div>
              {(c.phone || c.tax_id) && (
                <div className="text-xs text-muted-foreground">
                  {[c.phone, c.tax_id ? `เลขผู้เสียภาษี ${c.tax_id}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}