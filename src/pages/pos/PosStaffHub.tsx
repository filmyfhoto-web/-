import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Boxes, ScanLine, Plus, Camera, ArrowRight, ShieldQuestion } from "lucide-react";
import QuickAddProductDialog from "./QuickAddProductDialog";
import PhotoBarcodeDialog from "@/components/PhotoBarcodeDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * PosStaffHub — /pos/staff — staff-only quick-action hub combining the
 * store's most-used on-the-floor tools: stock, check-by-scan, add product,
 * and product-photo capture. Every action opens the same shared component
 * used elsewhere so there's zero UI drift.
 */
export default function PosStaffHub() {
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [lastCheck, setLastCheck] = useState<null | {
    barcode: string;
    name?: string;
    stock?: number;
    found: boolean;
  }>(null);

  async function onCheckDecoded(raw: string) {
    const bc = (raw || "").trim();
    if (!bc) return;
    const { data } = await supabase
      .from("products")
      .select("id,name,stock,code")
      .eq("barcode", bc)
      .maybeSingle();
    if (data) {
      setLastCheck({ barcode: bc, name: data.name, stock: Number(data.stock ?? 0), found: true });
      toast.success(`พบสินค้า: ${data.name} · คงเหลือ ${data.stock}`);
    } else {
      setLastCheck({ barcode: bc, found: false });
      toast.error("ไม่พบสินค้าในระบบ");
    }
    setCheckOpen(false);
  }

  function onPhotoDecoded(raw: string) {
    setPhotoOpen(false);
    toast.success(`อ่านรหัสแล้ว: ${raw} — เปิดฟอร์มเพิ่มสินค้า`);
    setAddOpen(true);
  }

  const actions = [
    {
      key: "stock",
      title: "สต๊อกสินค้า",
      desc: "ดูรายการสินค้า ตรวจคงเหลือ แก้ไข",
      icon: Boxes,
      color: "from-sky-600 to-blue-600",
      onClick: () => navigate("/pos/stock"),
      testid: "staff-hub-stock",
    },
    {
      key: "check",
      title: "เช็คสินค้า",
      desc: "สแกนบาร์โค้ด → ดูคงเหลือทันที",
      icon: ScanLine,
      color: "from-emerald-600 to-emerald-500",
      onClick: () => setCheckOpen(true),
      testid: "staff-hub-check",
    },
    {
      key: "add",
      title: "เพิ่มสินค้า",
      desc: "ฟอร์มเดียวกับหน้าอื่น (ไม่หลงจอ)",
      icon: Plus,
      color: "from-primary to-primary",
      onClick: () => setAddOpen(true),
      testid: "staff-hub-add",
    },
    {
      key: "photo",
      title: "ถ่ายรูป/อ่านบาร์โค้ด",
      desc: "อ่านจากรูป (ไม่ใช้เครดิต AI)",
      icon: Camera,
      color: "from-amber-500 to-orange-500",
      onClick: () => setPhotoOpen(true),
      testid: "staff-hub-photo",
    },
    {
      key: "role-request",
      title: "ขอปรับสิทธิ์ / เปลี่ยนบทบาท",
      desc: "ส่งคำขอไปให้เจ้าของกิจการอนุมัติ",
      icon: ShieldQuestion,
      color: "from-primary to-primary",
      onClick: () => navigate("/pos/role-request"),
      testid: "staff-hub-role-request",
    },
  ] as const;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto" data-testid="pos-staff-hub">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold">ทางลัดพนักงาน</h1>
        <p className="text-sm text-muted-foreground mt-1">
          รวมงานประจำวันของหน้าร้าน เข้าถึงได้ด้วยแตะเดียว
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            data-testid={a.testid}
            className="text-left rounded-xl overflow-hidden border shadow-sm hover:shadow-md transition group bg-card"
          >
            <div className={`bg-gradient-to-br ${a.color} text-white p-4`}>
              <a.icon className="h-8 w-8 mb-2" />
              <div className="text-lg font-bold">{a.title}</div>
            </div>
            <div className="p-3 text-xs text-muted-foreground flex items-center justify-between">
              <span>{a.desc}</span>
              <ArrowRight className="h-4 w-4 opacity-60 group-hover:translate-x-0.5 transition" />
            </div>
          </button>
        ))}
      </div>

      {lastCheck && (
        <Card className="mt-6 p-4" data-testid="staff-hub-last-check">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-semibold">ผลการเช็คล่าสุด</div>
            {lastCheck.found ? (
              <Badge className="bg-emerald-100 text-emerald-800">พบสินค้า</Badge>
            ) : (
              <Badge className="bg-rose-100 text-rose-800">ไม่พบ</Badge>
            )}
          </div>
          <div className="text-sm">
            <span className="font-mono">{lastCheck.barcode}</span>
            {lastCheck.found && (
              <>
                {" — "}
                <span className="font-semibold">{lastCheck.name}</span>
                {" · คงเหลือ "}
                <span className="tabular-nums font-bold">{lastCheck.stock}</span>
              </>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCheckOpen(true)}>
              <ScanLine className="h-4 w-4 mr-1" /> เช็คอีก
            </Button>
            {lastCheck.found ? (
              <Button size="sm" variant="outline" asChild>
                <Link to="/pos/stock">ไปที่สต๊อก</Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> เพิ่มสินค้าใหม่
              </Button>
            )}
          </div>
        </Card>
      )}

      <QuickAddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(p) => {
          toast.success(`เพิ่ม "${p.name}" แล้ว`);
          setAddOpen(false);
        }}
      />
      <PhotoBarcodeDialog
        open={checkOpen}
        onOpenChange={setCheckOpen}
        onDecoded={onCheckDecoded}
      />
      <PhotoBarcodeDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        onDecoded={onPhotoDecoded}
      />
    </div>
  );
}