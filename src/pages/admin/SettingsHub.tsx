import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, Store, ReceiptText, Users,
  Wrench, Save, Loader2,
} from "lucide-react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SystemInfoCard from "@/components/admin/SystemInfoCard";
import ReducedMotionCard from "@/components/settings/ReducedMotionCard";
import DisplayComfortCard from "@/components/settings/DisplayComfortCard";
import StaffInviteLinkCard from "@/components/admin/StaffInviteLinkCard";
import "@/film-shop/film-shop.css";

type Entry = { to: string; label: string; desc?: string; adminOnly?: boolean };
type TabKey = "store" | "users" | "sales" | "tools";

/** Kept for /admin/tools and routing tests — the link catalogue of the settings system. */
export const SETTINGS_TABS: { key: TabKey; label: string; entries: Entry[] }[] = [
  {
    key: "store",
    label: "ร้านและระบบ",
    entries: [
      { to: "/admin/settings/store", label: "ข้อมูลร้านและใบเสร็จ (แบบเต็ม)", desc: "ฟอร์มเดิมทั้งหมด รวม LIFF และเครื่องมือขั้นสูงของร้าน" },
      { to: "/admin/shop-home", label: "จัดการหน้าแอพ", desc: "โครงหน้าหลัก เมนูบริการ โปรโมชั่น และการแสดงผลของหน้าแอปลูกค้า" },
      { to: "/admin/line-groups", label: "ระบบกลุ่มบอท", desc: "กลุ่ม LINE สำหรับแจ้งเตือนออเดอร์และรันงาน" },
    ],
  },
  {
    key: "users",
    label: "ผู้ใช้และสิทธิ์",
    entries: [
      { to: "/admin/staff", label: "จัดการพนักงานและสิทธิ์", desc: "เพิ่มพนักงาน ตั้งบทบาท เปิด/ปิดการใช้งาน ตั้งรหัสผ่านใหม่" },
      { to: "/admin/staff-line", label: "อนุมัติการผูก LINE ของพนักงาน", desc: "รายการพนักงานที่รออนุมัติ" },
      { to: "/admin/link-requests", label: "คำขอเชื่อมบัญชีลูกค้า" },
    ],
  },
  {
    key: "sales",
    label: "สินค้าและการขาย",
    entries: [
      { to: "/admin/products", label: "สต๊อกสินค้า", desc: "สินค้า สต๊อก ราคา จัดซื้อ ผู้จำหน่าย และประวัติ" },
      { to: "/admin/price-groups", label: "กลุ่มราคา", desc: "ตั้งกลุ่มราคาสำหรับลูกค้าแต่ละประเภท" },
      { to: "/admin/pos-store", label: "ข้อมูลร้านบนหน้า POS", desc: "โลโก้ ชื่อร้าน ที่อยู่ เบอร์โทร อีเมล ที่แสดงบน /pos/register และใบเสร็จ" },
      { to: "/pos/settings", label: "ตั้งค่า POS", desc: "การขายหน้าร้านและการพิมพ์ใบเสร็จ" },
    ],
  },
  {
    key: "tools",
    label: "เครื่องมือระบบ",
    entries: [
      { to: "/admin/security", label: "ความปลอดภัย", adminOnly: true },
      { to: "/admin/security-audit", label: "บันทึกการตรวจสอบ (Audit log)", adminOnly: true },
      { to: "/admin/env-secrets", label: "ตรวจสอบ Secret และ Environment", desc: "ตรวจค่าที่ขาด ผิดรูปแบบ หรือชื่อผิดปกติ โดยไม่แสดงค่าจริง", adminOnly: true },
      { to: "/admin/liff-check", label: "ตรวจสอบ LIFF", adminOnly: true },
      { to: "/admin/imports", label: "ประวัตินำเข้าข้อมูล", adminOnly: true },
      { to: "/film-shop/app/settings", label: "ซิงก์ Google Drive / Sheets", adminOnly: true },
      { to: "/dev/print-harness", label: "ตรวจสอบระบบพิมพ์", adminOnly: true },
      { to: "/domain-status", label: "สถานะโดเมนและ DNS", adminOnly: true },
      { to: "/diagnostics", label: "ตรวจสุขภาพระบบและแคช", adminOnly: true },
    ],
  },
];

