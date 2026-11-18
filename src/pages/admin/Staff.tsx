import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks, UserMinus, Mail, UserPlus, MessageCircle, Copy, XCircle, RefreshCw, Link2 } from "lucide-react";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import BulkActionBar from "@/components/BulkActionBar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const ROLES = [
  { v: "owner", l: "Super Admin (เจ้าของ)" },
  { v: "admin", l: "Admin" },
  { v: "stock_staff", l: "พนักงานสต็อก" },
  { v: "photo_staff", l: "พนักงานถ่ายรูป" },
  { v: "customer", l: "ลูกค้า (ปลด)" },
];

const EMAIL_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "ส่งสำเร็จ", variant: "default" },
  pending: { label: "กำลังส่ง", variant: "secondary" },
  dlq: { label: "ส่งไม่สำเร็จ", variant: "destructive" },
  failed: { label: "ส่งไม่สำเร็จ", variant: "destructive" },
  bounced: { label: "ตีกลับ", variant: "destructive" },
  complained: { label: "ผู้รับแจ้งสแปม", variant: "destructive" },
  suppressed: { label: "ถูกระงับการส่ง", variant: "outline" },
};

const EMAIL_TEMPLATE_TH: Record<string, string> = {
  invite: "อีเมลเชิญ",
  signup: "ยืนยันการสมัคร",
  recovery: "ตั้งรหัสผ่านใหม่",
  magiclink: "ลิงก์เข้าใช้งาน",
  email_change: "เปลี่ยนอีเมล",
  reauthentication: "ยืนยันตัวตนซ้ำ",
};

/** Turns raw provider errors into a short reason an owner can act on. */
export function explainEmailError(raw?: string | null): string {
  const msg = (raw || "").trim();
  if (!msg) return "ไม่ทราบสาเหตุ";
  if (/no_matching_sender|sender domain/i.test(msg)) return "โดเมนผู้ส่งยังไม่ถูกตั้งค่า/ยืนยัน";
  if (/over_email_send_rate_limit|429/i.test(msg)) return "ส่งถี่เกินโควตาต่อชั่วโมง — รอสักครู่แล้วลองใหม่";
  if (/suppress|bounce/i.test(msg)) return "อีเมลปลายทางตีกลับ/ถูกระงับ";
  if (/invalid|not valid/i.test(msg)) return "อีเมลปลายทางไม่ถูกต้อง";
  if (/timeout|timed out/i.test(msg)) return "ระบบส่งอีเมลไม่ตอบสนอง (หมดเวลา)";
  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}

function EmailStatusCell({ info }: { info?: { status: string; error: string | null; template: string | null; at: string } }) {
  if (!info) return <span className="text-muted-foreground">ยังไม่เคยส่ง</span>;
  const meta = EMAIL_STATUS[info.status] ?? { label: info.status, variant: "outline" as const };
  const failed = meta.variant === "destructive";
  return (
    <div className="space-y-1">
      <Badge variant={meta.variant} className="rounded-md">{meta.label}</Badge>
      <div className="text-[11px] text-muted-foreground">
        {(info.template && (EMAIL_TEMPLATE_TH[info.template] || info.template)) || "อีเมล"} · {new Date(info.at).toLocaleString("th-TH")}
      </div>
      {failed && (
        <div className="text-[11px] text-destructive break-words" title={info.error || ""}>
          เหตุผล: {explainEmailError(info.error)}
        </div>
      )}
    </div>
  );
}

/** Edge Function HTTP errors hide the real reason in the response body — read it so the owner sees it. */
export async function readFnError(error: any): Promise<string> {
  const res = error?.context;
  if (res && typeof res.json === "function") {
    try {
      const body = await res.json();
      if (body?.error) return String(body.error);
    } catch { /* body not JSON */ }
  }
  return String(error?.message || "สร้างบัญชีไม่สำเร็จ");
}

