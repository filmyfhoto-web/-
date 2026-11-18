import { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save, Store, Trash2, Upload } from "lucide-react";
import ImageCropPanel from "@/components/products/ImageCropPanel";
import { POS_STORES } from "@/pages/pos/posRegisterPrefs";
import {
  emptyProfile, fetchStoreProfile, saveStoreProfile, uploadStoreLogo,
  type PosStoreProfile as Profile,
} from "@/lib/posStoreProfile";

/** Admin editor for the branding shown on /pos/register and printed receipts. */
export default function PosStoreProfilePage() {
  return (
    <AdminLayout>
      <SeoHead
        title="ตั้งค่าข้อมูลร้าน POS"
        description="ตั้งชื่อร้าน โลโก้ ที่อยู่ เบอร์โทร และอีเมล ที่แสดงบนหน้า POS และใบเสร็จ"
        path="/admin/pos-store"
      />
      <div className="space-y-5 max-w-3xl">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="w-6 h-6 text-primary" /> ข้อมูลร้านบนหน้า POS
          </h1>
          <p className="text-sm text-muted-foreground">
            ชื่อร้าน โลโก้ และข้อมูลติดต่อจะแสดงที่มุมขวาบนของหน้า /pos/register และบนใบเสร็จที่พิมพ์/ดาวน์โหลด
          </p>
        </header>

        <Tabs defaultValue={POS_STORES[0].key}>
          <TabsList className="grid grid-cols-2 h-auto">
            {POS_STORES.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className="py-2">{s.label}</TabsTrigger>
            ))}
          </TabsList>
          {POS_STORES.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-4">
              <StoreForm storeKey={s.key} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function StoreForm({ storeKey }: { storeKey: string }) {
  const [p, setP] = useState<Profile>(() => emptyProfile(storeKey));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropBlob, setCropBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchStoreProfile(storeKey).then((row) => {
      if (!alive) return;
      setP(row ?? emptyProfile(storeKey));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [storeKey]);

  function upd<K extends keyof Profile>(k: K, v: Profile[K]) {
    setP((old) => ({ ...old, [k]: v }));
  }

  async function onCropped(blob: Blob) {
    setCropBlob(null);
    setUploading(true);
    try {
      const url = await uploadStoreLogo(storeKey, blob);
      upd("logo_url", url);
      toast.success("อัปโหลดโลโก้แล้ว — กด “บันทึก” เพื่อใช้งาน");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดโลโก้ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await saveStoreProfile({ ...p, store_key: storeKey });
      toast.success("บันทึกข้อมูลร้านแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-4" data-testid="pos-store-form">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {p.logo_url ? (
            <img
              src={p.logo_url}
              alt="โลโก้ร้าน"
              data-testid="pos-store-logo-preview"
              className="h-20 w-20 rounded-xl object-cover ring-2 ring-border bg-white"
            />
          ) : (
            <div
              data-testid="pos-store-logo-fallback"
              className="h-20 w-20 rounded-xl grid place-items-center bg-muted text-2xl"
              aria-label="ยังไม่ได้ตั้งโลโก้"
            >
              🏪
            </div>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="pos-store-logo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCropBlob(f);
              e.currentTarget.value = "";
            }}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              อัปโหลดโลโก้
            </Button>
            {p.logo_url && (
              <Button variant="ghost" className="rounded-xl" onClick={() => upd("logo_url", null)}>
                <Trash2 className="w-4 h-4 mr-1" /> ลบโลโก้
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            ระบบจะครอปเป็นสี่เหลี่ยมจัตุรัสและย่อขนาดให้พอดีมุมขวาบนโดยอัตโนมัติ หากไม่ตั้งรูปจะใช้ไอคอน 🏪 แทน
          </p>
        </div>
      </div>

      {cropBlob && (
        <div className="rounded-xl border p-3">
          <ImageCropPanel blob={cropBlob} onCancel={() => setCropBlob(null)} onCropped={(b) => void onCropped(b)} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>ชื่อร้านที่แสดง</Label>
          <Input
            className="rounded-xl mt-1"
            data-testid="pos-store-name-input"
            value={p.shop_name}
            onChange={(e) => upd("shop_name", e.target.value)}
            placeholder="นัฐภรณ์ เชียงกลาง"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>ที่อยู่</Label>
          <Textarea
            className="rounded-xl mt-1"
            rows={2}
            value={p.address ?? ""}
            onChange={(e) => upd("address", e.target.value)}
            placeholder="เลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด"
          />
        </div>
        <div>
          <Label>เบอร์โทร</Label>
          <Input
            className="rounded-xl mt-1"
            value={p.phone ?? ""}
            onChange={(e) => upd("phone", e.target.value)}
            inputMode="tel"
            placeholder="08x-xxx-xxxx"
          />
        </div>
        <div>
          <Label>อีเมล</Label>
          <Input
            className="rounded-xl mt-1"
            value={p.email ?? ""}
            onChange={(e) => upd("email", e.target.value)}
            inputMode="email"
            placeholder="shop@example.com"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving} className="rounded-xl" data-testid="pos-store-save">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} บันทึก
        </Button>
      </div>
    </div>
  );
}