export function searchSettings(query: string, isAdmin: boolean) {
  const q = query.trim().toLowerCase();
  return SETTINGS_TABS.map((t) => ({
    ...t,
    entries: t.entries
      .filter((e) => (e.adminOnly ? isAdmin : true))
      .filter((e) => !q || `${e.label} ${e.desc ?? ""}`.toLowerCase().includes(q)),
  }));
}

type SectionKey = TabKey;

const SECTIONS: { key: SectionKey; label: string; desc: string; icon: typeof Store }[] = [
  { key: "store", label: "ร้านและระบบ", desc: "ข้อมูลร้าน เลขที่เอกสาร ใบเสร็จ และการเชื่อมต่อระบบ", icon: Store },
  { key: "users", label: "ผู้ใช้และสิทธิ์", desc: "พนักงาน บทบาท คำขอเชื่อมบัญชี", icon: Users },
  { key: "sales", label: "สินค้าและการขาย", desc: "สต๊อก ราคา และการขายหน้าร้าน", icon: ReceiptText },
  { key: "tools", label: "เครื่องมือระบบ", desc: "ความปลอดภัย การแสดงผล แคช และข้อมูลระบบ", icon: Wrench },
];

type SettingsRow = {
  store_name: string; logo_url: string; address: string; phone: string; email: string;
  line_url: string; line_add_friend_url: string; tax_id: string; webhook_url: string;
  quote_prefix: string; order_prefix: string; delivery_prefix: string; po_prefix: string;
  drive_root_folder_id: string; receipt_header: string; receipt_footer: string;
  receipt_reply_template: string; receipt_line_template: string;
  notify_signup_inapp: boolean; notify_signup_line: boolean; line_binding_policy: string;
};

const EMPTY: SettingsRow = {
  store_name: "", logo_url: "", address: "", phone: "", email: "",
  line_url: "", line_add_friend_url: "", tax_id: "", webhook_url: "",
  quote_prefix: "", order_prefix: "", delivery_prefix: "", po_prefix: "",
  drive_root_folder_id: "", receipt_header: "", receipt_footer: "",
  receipt_reply_template: "", receipt_line_template: "",
  notify_signup_inapp: true, notify_signup_line: true, line_binding_policy: "optional",
};

