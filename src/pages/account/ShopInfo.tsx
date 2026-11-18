import { useEffect, useState } from "react";
import { MapPin, Phone, Clock, MessageCircle, Copy, Navigation } from "lucide-react";
import { toast } from "sonner";
import AccountPage, { AccountCard, ListSkeleton } from "@/components/account/AccountPage";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

type Shop = { store_name?: string | null; phone?: string | null; address?: string | null; line_url?: string | null; line_add_friend_url?: string | null };

const HOURS = [
  { d: "จันทร์ – ศุกร์", t: "08:30 – 18:00 น." },
  { d: "เสาร์", t: "09:00 – 17:00 น." },
  { d: "อาทิตย์", t: "ปิดทำการ" },
];

export default function ShopInfo() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc("get_public_settings");
        setShop((Array.isArray(data) ? data[0] : data) ?? {});
      } catch {
        setShop({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const address = shop?.address?.trim() || "หน้า รพ.เชียงกลาง อ.เชียงกลาง จ.น่าน";
  const phone = shop?.phone?.trim() || "";
  const lineUrl = shop?.line_add_friend_url || shop?.line_url || "";

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("คัดลอกแล้ว"); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  };

  return (
    <AccountPage title="ที่อยู่ร้าน" description="ข้อมูลติดต่อและเวลาทำการของร้าน" path={ACCOUNT_ROUTES.shop}>
      {loading ? <ListSkeleton rows={2} /> : (
        <>
          <AccountCard>
            <h2 className="text-[17px] font-bold">{shop?.store_name?.trim() || "นัฐภรณ์ เชียงกลาง"}</h2>
            <div className="mt-3 flex items-start gap-3">
              <MapPin className="mt-0.5 w-5 h-5 shrink-0 text-primary" aria-hidden />
              <p className="text-[14px]" data-testid="shop-address">{address}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                target="_blank" rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-[14px] text-primary-foreground"
              >
                <Navigation className="w-4 h-4" aria-hidden /> นำทาง
              </a>
              <button type="button" onClick={() => void copy(address)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[14px]">
                <Copy className="w-4 h-4" aria-hidden /> คัดลอกที่อยู่
              </button>
            </div>
          </AccountCard>

          <AccountCard>
            <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold"><Clock className="w-4 h-4 text-primary" aria-hidden /> เวลาทำการ</h3>
            <ul className="divide-y divide-border/70">
              {HOURS.map((h) => (
                <li key={h.d} className="flex justify-between py-2 text-[14px]">
                  <span className="text-muted-foreground">{h.d}</span><span>{h.t}</span>
                </li>
              ))}
            </ul>
          </AccountCard>

          <AccountCard>
            <h3 className="mb-2 text-[15px] font-bold">ช่องทางติดต่อ</h3>
            <div className="space-y-2">
              {phone && (
                <a href={`tel:${phone}`} className="flex min-h-12 items-center gap-3 rounded-xl bg-accent px-3 text-[14px]">
                  <Phone className="w-4 h-4 text-primary" aria-hidden /> โทร {phone}
                </a>
              )}
              {lineUrl && (
                <a href={lineUrl} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 rounded-xl bg-accent px-3 text-[14px]">
                  <MessageCircle className="w-4 h-4 text-primary" aria-hidden /> แชทผ่าน LINE
                </a>
              )}
            </div>
          </AccountCard>
        </>
      )}
    </AccountPage>
  );
}
