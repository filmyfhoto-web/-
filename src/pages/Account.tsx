import CustomerLayout from "@/components/layout/CustomerLayout";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmtDateTime, fmtTHB, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";
import SeoHead from "@/components/SeoHead";
import { User, KeyRound, MessageCircle, FileText, ClipboardList, Unlink, Copy, ExternalLink, CheckCircle2, XCircle, Loader2, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import LineProfileHeader from "@/components/customer/LineProfileHeader";
import PwaCacheResetCard from "@/components/PwaCacheResetCard";
import { NO_EMAIL_PLACEHOLDER, realEmail } from "@/lib/lineProfile";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, hasValidConsent, recordConsent, revokeConsent } from "@/lib/consent";

function StepRow({ ok, pending, warn, label }: { ok: boolean; pending?: boolean; warn?: boolean; label: string }) {
  const Icon = pending ? Loader2 : ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = pending ? "text-muted-foreground" : ok ? "text-success" : warn ? "text-amber-500" : "text-destructive";
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 ${color} ${pending ? "animate-spin" : ""}`} />
      <span>{label}</span>
    </div>
  );
}

export default function Account() {
  const { user, profile, refresh } = useAuth();
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", address: "", tax_id: "" });
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [lineTest, setLineTest] = useState<
    | { status: "idle" }
    | { status: "sending" }
    | { status: "ok"; at: string; detail?: string }
    | { status: "error"; at: string; message: string }
  >({ status: "idle" });
  const [refreshingLine, setRefreshingLine] = useState(false);
  const [lineStatusCheckedAt, setLineStatusCheckedAt] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeAt, setLinkCodeAt] = useState<string | null>(null);
  const [genCodeLoading, setGenCodeLoading] = useState(false);
  const [lineMode, setLineMode] = useState<{ mode_b_ready?: boolean; checked: boolean }>({ checked: false });

  useEffect(() => {
    supabase.functions.invoke("line-config-check", { body: {} }).then(({ data, error }) => {
      if (!error && data) {
        setLineMode({ mode_b_ready: !!data.mode_b_ready, checked: true });
      } else {
        setLineMode(prev => ({ ...prev, checked: true }));
      }
    });
  }, []);

  async function generateLinkCode() {
    setGenCodeLoading(true);
    try {
      const { data, error } = await supabase.rpc("generate_my_line_link_code" as any);
      if (error) throw error;
      setLinkCode(String(data));
      setLinkCodeAt(new Date().toISOString());
      toast.success("สร้างรหัสใหม่แล้ว — ใช้ได้ 15 นาที");
    } catch (e: any) {
      toast.error(friendlyError(e?.message, "สร้างรหัสไม่สำเร็จ"));
    } finally {
      setGenCodeLoading(false);
    }
  }

  async function logLineEvent(event: string, detail: Record<string, unknown> = {}) {
    try { await supabase.rpc("log_line_link_event" as any, { p_event: event, p_detail: detail as any }); } catch { /* best-effort */ }
  }

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        email: realEmail(profile.email) || "",
        address: profile.address || "",
        tax_id: profile.tax_id || "",
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: all } = await supabase.from("orders")
        .select("id, order_no, status, total, created_at, note")
        .eq("customer_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      const list = all ?? [];
      setOrders(list.filter(o => !["pending_quote", "quoted"].includes(o.status)));
      setQuotes(list.filter(o => ["pending_quote", "quoted"].includes(o.status)));
    })();
  }, [user, profile]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const nextEmail = form.email.trim();
    const patch: {
      full_name: string; phone: string; address: string; tax_id: string; email?: string;
    } = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      tax_id: form.tax_id.trim(),
    };
    // Never overwrite the stored synthetic LINE identifier with an empty
    // string — the customer simply has not added a real email yet.
    if (nextEmail) patch.email = nextEmail;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(friendlyError(error, "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่"));
    toast.success("บันทึกข้อมูลแล้ว");
    refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("รหัสผ่านอย่างน้อย 8 ตัวอักษร"); return; }
    if (pw !== pw2) { toast.error("รหัสผ่านไม่ตรงกัน"); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwLoading(false);
    if (error) return toast.error(friendlyError(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ"));
    setPw(""); setPw2("");
    toast.success("เปลี่ยนรหัสผ่านแล้ว");
  }

  async function sendResetEmail() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(friendlyError(error, "ส่งลิงก์ไม่สำเร็จ"));
    toast.success("ส่งลิงก์รีเซ็ตไปอีเมลแล้ว");
  }

  async function unlinkLine() {
    const { error } = await supabase.rpc("unlink_my_line");
    if (error) return toast.error(friendlyError(error, "ยกเลิกการผูกไม่สำเร็จ"));
    logLineEvent("line_unlink");
    toast.success("ยกเลิกการผูกแล้ว");
    refresh();
  }

  async function refreshLineStatus() {
    if (!user) return;
    setRefreshingLine(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("line_user_id, line_display_name, line_verified_at, line_picture_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      // LINE verification is only performed by the audited edge-function flow
      // (line-link-start/bind/verify). We intentionally do NOT backfill
      // line_verified_at from the client — a client-side backfill would let
      // a signed-in user claim any LINE user id as "verified".
      await refresh();
      const now = new Date().toISOString();
      setLineStatusCheckedAt(now);
      logLineEvent("line_link_test_ok", {
        action: "refresh_status",
        linked: !!data?.line_user_id,
        display_name: data?.line_display_name ?? null,
      });
      toast.success(data?.line_user_id ? `สถานะ: ผูกแล้ว (${data.line_display_name || "—"})` : "สถานะ: ยังไม่ผูก");
    } catch (e: any) {
      logLineEvent("line_link_test_error", { action: "refresh_status", message: String(e?.message || e) });
      toast.error(friendlyError(e, "รีเฟรชสถานะไม่สำเร็จ"));
    } finally {
      setRefreshingLine(false);
    }
  }

  async function sendTestLine() {
    setLineTest({ status: "sending" });
    try {
      const { data, error } = await supabase.functions.invoke("line-notify", { body: { kind: "link_confirm" } });
      const now = new Date().toISOString();
      if (error) {
        const msg = friendlyError(error, "ส่งข้อความทดสอบไม่สำเร็จ");
        setLineTest({ status: "error", at: now, message: msg });
        logLineEvent("line_link_test_error", { stage: "invoke", message: msg });
        toast.error(msg);
        return;
      }
      if (data && (data as any).error) {
        const msg = String((data as any).error);
        setLineTest({ status: "error", at: now, message: msg });
        logLineEvent("line_link_test_error", { stage: "function_error", message: msg });
        toast.error(msg);
        return;
      }
      const r = (data as any)?.results?.customer;
      if (r && r.ok === false && !r.skipped) {
        const msg = `LINE ตอบกลับ ${r.status || ""} ${r.body || ""}`.trim();
        setLineTest({ status: "error", at: now, message: msg });
        logLineEvent("line_link_test_error", { stage: "line_api", status: r.status, body: r.body });
        toast.error("ส่งไม่สำเร็จ — ดูรายละเอียดด้านล่าง");
        return;
      }
      const detail = r?.deduped ? "ส่งซ้ำถูกข้ามไว้ (idempotency)" : r?.skipped ? `ข้าม: ${r.reason || "ไม่ทราบเหตุผล"}` : "ส่งแล้ว — โปรดเช็คแอป LINE ของคุณ";
      setLineTest({ status: "ok", at: now, detail });
      logLineEvent("line_link_test_ok", { deduped: !!r?.deduped, skipped: !!r?.skipped });
      toast.success("ส่งข้อความทดสอบไปยัง LINE แล้ว");
    } catch (e: any) {
      setLineTest({ status: "error", at: new Date().toISOString(), message: friendlyError(e, "ส่งข้อความทดสอบไม่สำเร็จ") });
      logLineEvent("line_link_test_error", { stage: "exception", message: String(e?.message || e) });
    }
  }

  const lineLinked = !!profile?.line_user_id;
  const consentOk = hasValidConsent(profile);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`คัดลอก ${label} แล้ว`);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  async function reAcceptConsent() {
    if (!user) return;
    try {
      await recordConsent(user.id, ["terms", "privacy"], "manual");
      toast.success("บันทึกการยอมรับนโยบายแล้ว");
      refresh();
    } catch (e) {
      toast.error(friendlyError(e, "บันทึกไม่สำเร็จ"));
    }
  }

  async function doRevokeConsent() {
    if (!user) return;
    if (!window.confirm("ต้องการเพิกถอนความยินยอม? ระบบจะบังคับยอมรับใหม่ก่อนสั่งซื้อครั้งถัดไป")) return;
    try {
      await revokeConsent(user.id);
      toast.success("เพิกถอนความยินยอมแล้ว");
      refresh();
    } catch (e) {
      toast.error(friendlyError(e, "เพิกถอนไม่สำเร็จ"));
    }
  }

  return (
    <CustomerLayout>
      <SeoHead title="บัญชีของฉัน — ร้านนัฐภรณ์ เชียงกลาง" description="จัดการข้อมูลส่วนตัว ดูประวัติคำสั่งซื้อ และผูก LINE" path="/account" />
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><User className="w-6 h-6 text-primary" /> บัญชีของฉัน</h1>

      <div className="mb-4 max-w-2xl">
        <LineProfileHeader
          name={profile?.line_display_name || profile?.full_name || null}
          pictureUrl={(profile as any)?.line_picture_url || null}
          linked={!!profile?.line_user_id}
          onSynced={refresh}
        />
      </div>

      <Tabs defaultValue="profile" className="w-full pb-28 md:pb-0">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full mb-4 h-auto">
          <TabsTrigger value="profile" className="gap-1"><User className="w-4 h-4" /> ข้อมูล</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1"><ClipboardList className="w-4 h-4" /> ออเดอร์</TabsTrigger>
          <TabsTrigger value="quotes" className="gap-1"><FileText className="w-4 h-4" /> ใบเสนอราคา</TabsTrigger>
          <TabsTrigger value="line" className="gap-1"><MessageCircle className="w-4 h-4" /> LINE</TabsTrigger>
          <TabsTrigger value="security" className="gap-1"><KeyRound className="w-4 h-4" /> รหัสผ่าน</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="bg-card rounded-2xl border border-border p-5 shadow-card max-w-2xl space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>ชื่อ-นามสกุล</Label><Input value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} className="rounded-xl mt-1" /></div>
              <div><Label>เบอร์โทร</Label><Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="rounded-xl mt-1" /></div>
              <div className="min-w-0">
                <Label htmlFor="account-email">อีเมล</Label>
                <Input
                  id="account-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  data-testid="account-email"
                  placeholder={NO_EMAIL_PLACEHOLDER}
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="rounded-xl mt-1 w-full max-w-full truncate"
                />
                {!form.email && (
                  <p className="mt-1 text-[12px] text-muted-foreground">{NO_EMAIL_PLACEHOLDER} — เพิ่มอีเมลจริงเพื่อรับเอกสารทางอีเมล</p>
                )}
              </div>
              <div><Label>เลขผู้เสียภาษี</Label><Input value={form.tax_id} onChange={(e) => setForm(f => ({ ...f, tax_id: e.target.value }))} className="rounded-xl mt-1" /></div>
            </div>
            <div>
              <Label>ที่อยู่</Label>
              <Textarea value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} className="rounded-xl mt-1" rows={3} />
            </div>
            <Button onClick={saveProfile} disabled={saving} className="rounded-xl bg-primary text-primary-foreground">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
            {orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">ยังไม่มีคำสั่งซื้อ</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-accent text-xs"><tr>
                    <th className="text-left p-3">เลขที่</th><th className="text-left p-3">วันที่</th>
                    <th className="text-right p-3">ยอด</th><th className="text-center p-3">สถานะ</th>
                  </tr></thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="border-t border-border hover:bg-accent/30">
                        <td className="p-3 font-bold text-primary"><Link to={`/my-orders/${o.id}`}>{o.order_no}</Link></td>
                        <td className="p-3 text-xs">{fmtDateTime(o.created_at)}</td>
                        <td className="p-3 text-right">{fmtTHB(o.total)}</td>
                        <td className="p-3 text-center"><span className={`px-2 py-1 text-xs rounded-full border ${ORDER_STATUS_COLOR[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="quotes">
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
            {quotes.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">ยังไม่มีใบเสนอราคา</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-accent text-xs"><tr>
                    <th className="text-left p-3">เลขที่</th><th className="text-left p-3">วันที่</th>
                    <th className="text-right p-3">ยอด</th><th className="text-center p-3">สถานะ</th>
                  </tr></thead>
                  <tbody>
                    {quotes.map(q => (
                      <tr key={q.id} className="border-t border-border hover:bg-accent/30">
                        <td className="p-3 font-bold text-primary"><Link to={`/my-orders/${q.id}`}>{q.order_no}</Link></td>
                        <td className="p-3 text-xs">{fmtDateTime(q.created_at)}</td>
                        <td className="p-3 text-right">{fmtTHB(q.total)}</td>
                        <td className="p-3 text-center"><span className={`px-2 py-1 text-xs rounded-full border ${ORDER_STATUS_COLOR[q.status]}`}>{ORDER_STATUS_LABEL[q.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="line">
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
            <div className="md:col-span-2 bg-card rounded-2xl border border-border p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#06C755]" /> เชื่อมบัญชี LINE ด้วยการล็อกอิน
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  วิธีที่เร็วที่สุด — กดยืนยันที่ LINE แล้วกลับมาเป็นบัญชีเดิม พร้อมดูสถานะว่าผูกแล้วหรือยัง
                </p>
              </div>
              <Button asChild size="sm" className="rounded-xl">
                <Link to="/account/line">{lineLinked ? "ดูสถานะการผูก" : "เชื่อมบัญชี LINE"}</Link>
              </Button>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#06C755]" />
                <h3 className="font-bold">ผูก LINE รับแจ้งเตือน</h3>
                {lineLinked && (
                  <Badge className="bg-success text-success-foreground border-0 gap-1">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </Badge>
                )}
              </div>
              {!lineLinked && (
                <div className="text-xs">
                  <Link to="/verify-line" className="text-primary underline inline-flex items-center gap-1">
                    ไปหน้ายืนยันตัวตน LINE แบบเต็ม <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                กด "สร้างรหัส 6 หลัก" แล้วส่งข้อความ <code className="text-xs">link XXXXXX</code> กลับมาทาง LINE Official Account ของร้าน
              </p>

              {!lineLinked ? (
                <>
                  <StepRow ok={lineMode.checked} label="ตรวจสอบระบบ LINE" />
                  <StepRow ok={lineMode.mode_b_ready === true} warn={lineMode.mode_b_ready === false} label="Messaging API พร้อม" />
                  <StepRow ok={!!form.phone} warn={!form.phone} label="บันทึกเบอร์โทรในข้อมูลส่วนตัว" />
                  {lineMode.mode_b_ready === false && (
                    <p className="text-[11px] text-amber-700">
                      ระบบ LINE ยังไม่พร้อม — หลังจากทีมงานตั้งค่าเสร็จ จึงจะผูกได้
                    </p>
                  )}
                  <Button
                    onClick={generateLinkCode}
                    disabled={genCodeLoading || !form.phone}
                    className="rounded-xl bg-[#06C755] text-white hover:bg-[#05b64d] w-full"
                  >
                    {genCodeLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1" />}
                    สร้างรหัส 6 หลัก
                  </Button>
                  {linkCode && (
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 space-y-2">
                      <div className="text-sm font-semibold text-emerald-800">รหัสของคุณ: {linkCode}</div>
                      <div className="text-xs text-emerald-700">
                        ส่งข้อความ <code className="font-bold">link {linkCode}</code> กลับมาทาง LINE OA
                        {linkCodeAt && <span className="block text-[11px] mt-1">สร้างเมื่อ {fmtDateTime(linkCodeAt)} · ใช้ได้ 15 นาที</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => copyText(`link ${linkCode}`, "ข้อความผูก LINE")}>
                          <Copy className="w-3.5 h-3.5 mr-1" /> คัดลอก
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg" asChild>
                          <a href="https://line.me/R/ti/p/%40nattafilmyy" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> เปิด LINE
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span>ผูก LINE แล้ว</span>
                      {profile?.line_display_name && <span className="text-muted-foreground">({profile.line_display_name})</span>}
                    </div>
                    <div className="text-xs text-muted-foreground break-all">userId: {profile?.line_user_id}</div>
                    {lineStatusCheckedAt && <div className="text-[11px] text-muted-foreground">ตรวจสอบเมื่อ {fmtDateTime(lineStatusCheckedAt)}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={sendTestLine} disabled={lineTest.status === "sending"}>
                      {lineTest.status === "sending" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1" />}
                      ส่งข้อความทดสอบ
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={refreshLineStatus} disabled={refreshingLine}>
                      {refreshingLine ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                      รีเฟรชสถานะ
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl text-destructive" onClick={unlinkLine}>
                      <Unlink className="w-4 h-4 mr-1" /> ยกเลิกการผูก
                    </Button>
                  </div>
                  {lineTest.status === "ok" && (
                    <div className="text-xs text-emerald-700">✅ ส่งข้อความทดสอบแล้ว — {lineTest.detail} · {fmtDateTime(lineTest.at)}</div>
                  )}
                  {lineTest.status === "error" && (
                    <div className="text-xs text-destructive">❌ {lineTest.message} · {fmtDateTime(lineTest.at)}</div>
                  )}
                </>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-3">
              <h3 className="font-bold">วิธีผูก LINE</h3>
              <ol className="text-xs space-y-2 list-decimal pl-4">
                <li>บันทึกเบอร์โทรในหน้า "ข้อมูล" ให้ถูกต้อง</li>
                <li>กด "สร้างรหัส 6 หลัก" ด้านซ้าย</li>
                <li>เปิด LINE แล้วเพิ่ม <a href="https://line.me/R/ti/p/%40nattafilmyy" className="text-primary underline" target="_blank" rel="noopener noreferrer">@nattafilmyy</a> เป็นเพื่อน</li>
                <li>ส่งข้อความ <code className="text-xs">link XXXXXX</code> (แทน XXXXXX ด้วยรหัสที่ได้รับ) กลับมา</li>
                <li>รอข้อความตอบกลับ "เชื่อมบัญชีสำเร็จ"</li>
              </ol>
              <p className="text-[11px] text-muted-foreground">
                หรือพิมพ์ <code className="text-xs">#เบอร์โทร</code> ใน LINE เพื่อผูกออเดอร์ Guest ทั้งหมดของเบอร์นั้น
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
            <form onSubmit={changePassword} className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-3">
              <h3 className="font-bold">เปลี่ยนรหัสผ่าน</h3>
              <div><Label>รหัสผ่านใหม่</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="rounded-xl mt-1" /></div>
              <div><Label>ยืนยันรหัสผ่านใหม่</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="rounded-xl mt-1" /></div>
              <Button type="submit" disabled={pwLoading} className="rounded-xl bg-primary text-primary-foreground w-full">
                {pwLoading ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
              </Button>
            </form>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-3">
              <h3 className="font-bold">ลืมรหัสผ่าน?</h3>
              <p className="text-sm text-muted-foreground">ขอลิงก์รีเซ็ตรหัสผ่านส่งไปยังอีเมล {user?.email}</p>
              <p className="text-xs text-muted-foreground">หรือเข้าสู่ระบบด้วย LINE รหัส 6 หลักที่หน้า <Link to="/login" className="text-primary underline">Login</Link></p>
              <Button variant="outline" className="rounded-xl w-full" onClick={sendResetEmail}>ส่งลิงก์ไปอีเมล</Button>
            </div>
            <div data-testid="consent-section" className="bg-card rounded-2xl border border-border p-5 shadow-card space-y-3 md:col-span-2">
              <h3 className="font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> ความยินยอมและนโยบาย</h3>
              <div className="text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={consentOk ? "default" : "outline"} className={consentOk ? "bg-success text-success-foreground border-0" : ""}>
                    {consentOk ? "ยอมรับแล้ว (ล่าสุด)" : "ยังไม่ได้ยอมรับ / เวอร์ชันเก่า"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  นโยบายความเป็นส่วนตัว: เวอร์ชัน {profile?.accepted_privacy_version || "—"}
                  {profile?.accepted_privacy_at ? ` · ยอมรับเมื่อ ${fmtDateTime(profile.accepted_privacy_at)}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  เงื่อนไขการใช้งาน: เวอร์ชัน {profile?.accepted_terms_version || "—"}
                  {profile?.accepted_terms_at ? ` · ยอมรับเมื่อ ${fmtDateTime(profile.accepted_terms_at)}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  เวอร์ชันปัจจุบัน: นโยบาย {CURRENT_PRIVACY_VERSION} · เงื่อนไข {CURRENT_TERMS_VERSION}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link to="/privacy-policy" target="_blank" rel="noopener">อ่านนโยบาย</Link>
                </Button>
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link to="/terms-of-use" target="_blank" rel="noopener">อ่านเงื่อนไข</Link>
                </Button>
                {!consentOk && (
                  <Button data-testid="consent-accept-btn" className="rounded-xl bg-primary text-primary-foreground" onClick={reAcceptConsent}>
                    ยอมรับเวอร์ชันล่าสุด
                  </Button>
                )}
                {consentOk && (
                  <Button data-testid="consent-revoke-btn" variant="outline" className="rounded-xl text-destructive" onClick={doRevokeConsent}>
                    เพิกถอนความยินยอม
                  </Button>
                )}
              </div>
            </div>
            <PwaCacheResetCard className="md:col-span-2" />
          </div>
        </TabsContent>
      </Tabs>
    </CustomerLayout>
  );
}