export default function AdminStaff() {
  const { isOwner } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("admin");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLineId, setInviteLineId] = useState("");
  const [inviteChannel, setInviteChannel] = useState<"email" | "line" | "link">("email");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [invitePerms, setInvitePerms] = useState({ pos: true, stock: true, po: false, history: true });
  const [quick, setQuick] = useState({ name: "", email: "", password: "", role: "stock_staff" });
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickDone, setQuickDone] = useState<{ email: string; password: string } | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string>("");
  const [invitations, setInvitations] = useState<any[]>([]);
  const [emailLog, setEmailLog] = useState<Record<string, { status: string; error: string | null; template: string | null; at: string }>>({});
  const [perms, setPerms] = useState<Record<string, { pos: boolean; stock: boolean; po: boolean; history: boolean }>>({});
  const bulk = useBulkSelect(rows.map((r: any) => ({ ...r, id: r.user_id })));

  const load = async () => {
    const { data, error } = await supabase.rpc("admin_list_staff");
    if (error) { toast.error(error.message); return; }
    setRows(data || []);
  };
  const loadInvites = async () => {
    const { data, error } = await supabase.from("admin_invitations" as any)
      .select("*").order("created_at", { ascending: false }).limit(50);
    if (!error) setInvitations(data || []);
  };
  const loadPerms = async () => {
    const { data, error } = await supabase.rpc("owner_list_staff_permissions" as any);
    if (error) return;
    const map: Record<string, any> = {};
    (data as any[] | null)?.forEach((p) => {
      map[p.user_id] = { pos: !!p.can_pos, stock: !!p.can_stock, po: !!p.can_po, history: !!p.can_history };
    });
    setPerms(map);
  };
  const loadEmailLog = async (list: any[]) => {
    const emails = list.map((r) => (r.email || "").toLowerCase()).filter(Boolean);
    if (!emails.length) { setEmailLog({}); return; }
    const { data, error } = await supabase.rpc("admin_email_status" as any, { p_emails: emails });
    if (error) return;
    const map: Record<string, any> = {};
    (data as any[] | null)?.forEach((e) => {
      map[e.recipient_email] = { status: e.status, error: e.error_message, template: e.template_name, at: e.created_at };
    });
    setEmailLog(map);
  };
  useEffect(() => { load(); loadInvites(); loadPerms(); }, []);
  useEffect(() => { void loadEmailLog(rows); }, [rows]);

  /** Defaults must mirror has_staff_perm() in the database. */
  const permsFor = (uid: string, role: string) => {
    if (role === "owner" || role === "admin") return { pos: true, stock: true, po: true, history: true };
    return perms[uid] ?? { pos: true, stock: true, po: false, history: true };
  };

  async function togglePerm(uid: string, role: string, key: "pos" | "stock" | "po" | "history", value: boolean) {
    const next = { ...permsFor(uid, role), [key]: value };
    setPerms((prev) => ({ ...prev, [uid]: next }));
    const { error } = await supabase.rpc("owner_set_staff_permissions" as any, {
      _user_id: uid,
      _can_pos: next.pos,
      _can_stock: next.stock,
      _can_po: next.po,
      _can_history: next.history,
    });
    if (error) { toast.error(error.message); loadPerms(); }
    else toast.success("บันทึกสิทธิ์การใช้งานแล้ว");
  }

  async function setRole(uid: string, role: string) {
    setBusy(uid);
    const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: uid, p_role: role });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success("บันทึกสิทธิ์แล้ว"); load(); }
  }
  async function setCostVisible(uid: string, v: boolean) {
    const { error } = await supabase.rpc("admin_set_cost_visible", { p_user_id: uid, p_visible: v });
    if (error) toast.error(error.message); else { toast.success("อัปเดตแล้ว"); load(); }
  }

  /** เปิด/ปิดการใช้งานบัญชีพนักงาน — บังคับใช้จริงที่ฝั่งเซิร์ฟเวอร์ (RLS) */
  async function setStaffActive(uid: string, active: boolean) {
    setBusy(uid);
    const { error } = await supabase.rpc("admin_set_staff_active" as any, { p_user_id: uid, p_active: active });
    setBusy(null);
    if (error) { toast.error(error.message || "เปลี่ยนสถานะไม่สำเร็จ"); return; }
    toast.success(active ? "เปิดใช้งานบัญชีแล้ว" : "ปิดการใช้งานบัญชีแล้ว — ผู้ใช้จะเข้าหน้าพนักงานไม่ได้");
    load();
  }

  async function bulkDowngrade() {
    const ids = bulk.selectedArray; if (!ids.length) return;
    let ok = 0;
    for (const uid of ids) {
      const { error } = await supabase.rpc("admin_set_user_role", { p_user_id: uid, p_role: "customer" });
      if (!error) ok++;
    }
    toast.success(`ปลดสิทธิ์ ${ok}/${ids.length}`); bulk.exit(); load();
  }

  async function addOrInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { toast.error("กรอกอีเมลให้ถูกต้อง"); return; }
    setInviteBusy(true);
    try {
      // 1) try promote existing user
      const { data, error } = await supabase.rpc("admin_set_role_by_email", { p_email: email, p_role: inviteRole });
      if (error) throw error;
      if ((data as any)?.found) {
        toast.success(`ตั้งสิทธิ์ ${inviteRole} ให้ ${email} แล้ว`);
        setInviteEmail(""); load(); return;
      }
      // 2) not found → confirm invite
      const yes = confirm(`ยังไม่มีบัญชี ${email} ในระบบ\n\nต้องการส่งอีเมลเชิญให้ตั้งรหัสผ่านและเข้าใช้งานเป็น "${inviteRole}" หรือไม่?`);
      if (!yes) return;
      const redirect = `${window.location.origin}/reset-password`;
      const { data: inv, error: invErr } = await supabase.functions.invoke("admin-invite-staff", {
        body: { email, role: inviteRole, redirect_to: redirect },
      });
      if (invErr) throw invErr;
      if ((inv as any)?.error) throw new Error((inv as any).error);
      toast.success(`ส่งอีเมลเชิญไปที่ ${email} แล้ว`);
      setInviteEmail(""); load();
    } catch (e: any) {
      toast.error(e?.message || "เพิ่มแอดมินไม่สำเร็จ");
    } finally {
      setInviteBusy(false);
    }
  }

  async function sendInvite() {
    const target = (inviteChannel === "email" ? inviteEmail : inviteChannel === "line" ? inviteLineId : inviteeName).trim();
    if (inviteChannel === "email" && (!target || !target.includes("@"))) { toast.error("กรอกอีเมลให้ถูกต้อง"); return; }
    if (inviteChannel === "line" && !/^U[0-9a-f]{32}$/i.test(target)) { toast.error("LINE user ID ต้องขึ้นต้นด้วย U และ 33 ตัว"); return; }
    if (inviteChannel === "link" && !inviteeName.trim()) { toast.error("กรอกชื่อพนักงานก่อนสร้างลิงก์"); return; }
    setInviteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-invite-create", {
        body: {
          channel: inviteChannel,
          target,
          role: inviteRole,
          message: inviteMessage || null,
          origin: window.location.origin,
          invitee_name: inviteeName.trim() || null,
          perms: invitePerms,
        },
      });
      if (error) throw new Error(await readFnError(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      const delivered = (data as any)?.delivered;
      toast.success(
        inviteChannel === "link"
          ? "สร้างลิงก์สมัครงานแล้ว — คัดลอกส่งให้พนักงาน"
          : delivered ? "ส่งคำเชิญแล้ว" : "สร้างคำเชิญแล้ว (ส่งข้อความไม่สำเร็จ — คัดลอกลิงก์ให้ผู้รับ)"
      );
      if ((data as any)?.accept_url) {
        setLastInviteUrl((data as any).accept_url);
        try { await navigator.clipboard.writeText((data as any).accept_url); } catch { /* ignore */ }
      }
      setInviteEmail(""); setInviteLineId(""); setInviteMessage(""); setInviteeName("");
      loadInvites();
    } catch (e: any) {
      toast.error(e?.message || "ส่งคำเชิญไม่สำเร็จ");
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("admin_invitations" as any).update({ status: "revoked" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("ยกเลิกคำเชิญแล้ว"); loadInvites(); }
  }

  function genPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const arr = crypto.getRandomValues(new Uint32Array(12));
    setQuick((q) => ({ ...q, password: Array.from(arr, (n) => chars[n % chars.length]).join("") }));
  }

  function prepareReset(r: any) {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const arr = crypto.getRandomValues(new Uint32Array(12));
    setQuickDone(null);
    setQuick({
      name: r.full_name || "",
      email: r.email || "",
      password: Array.from(arr, (n) => chars[n % chars.length]).join(""),
      role: r.role === "customer" ? "stock_staff" : r.role,
    });
    document.getElementById("quick-staff-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    toast.info("เตรียมรหัสผ่านใหม่แล้ว — กด “สร้างบัญชี / ตั้งรหัสผ่านใหม่” เพื่อยืนยัน");
  }

  async function createStaffNow() {
    const email = quick.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { toast.error("รูปแบบอีเมลไม่ถูกต้อง (เช่น somchai@gmail.com)"); return; }
    if (/@(example|test|localhost)\./i.test(email) || /@example\.com$/i.test(email)) {
      toast.error("โดเมนตัวอย่าง (example.com) ใช้ไม่ได้ — ใช้อีเมลจริง เช่น @gmail.com");
      return;
    }
    if (quick.password.length < 8) { toast.error("รหัสผ่านต้องยาวอย่างน้อย 8 ตัว"); return; }
    setQuickBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-staff", {
        body: {
          email,
          password: quick.password,
          role: quick.role,
          full_name: quick.name.trim() || null,
          perms: invitePerms,
        },
      });
      if (error) throw new Error(await readFnError(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("สร้างบัญชีพนักงานเรียบร้อย — ใช้ล็อกอินได้ทันที");
      setQuickDone({ email, password: quick.password });
      setQuick({ name: "", email: "", password: "", role: quick.role });
      load(); loadPerms();
    } catch (e: any) {
      toast.error(String(e?.message || "") || "สร้างบัญชีไม่สำเร็จ");
    } finally {
      setQuickBusy(false);
    }
  }

  async function copyLink(token: string) {
    const url = `${window.location.origin}/accept-admin?token=${token}`;
    try { await navigator.clipboard.writeText(url); toast.success("คัดลอกลิงก์แล้ว"); } catch { toast.error("คัดลอกไม่ได้"); }
  }

  if (!isOwner) return <AdminLayout><Card className="p-6 rounded-2xl">เฉพาะเจ้าของระบบเท่านั้น</Card></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">บัญชีพนักงาน</h1>
            <p className="text-sm text-muted-foreground">กำหนดสิทธิ์และเปิด/ปิดการเห็นราคาทุน</p>
          </div>
          <Button variant={bulk.selectMode ? "default" : "outline"} className="rounded-xl" onClick={() => bulk.selectMode ? bulk.exit() : bulk.setSelectMode(true)}>
            <ListChecks className="w-4 h-4 mr-1" /> {bulk.selectMode ? "ออกจากโหมดเลือก" : "เลือกหลายรายการ"}
          </Button>
        </div>
        <Card id="quick-staff-form" className="p-4 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="w-4 h-4" /> สร้างบัญชี / ตั้งรหัสผ่านใหม่ให้พนักงาน (ไม่ต้องรออีเมล)
          </div>
          <p className="text-xs text-muted-foreground">
            ตั้งอีเมล + รหัสผ่านให้พนักงานเลย ใช้ล็อกอินได้ทันทีที่หน้า /staff — วิธีนี้ไม่ล้มเหลวจากระบบส่งอีเมล
            <br />ถ้าพนักงานเข้าไม่ได้ (“อีเมลหรือรหัสผ่านไม่ถูกต้อง”) ให้ใส่อีเมลเดิมแล้วกดปุ่มนี้ ระบบจะตั้งรหัสผ่านใหม่ให้ทันที
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="ชื่อพนักงาน" value={quick.name} disabled={quickBusy}
              onChange={(e) => setQuick((q) => ({ ...q, name: e.target.value }))} className="rounded-xl" aria-label="ชื่อพนักงาน (สร้างทันที)" />
            <Input type="email" placeholder="email@example.com" value={quick.email} disabled={quickBusy}
              onChange={(e) => setQuick((q) => ({ ...q, email: e.target.value }))} className="rounded-xl" aria-label="อีเมลพนักงาน (สร้างทันที)" />
          </div>
          <div className="flex gap-2">
            <Input placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)" value={quick.password} disabled={quickBusy}
              onChange={(e) => setQuick((q) => ({ ...q, password: e.target.value }))} className="rounded-xl font-mono" aria-label="รหัสผ่านพนักงาน" />
            <Button type="button" variant="outline" className="rounded-xl shrink-0" onClick={genPassword} disabled={quickBusy}>
              <RefreshCw className="w-4 h-4 mr-1" /> สุ่ม
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={quick.role} onValueChange={(v) => setQuick((q) => ({ ...q, role: v }))}>
              <SelectTrigger className="rounded-xl" disabled={quickBusy}><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter(r => r.v !== "customer").map(r => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="rounded-xl" onClick={createStaffNow} disabled={quickBusy}>
              {quickBusy ? "กำลังบันทึก..." : "สร้างบัญชี / ตั้งรหัสผ่านใหม่"}
            </Button>
          </div>
          {quickDone && (
            <div className="border rounded-xl p-3 bg-muted/40 text-xs space-y-2">
              <div className="font-medium">ข้อมูลเข้าใช้งาน (ส่งให้พนักงาน)</div>
              <div className="font-mono break-all">{quickDone.email} / {quickDone.password}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-xl"
                  onClick={async () => { try { await navigator.clipboard.writeText(`เข้าใช้งานที่ ${window.location.origin}/staff\nอีเมล: ${quickDone.email}\nรหัสผ่าน: ${quickDone.password}`); toast.success("คัดลอกแล้ว"); } catch { toast.error("คัดลอกไม่ได้"); } }}>
                  <Copy className="w-3 h-3 mr-1" /> คัดลอกข้อมูลล็อกอิน
                </Button>
                <Button size="sm" className="rounded-xl"
                  onClick={async () => {
                    const text = [
                      "สวัสดีค่ะ 🙌 นี่คือบัญชีเข้าใช้งานระบบพนักงาน",
                      "",
                      `🔗 ลิงก์เข้าใช้งาน: ${window.location.origin}/staff?app=staff`,
                      `👤 อีเมล: ${quickDone.email}`,
                      `🔑 รหัสผ่าน: ${quickDone.password}`,
                      "",
                      "แนะนำ: เข้าครั้งแรกแล้วเปลี่ยนรหัสผ่านที่หน้าโปรไฟล์ และกด “เพิ่มลงหน้าจอโฮม” เพื่อใช้เป็นแอปได้เลยค่ะ",
                    ].join("\n");
                    try { await navigator.clipboard.writeText(text); toast.success("คัดลอกข้อความสำหรับส่งทาง LINE แล้ว"); } catch { toast.error("คัดลอกไม่ได้"); }
                  }}>
                  <Copy className="w-3 h-3 mr-1" /> คัดลอกข้อความส่งทาง LINE
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="w-4 h-4" /> เพิ่มแอดมิน / พนักงานด้วยอีเมล
          </div>
          <Tabs value={inviteChannel} onValueChange={(v) => setInviteChannel(v as any)}>
            <TabsList className="grid grid-cols-3 rounded-xl">
              <TabsTrigger value="email" className="rounded-lg"><Mail className="w-4 h-4 mr-1" /> Email</TabsTrigger>
              <TabsTrigger value="line" className="rounded-lg"><MessageCircle className="w-4 h-4 mr-1" /> LINE</TabsTrigger>
              <TabsTrigger value="link" className="rounded-lg"><Link2 className="w-4 h-4 mr-1" /> ลิงก์</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="space-y-2 mt-3">
              <Input type="email" placeholder="email@example.com" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} className="rounded-xl" disabled={inviteBusy} />
              <p className="text-xs text-muted-foreground">
                ผู้รับจะได้อีเมลลิงก์ยืนยัน — ต้องล็อกอินก่อนกดยืนยันจึงจะได้สิทธิ์
              </p>
            </TabsContent>
            <TabsContent value="line" className="space-y-2 mt-3">
              <Input placeholder="U0123456789abcdef... (33 ตัว)" value={inviteLineId}
                onChange={(e) => setInviteLineId(e.target.value)} className="rounded-xl font-mono" disabled={inviteBusy} />
              <p className="text-xs text-muted-foreground">
                ระบบจะพุชข้อความพร้อมลิงก์เชิญไปยัง LINE ผู้รับ — ผู้รับต้องเป็นเพื่อนกับ OA ของร้าน
              </p>
            </TabsContent>
            <TabsContent value="link" className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground">
                สร้างลิงก์สมัครงานเฉพาะบุคคล — คัดลอกส่งทางไหนก็ได้ ผู้รับต้องล็อกอินก่อนกดยืนยัน
              </p>
            </TabsContent>
          </Tabs>
          <Input
            placeholder="ชื่อพนักงาน (สำหรับอ้างอิงในรายการคำเชิญ)"
            value={inviteeName}
            onChange={(e) => setInviteeName(e.target.value)}
            className="rounded-xl"
            disabled={inviteBusy}
            aria-label="ชื่อพนักงาน"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="rounded-xl" disabled={inviteBusy}><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter(r => r.v !== "customer").map(r => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="rounded-xl" onClick={sendInvite} disabled={inviteBusy}>
              {inviteBusy ? "กำลังส่ง..." : inviteChannel === "link" ? "สร้างลิงก์สมัครงาน" : "ส่งคำเชิญ"}
            </Button>
          </div>
          {inviteRole === "owner" || inviteRole === "admin" ? (
            <p className="text-xs text-muted-foreground">สิทธิ์ owner/admin เข้าถึงได้ทุกโมดูลโดยอัตโนมัติ</p>
          ) : (
            <div className="border rounded-xl p-3 space-y-2">
              <div className="text-xs font-medium">สิทธิ์เริ่มต้นเมื่อยืนยันคำเชิญ</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([["pos", "POS"], ["stock", "สต๊อก"], ["po", "PO"], ["history", "ประวัติ/รายงาน"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-xs">
                    <Switch
                      data-testid={`invite-perm-${k}`}
                      aria-label={`สิทธิ์เริ่มต้น ${label}`}
                      checked={invitePerms[k]}
                      onCheckedChange={(v) => setInvitePerms((p) => ({ ...p, [k]: v }))}
                      disabled={inviteBusy}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          {lastInviteUrl && (
            <div className="border rounded-xl p-3 space-y-2 bg-muted/40">
              <div className="text-xs font-medium">ลิงก์สมัครงานล่าสุด</div>
              <div className="flex items-center gap-2">
                <Input readOnly value={lastInviteUrl} className="rounded-xl font-mono text-xs" aria-label="ลิงก์สมัครงานล่าสุด" />
                <Button size="sm" variant="outline" className="rounded-xl shrink-0"
                  onClick={async () => { try { await navigator.clipboard.writeText(lastInviteUrl); toast.success("คัดลอกลิงก์แล้ว"); } catch { toast.error("คัดลอกไม่ได้"); } }}>
                  <Copy className="w-3 h-3 mr-1" /> คัดลอก
                </Button>
              </div>
            </div>
          )}
          <Textarea placeholder="ข้อความแนบ (ไม่บังคับ)" value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)} rows={2} className="rounded-xl" disabled={inviteBusy} />
          <div className="border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">หรือเพิ่มตรง (ถ้าอีเมลมีบัญชีแล้ว)</div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={addOrInvite} disabled={inviteBusy || inviteChannel !== "email" || !inviteEmail}>
              เพิ่มทันที / ส่งอีเมลตั้งรหัสผ่าน
            </Button>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl space-y-2">
          <div className="text-sm font-medium">คำเชิญ ({invitations.filter(i => i.status === "pending").length} รอดำเนินการ)</div>
          {invitations.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีคำเชิญ</p>
          ) : (
            <div className="space-y-2">
              {invitations.map((iv) => (
                <div key={iv.id} className="flex flex-wrap items-center gap-2 border rounded-xl p-2 text-sm">
                  <Badge variant="outline" className="rounded-md">{iv.channel === "email" ? "Email" : iv.channel === "line" ? "LINE" : "ลิงก์"}</Badge>
                  {iv.invitee_name && <span className="text-xs font-medium">{iv.invitee_name}</span>}
                  <span className="font-mono text-xs truncate max-w-[220px]">{iv.target}</span>
                  <Badge variant="secondary" className="rounded-md">{iv.role}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {[iv.perm_pos && "POS", iv.perm_stock && "สต๊อก", iv.perm_po && "PO", iv.perm_history && "ประวัติ"].filter(Boolean).join(" · ") || "ไม่มีสิทธิ์เริ่มต้น"}
                  </span>
                  <Badge
                    variant={iv.status === "pending" ? "default" : iv.status === "accepted" ? "outline" : "destructive"}
                    className="rounded-md capitalize"
                  >{iv.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(iv.created_at).toLocaleDateString("th-TH")}
                  </span>
                  {iv.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-lg h-7" onClick={() => copyLink(iv.token)}>
                        <Copy className="w-3 h-3 mr-1" /> คัดลอกลิงก์
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-lg h-7 text-destructive" onClick={() => revokeInvite(iv.id)}>
                        <XCircle className="w-3 h-3 mr-1" /> ยกเลิก
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {bulk.selectMode && <th className="p-3 w-10"><Checkbox checked={bulk.allSelected} onCheckedChange={() => bulk.toggleAll()} /></th>}
                <th className="p-3 text-left">ชื่อ</th><th className="p-3 text-left">อีเมล</th><th className="p-3 text-left">สถานะอีเมล</th><th className="p-3 text-left">สิทธิ์</th>
                <th className="p-3 text-center">POS</th><th className="p-3 text-center">สต๊อก</th><th className="p-3 text-center">PO</th><th className="p-3 text-center">ประวัติ/รายงาน</th>
                <th className="p-3 text-center">เห็นราคาทุน</th><th className="p-3 text-center">สถานะบัญชี</th><th className="p-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t">
                  {bulk.selectMode && <td className="p-3"><Checkbox checked={bulk.ids.has(r.user_id)} onCheckedChange={() => bulk.toggle(r.user_id)} /></td>}
                  <td className="p-3 font-medium">{r.full_name || "-"}</td>
                  <td className="p-3 text-xs">{r.email}</td>
                  <td className="p-3 text-xs max-w-[16rem]" data-testid={`email-status-${r.user_id}`}>
                    <EmailStatusCell info={emailLog[(r.email || "").toLowerCase()]} />
                  </td>
                  <td className="p-3">
                    <Select defaultValue={r.role} onValueChange={(v) => setRole(r.user_id, v)}>
                      <SelectTrigger className="rounded-xl w-44" disabled={busy === r.user_id}><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  {(["pos", "stock", "po", "history"] as const).map((k) => {
                    const locked = r.role === "owner" || r.role === "admin";
                    return (
                      <td key={k} className="p-3 text-center">
                        <Switch
                          aria-label={`สิทธิ์ ${k} ของ ${r.full_name || r.email}`}
                          data-testid={`perm-${k}-${r.user_id}`}
                          disabled={locked}
                          checked={permsFor(r.user_id, r.role)[k]}
                          onCheckedChange={(v) => togglePerm(r.user_id, r.role, k, v)}
                        />
                      </td>
                    );
                  })}
                  <td className="p-3 text-center">
                    <Switch checked={!!r.cost_visible} onCheckedChange={(v) => setCostVisible(r.user_id, v)} />
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Switch
                        aria-label={`สถานะบัญชีของ ${r.full_name || r.email}`}
                        data-testid={`active-${r.user_id}`}
                        disabled={busy === r.user_id}
                        checked={r.staff_active !== false}
                        onCheckedChange={(v) => setStaffActive(r.user_id, v)}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {r.staff_active === false ? "ปิดใช้งาน" : "ใช้งานอยู่"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                    <Button size="sm" variant="outline" className="rounded-xl mb-1"
                      data-testid={`reset-pw-${r.user_id}`}
                      onClick={() => prepareReset(r)}>
                      <RefreshCw className="w-3 h-3 mr-1" /> ตั้งรหัสผ่านใหม่
                    </Button>
                    <div>เพิ่มเมื่อ {new Date(r.created_at).toLocaleDateString("th-TH")}</div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีพนักงาน — เชิญผ่านการสมัครสมาชิกแล้วกำหนดสิทธิ์ที่นี่</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
      {bulk.selectMode && bulk.count > 0 && (
        <BulkActionBar count={bulk.count} onCancel={bulk.exit} onConfirm={() => { void bulkDowngrade(); }}
          actionLabel="ปลดสิทธิ์เป็นลูกค้า"
          confirmTitle={`ปลดสิทธิ์พนักงาน ${bulk.count} คน?`}
          confirmDescription={`ตั้งสิทธิ์เป็น 'ลูกค้า' จำนวน ${bulk.count} คน`}
          itemLabel="พนักงาน"
          previewNames={bulk.selectedArray.map(id => {
            const r: any = rows.find((x: any) => x.user_id === id);
            return r ? (r.full_name || r.email) : null;
          }).filter(Boolean) as string[]}
          confirmWord="ปลด"
        />
      )}
    </AdminLayout>
  );
}