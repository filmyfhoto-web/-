import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Star, Trash2, Pencil, Store } from "lucide-react";
import { toast } from "sonner";
import AccountPage, { AccountCard, EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

type Address = {
  id: string; label: string | null; recipient_name: string; phone: string;
  address_line: string; subdistrict: string | null; district: string | null;
  province: string | null; postcode: string | null; is_default: boolean; is_pickup: boolean;
};

const EMPTY = {
  id: "", label: "", recipient_name: "", phone: "", address_line: "",
  district: "", province: "", postcode: "", is_pickup: false,
};

export default function Addresses() {
  const userId = useAuthUserId();
  const [rows, setRows] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const { busy, run } = useSubmitGuard();

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: e } = await (supabase as any)
        .from("customer_addresses").select("*").order("is_default", { ascending: false }).order("created_at");
      if (e) throw e;
      setRows((data ?? []) as Address[]);
    } catch {
      setRows([]);
      setError("โหลดที่อยู่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }, []);

  useEffect(() => { void load(); }, [load, userId]);

  const save = () =>
    run(async () => {
      if (!form || !userId) return;
      if (form.recipient_name.trim().length < 2) return toast.error("กรุณากรอกชื่อผู้รับ");
      if (!/^0\d{8,9}$/.test(form.phone.replace(/\D/g, ""))) return toast.error("เบอร์โทรไม่ถูกต้อง");
      if (!form.is_pickup && form.address_line.trim().length < 5) return toast.error("กรุณากรอกที่อยู่ให้ครบถ้วน");
      const payload = {
        user_id: userId,
        label: form.label.trim() || null,
        recipient_name: form.recipient_name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        address_line: form.is_pickup ? "รับที่ร้าน" : form.address_line.trim(),
        district: form.district.trim() || null,
        province: form.province.trim() || null,
        postcode: form.postcode.trim() || null,
        is_pickup: form.is_pickup,
      };
      const q = form.id
        ? (supabase as any).from("customer_addresses").update(payload).eq("id", form.id)
        : (supabase as any).from("customer_addresses").insert(payload);
      const { error: e } = await q;
      if (e) return toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      toast.success("บันทึกที่อยู่แล้ว");
      setForm(null);
      await load();
    });

  const setDefault = async (id: string) => {
    if (!userId) return;
    await (supabase as any).from("customer_addresses").update({ is_default: false }).eq("user_id", userId);
    await (supabase as any).from("customer_addresses").update({ is_default: true }).eq("id", id);
    await load();
  };

  const remove = async (id: string) => {
    const { error: e } = await (supabase as any).from("customer_addresses").delete().eq("id", id);
    if (e) return toast.error("ลบไม่สำเร็จ");
    toast.success("ลบที่อยู่แล้ว");
    await load();
  };

  return (
    <AccountPage
      title="ที่อยู่จัดส่ง"
      description="จัดการที่อยู่จัดส่งเอกสารและงานพิมพ์"
      path={ACCOUNT_ROUTES.addresses}
      action={
        <button
          type="button"
          data-testid="address-add"
          onClick={() => setForm({ ...EMPTY })}
          className="min-h-11 min-w-11 grid place-items-center rounded-xl hover:bg-primary-foreground/15"
          aria-label="เพิ่มที่อยู่"
        >
          <Plus className="w-5 h-5" aria-hidden />
        </button>
      }
    >
      {form && (
        <AccountCard>
          <h2 className="text-[16px] font-bold mb-3">{form.id ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่ใหม่"}</h2>
          <div className="space-y-2">
            <Input className="min-h-11" placeholder="ชื่อเรียก เช่น บ้าน / โรงเรียน" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <Input className="min-h-11" placeholder="ชื่อผู้รับ" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
            <Input className="min-h-11" inputMode="tel" placeholder="เบอร์โทร" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <label className="flex items-center gap-2 min-h-11 text-[14px]">
              <input type="checkbox" checked={form.is_pickup} onChange={(e) => setForm({ ...form, is_pickup: e.target.checked })} />
              <Store className="w-4 h-4 text-primary" aria-hidden /> รับที่ร้าน (ไม่ต้องจัดส่ง)
            </label>
            {!form.is_pickup && (
              <>
                <Textarea placeholder="บ้านเลขที่ ถนน ตำบล" value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Input className="min-h-11" placeholder="อำเภอ" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
                  <Input className="min-h-11" placeholder="จังหวัด" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
                  <Input className="min-h-11" inputMode="numeric" placeholder="ไปรษณีย์" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Button className="min-h-11 rounded-xl" disabled={busy} onClick={() => void save()} data-testid="address-save">บันทึก</Button>
            <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => setForm(null)}>ยกเลิก</Button>
          </div>
        </AccountCard>
      )}

      {rows === null ? <ListSkeleton rows={2} /> : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows.length === 0 && !form ? (
        <EmptyState
          title="ยังไม่มีที่อยู่จัดส่ง"
          hint="เพิ่มที่อยู่เพื่อให้ร้านจัดส่งเอกสารและงานพิมพ์ได้ถูกต้อง"
          cta={<Button className="min-h-11 rounded-xl" onClick={() => setForm({ ...EMPTY })}>เพิ่มที่อยู่</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <article key={a.id} className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10" data-testid={`address-${a.id}`}>
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-accent grid place-items-center">
                  {a.is_pickup ? <Store className="w-5 h-5 text-primary" aria-hidden /> : <MapPin className="w-5 h-5 text-primary" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold truncate">
                    {a.recipient_name} {a.label ? <span className="text-[12px] text-muted-foreground">({a.label})</span> : null}
                    {a.is_default && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">ค่าเริ่มต้น</span>}
                  </div>
                  <div className="text-[13px] text-muted-foreground">{a.phone}</div>
                  <p className="text-[13px]">{[a.address_line, a.district, a.province, a.postcode].filter(Boolean).join(" ")}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {!a.is_default && (
                  <button type="button" onClick={() => void setDefault(a.id)} className="inline-flex items-center gap-1 min-h-11 text-[13px] text-primary">
                    <Star className="w-4 h-4" aria-hidden /> ตั้งเป็นค่าเริ่มต้น
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setForm({
                    id: a.id, label: a.label ?? "", recipient_name: a.recipient_name, phone: a.phone,
                    address_line: a.is_pickup ? "" : a.address_line, district: a.district ?? "",
                    province: a.province ?? "", postcode: a.postcode ?? "", is_pickup: a.is_pickup,
                  })}
                  className="inline-flex items-center gap-1 min-h-11 text-[13px] text-primary"
                >
                  <Pencil className="w-4 h-4" aria-hidden /> แก้ไข
                </button>
                <button type="button" onClick={() => void remove(a.id)} className="inline-flex items-center gap-1 min-h-11 text-[13px] text-destructive">
                  <Trash2 className="w-4 h-4" aria-hidden /> ลบ
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AccountPage>
  );
}
