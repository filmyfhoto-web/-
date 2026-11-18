import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePosBadges } from "@/hooks/usePosBadges";
import { LayoutDashboard, Truck, Boxes, ShoppingCart, ClipboardList, History, AlertTriangle } from "lucide-react";
import stationeryHero from "@/assets/stationery-hero.jpg.asset.json";

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n || 0);

export default function PosDashboard() {
  const b = usePosBadges();

  const cards = [
    { label: "ยอดขายวันนี้", value: `฿${fmt(b.todaySales)}`, sub: `${b.todayCount} บิล`, icon: ShoppingCart, tint: "text-emerald-600" },
    { label: "รอจัดส่ง", value: fmt(b.delivery), sub: "preparing + shipping", icon: Truck, tint: "text-sky-600", to: "/pos/delivery" },
    { label: "สินค้าใกล้หมด", value: fmt(b.lowStock), sub: "ต่ำกว่าจุดสั่งซื้อ", icon: AlertTriangle, tint: "text-amber-600", to: "/pos/stock" },
    { label: "PO ค้างรับ", value: fmt(b.pendingPo), sub: "รอรับสินค้า", icon: ClipboardList, tint: "text-primary", to: "/pos/purchase-orders" },
  ];

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-4">
      {/* Stationery hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-white shadow-lg">
        <img
          src={stationeryHero.url}
          alt="เครื่องเขียน ร้านนัฐภรณ์"
          width={1600}
          height={600}
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-slate-900/20" />
        <div className="relative p-5 md:p-7 flex items-center gap-3 min-h-[120px] md:min-h-[160px]">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-sky-500/90 grid place-items-center shadow-md">
              <Boxes className="h-7 w-7 md:h-8 md:w-8 text-white" />
            </div>
            <div>
              <div className="text-[11px] md:text-xs uppercase tracking-wide text-sky-200/90 font-semibold">
                POSPOS Shop · ร้านเครื่องเขียน
              </div>
              <h1 className="text-xl md:text-2xl font-extrabold leading-tight">
                แดชบอร์ด POS ขายหน้าร้าน
              </h1>
              <p className="hidden md:block text-xs text-slate-200/80 mt-1">
                สรุปยอด · สต๊อก · จัดส่ง · PO — เชื่อมต่อทุกสาขาแบบเรียลไทม์
              </p>
            </div>
          </div>
          <div className="ml-auto hidden md:block">
            <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-sky-100 font-bold shadow">
              <Link to="/pos"><ShoppingCart className="mr-2 h-5 w-5" />เปิดหน้าขาย</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" /> แดชบอร์ด POS
        </h2>
        <Button asChild size="sm"><Link to="/pos"><ShoppingCart className="mr-1 h-4 w-4" />เปิดหน้าขาย</Link></Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const inner = (
            <Card className="p-4 hover:shadow-md transition cursor-pointer h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <c.icon className={`h-5 w-5 ${c.tint}`} />
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{c.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{c.sub}</div>
            </Card>
          );
          return c.to ? <Link key={c.label} to={c.to}>{inner}</Link> : <div key={c.label}>{inner}</div>;
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /> ทางลัด</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline"><Link to="/pos"><ShoppingCart className="mr-1 h-4 w-4" />เปิดขาย</Link></Button>
            <Button asChild variant="outline"><Link to="/pos/stock"><Boxes className="mr-1 h-4 w-4" />สต๊อกสินค้า</Link></Button>
            <Button asChild variant="outline"><Link to="/pos/purchase-orders"><ClipboardList className="mr-1 h-4 w-4" />PO</Link></Button>
            <Button asChild variant="outline"><Link to="/pos/history"><History className="mr-1 h-4 w-4" />ประวัติ</Link></Button>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-2">สรุปวันนี้</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">จำนวนบิล</span><span className="font-semibold tabular-nums">{fmt(b.todayCount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ยอดขาย</span><span className="font-semibold tabular-nums">฿{fmt(b.todaySales)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">รอชำระ</span><Badge variant="outline">{fmt(b.pendingReceipts)}</Badge></div>
          </div>
        </Card>
      </div>
    </div>
  );
}