/** Settings system v2 — sidebar navigation + inline editing, FILM SHOP plum theme. */
export default function SettingsHub() {
  const { isStaff } = useAuth();
  const [q, setQ] = useState("");
  const [section, setSection] = useState<SectionKey>("store");
  const [form, setForm] = useState<SettingsRow>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const tabs = useMemo(() => searchSettings(q, isStaff), [q, isStaff]);
  const linksOf = (key: TabKey) => tabs.find((t) => t.key === key)?.entries ?? [];

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
      if (!alive) return;
      if (error) toast.error("โหลดการตั้งค่าไม่สำเร็จ");
      if (data) {
        const next = { ...EMPTY };
        (Object.keys(EMPTY) as (keyof SettingsRow)[]).forEach((k) => {
          const v = (data as Record<string, unknown>)[k];
          if (typeof EMPTY[k] === "boolean") (next as Record<string, unknown>)[k] = v !== false;
          else (next as Record<string, unknown>)[k] = (v as string) ?? "";
        });
        setForm(next);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof SettingsRow>(k: K, v: SettingsRow[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) toast.error("บันทึกไม่สำเร็จ: " + error.message);
    else toast.success("บันทึกการตั้งค่าแล้ว");
  };

  const current = SECTIONS.find((s) => s.key === section)!;
  const editable = section === "store";

  return (
    <AdminLayout>
      <SeoHead title="ตั้งค่าระบบ" description="ศูนย์รวมการตั้งค่าทั้งหมดของระบบ" path="/admin/settings" />
      <div className="film-shop-scope bg-background text-foreground -m-4 p-4 md:-m-6 md:p-6 min-h-[calc(100vh-4rem)]">
        <header className="rounded-2xl bg-gradient-to-r from-primary to-[hsl(var(--plum-mid))] px-5 py-5 text-primary-foreground shadow-sm">
          <h1 className="text-xl md:text-2xl font-bold">ตั้งค่าระบบ</h1>
          <p className="text-sm opacity-90 mt-0.5">แก้ไขค่าหลักได้ในหน้านี้เลย — เลือกหมวดจากเมนูด้านซ้าย</p>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr] items-start">
          {/* Sidebar */}
          <nav className="min-w-0 rounded-2xl border bg-card p-2 lg:sticky lg:top-4">
            <div className="relative p-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาการตั้งค่า"
                className="pl-9 rounded-xl h-10"
                data-testid="settings-search"
              />
            </div>
            <ul className="mt-1 flex lg:block gap-1 overflow-x-auto lg:overflow-visible max-w-full">
              {SECTIONS.map((s) => {
                const active = s.key === section;
                return (
                  <li key={s.key} className="shrink-0 lg:w-full">
                    <button
                      type="button"
                      onClick={() => setSection(s.key)}
                      data-testid={`settings-section-${s.key}`}
                      className={`w-full text-left flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        active ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-accent"
                      }`}
                    >
                      <s.icon className="w-4 h-4 shrink-0" />
                      <span className="whitespace-nowrap lg:whitespace-normal">{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content */}
          <div className="space-y-4 min-w-0">
            <div className="rounded-2xl border bg-card p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold">{current.label}</h2>
                  <p className="text-xs text-muted-foreground">{current.desc}</p>
                </div>
                {editable && (
                  <Button onClick={save} disabled={saving || loading} className="rounded-xl" data-testid="settings-save">
                    {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                    บันทึก
                  </Button>
                )}
              </div>

              <div className="mt-4">
                {loading && editable ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">กำลังโหลด…</div>
                ) : section === "store" ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="ชื่อร้าน" value={form.store_name} onChange={(v) => set("store_name", v)} />
                      <Field label="เลขประจำตัวผู้เสียภาษี" value={form.tax_id} onChange={(v) => set("tax_id", v)} />
                      <Field label="โลโก้ (URL)" value={form.logo_url} onChange={(v) => set("logo_url", v)} className="md:col-span-2" />
                      <Field label="ที่อยู่" value={form.address} onChange={(v) => set("address", v)} className="md:col-span-2" />
                      <Field label="เบอร์โทร" value={form.phone} onChange={(v) => set("phone", v)} />
                      <Field label="อีเมล" value={form.email} onChange={(v) => set("email", v)} />
                      <Field label="ลิงก์ LINE ร้าน" value={form.line_url} onChange={(v) => set("line_url", v)} />
                      <Field label="ลิงก์เพิ่มเพื่อน LINE" value={form.line_add_friend_url} onChange={(v) => set("line_add_friend_url", v)} />
                    </div>

                    <div>
                      <h3 className="text-sm font-bold mb-2">เลขที่เอกสาร</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="คำนำหน้าใบเสนอราคา" value={form.quote_prefix} onChange={(v) => set("quote_prefix", v)} />
                        <Field label="คำนำหน้าใบสั่งซื้อ" value={form.order_prefix} onChange={(v) => set("order_prefix", v)} />
                        <Field label="คำนำหน้าใบส่งของ/ใบแจ้งหนี้" value={form.delivery_prefix} onChange={(v) => set("delivery_prefix", v)} />
                        <Field label="คำนำหน้าใบขอซื้อ" value={form.po_prefix} onChange={(v) => set("po_prefix", v)} />
                        <Field label="Google Drive Root Folder ID" value={form.drive_root_folder_id} onChange={(v) => set("drive_root_folder_id", v)} className="md:col-span-2" />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold mb-2">ใบเสร็จและข้อความ</h3>
                      <div className="grid gap-3">
                        <Field label="ข้อความหัวใบเสร็จ" value={form.receipt_header} onChange={(v) => set("receipt_header", v)} />
                        <Field label="ข้อความท้ายใบเสร็จ" value={form.receipt_footer} onChange={(v) => set("receipt_footer", v)} />
                        <TextField label="เทมเพลตข้อความตอบกลับ" value={form.receipt_reply_template} onChange={(v) => set("receipt_reply_template", v)} />
                        <TextField label="เทมเพลตข้อความ LINE" value={form.receipt_line_template} onChange={(v) => set("receipt_line_template", v)} />
                        <p className="text-[11px] text-muted-foreground">
                          ตัวแปรที่ใช้ได้: {"{customer_name} {store_name} {order_no} {items} {total} {payment_link}"}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold mb-2">การเชื่อมต่อระบบ</h3>
                      <div className="grid gap-3">
                        <div>
                          <Label>นโยบายการผูกบัญชี LINE ของลูกค้า</Label>
                          <Select value={form.line_binding_policy || "optional"} onValueChange={(v) => set("line_binding_policy", v)}>
                            <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="required">บังคับผูกก่อนใช้งาน</SelectItem>
                              <SelectItem value="optional">ผูกหรือไม่ก็ได้</SelectItem>
                              <SelectItem value="off">ปิดการผูกบัญชี</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Field label="Webhook URL" value={form.webhook_url} onChange={(v) => set("webhook_url", v)} />
                      </div>
                    </div>
                  </div>
                ) : section === "users" ? (
                  <div className="space-y-3">
                    <EntryList entries={linksOf("users")} />
                    <StaffInviteLinkCard />
                  </div>
                ) : section === "sales" ? (
                  <EntryList entries={linksOf("sales")} />
                ) : (
                  <div className="space-y-3">
                    <Link
                      to="/admin/tools"
                      data-testid="settings-advanced-tools-link"
                      className="block rounded-2xl border bg-background px-4 py-4 hover:bg-accent transition-colors"
                    >
                      <div className="font-semibold text-sm">เครื่องมือขั้นสูง (สำหรับผู้ดูแลระบบเท่านั้น)</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        ความปลอดภัย, Webhook, LIFF, นำเข้าข้อมูล, ตรวจระบบพิมพ์ และอื่น ๆ รวมอยู่ในหน้าเดียว
                      </div>
                    </Link>
                    <EntryList entries={linksOf("tools")} />
                    <ReducedMotionCard />
                    <DisplayComfortCard />
                    <SystemInfoCard />
                  </div>
                )}
              </div>
            </div>

            {section === "store" && <SectionLinks title="หน้าที่เกี่ยวข้อง" entries={linksOf("store")} />}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input className="rounded-xl mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Textarea className="rounded-xl mt-1 min-h-[120px]" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-background px-4 py-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SectionLinks({ title, entries }: { title: string; entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <EntryList entries={entries} />
    </div>
  );
}

function EntryList({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border bg-background p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">ไม่พบการตั้งค่าที่ค้นหา</p>
        <Link to="/admin/home" className="text-sm font-medium text-primary">กลับหน้าหลัก</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map((e) => (
        <Link key={e.to} to={e.to} className="rounded-2xl border bg-background px-4 py-3 hover:bg-accent transition-colors">
          <div className="font-semibold text-sm">{e.label}</div>
          {e.desc && <div className="text-xs text-muted-foreground mt-0.5">{e.desc}</div>}
        </Link>
      ))}
    </div>
  );
}
