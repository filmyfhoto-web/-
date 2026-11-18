import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";

export default function StaffLowStock() {
  const [items, setItems] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from("products")
      .select("id,code,name,unit,stock,low_stock_threshold,status,image_url")
      .in("status", ["low_stock", "out_of_stock"]).order("status").order("stock");
    setItems(data || []);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = liveChannel("staff-low").on("postgres_changes",
      { event: "*", schema: "public", table: "stock_movements" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <StaffLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">สินค้าใกล้หมด / หมดสต็อก</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.length === 0 && <Card className="p-6 col-span-full text-center text-sm text-muted-foreground rounded-2xl">ไม่มีสินค้าที่ใกล้หมด</Card>}
          {items.map((p) => (
            <Card key={p.id} className="p-3 rounded-2xl flex gap-3">
              <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden">{p.image_url && <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.code}</div>
                <div className="mt-1 text-sm">
                  คงเหลือ <span className={`font-bold ${p.stock <= 0 ? "text-rose-600" : "text-amber-600"}`}>{Number(p.stock || 0)}</span>
                  <span className="text-muted-foreground"> / เตือนที่ {p.low_stock_threshold}</span>
                </div>
                <Link to="/staff/stock" className="text-xs text-primary">→ ไปปรับสต็อก</Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </StaffLayout>
  );
}