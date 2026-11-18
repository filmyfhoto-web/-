import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MessageCircle, Loader2, RefreshCw, Copy, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

type Profile = { line_user_id: string | null; line_display_name: string | null; line_verified_at: string | null; line_picture_url: string | null };

export default function VerifyLine() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [lineUrl, setLineUrl] = useState<string | null>(null);

  async function loadProfile() {
    if (!user) return;
    setLoading(true);
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("line_user_id, line_display_name, line_verified_at, line_picture_url").eq("id", user.id).maybeSingle(),
      supabase.from("settings").select("line_url").eq("id", 1).maybeSingle(),
    ]);
    const prof = (p as any) || { line_user_id: null, line_display_name: null, line_verified_at: null, line_picture_url: null };
    // Verification is only granted through the audited LIFF edge-function
    // flow — never client-side backfill.
    setProfile(prof);
    setLineUrl((s as any)?.line_url || null);
    setLoading(false);
  }
  useEffect(() => { if (!authLoading && user) loadProfile(); }, [authLoading, user]);

  async function generateCode() {
    setGenLoading(true);
    try {
      const { data, error } = await supabase.rpc("generate_my_line_link_code" as any);
      if (error) throw error;
      setCode(String(data));
      toast.success("สร้างรหัสยืนยัน 6 หลักแล้ว");
    } catch (e: any) { toast.error(e?.message || "สร้างรหัสไม่สำเร็จ"); }
    finally { setGenLoading(false); }
  }

  async function unlink() {
    if (!confirm("ยืนยันยกเลิกการผูก LINE?")) return;
    const { error } = await supabase.rpc("unlink_my_line" as any);
    if (error) return toast.error(error.message);
    toast.success("ยกเลิกการผูกแล้ว");
    setCode(null);
    loadProfile();
  }

  const linked = !!profile?.line_user_id;
  const chatMessage = code ? `link ${code}` : "";

  if (authLoading || loading) {
    return <CustomerLayout><div className="text-center py-20 text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div></CustomerLayout>;
  }
  if (!user) {
    return (
      <CustomerLayout>
        <div className="max-w-md mx-auto mt-16 bg-card border border-border rounded-2xl p-6 text-center shadow-card">
          <ShieldCheck className="w-10 h-10 mx-auto text-primary mb-3" />
          <h1 className="text-xl font-bold mb-2">เข้าสู่ระบบก่อนยืนยันตัวตน</h1>
          <p className="text-sm text-muted-foreground mb-4">คุณต้องเข้าสู่ระบบเพื่อผูก LINE กับบัญชีของคุณ</p>
          <Button asChild className="rounded-xl"><Link to="/login">เข้าสู่ระบบ</Link></Button>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <SeoHead title="ยืนยันตัวตนด้วย LINE — ร้านนัฐภรณ์" description="เชื่อมบัญชีคุณกับ LINE เพื่อยืนยันตัวตนและรับแจ้งเตือน" path="/verify-line" />
      <div className="max-w-2xl mx-auto py-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">ยืนยันตัวตนด้วย LINE</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">ผูก LINE กับบัญชีของคุณเพื่อความปลอดภัย รับใบเสนอราคา/แจ้งเตือนสถานะสั่งซื้อได้ทันที</p>

        {linked ? (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-8 h-8 text-success" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg">ยืนยันตัวตนสำเร็จ</h2>
                  <Badge className="bg-success text-success-foreground border-0">Verified</Badge>
                </div>
                <p className="text-sm text-muted-foreground">ผูกกับ LINE: <b>{profile?.line_display_name || "—"}</b></p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3 font-mono break-all">
              userId: {profile?.line_user_id}
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <Button variant="outline" onClick={loadProfile} className="rounded-xl"><RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช</Button>
              <Button variant="destructive" onClick={unlink} className="rounded-xl">ยกเลิกการผูก</Button>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-card space-y-5">
            <div className="grid gap-4">
              <div className="rounded-xl border p-4 bg-muted/30">
                <div className="font-semibold flex items-center gap-2 mb-1"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">1</span> สร้างรหัสยืนยัน</div>
                <p className="text-xs text-muted-foreground mb-3 pl-8">กดปุ่มด้านล่างเพื่อสร้างรหัส 6 หลัก (หมดอายุใน 10 นาที)</p>
                <div className="pl-8 flex items-center gap-2 flex-wrap">
                  <Button onClick={generateCode} disabled={genLoading} className="rounded-xl">
                    {genLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                    {code ? "สร้างรหัสใหม่" : "สร้างรหัส 6 หลัก"}
                  </Button>
                  {code && (
                    <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-lg px-3 py-2 font-mono text-xl font-bold tracking-widest">
                      {code}
                      <button onClick={() => { navigator.clipboard.writeText(code); toast.success("คัดลอกรหัสแล้ว"); }} className="text-primary hover:opacity-70">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border p-4 bg-muted/30">
                <div className="font-semibold flex items-center gap-2 mb-1"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">2</span> เปิด LINE ของร้าน</div>
                <p className="text-xs text-muted-foreground mb-3 pl-8">เพิ่มเป็นเพื่อนถ้ายังไม่ได้ทำ แล้วส่งข้อความในแชท</p>
                <div className="pl-8 flex flex-wrap gap-2">
                  {lineUrl && (
                    <Button asChild variant="outline" className="rounded-xl">
                      <a href={lineUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4 mr-1 text-[#06C755]" /> เปิด LINE ร้าน <ExternalLink className="w-3 h-3 ml-1" /></a>
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border p-4 bg-muted/30">
                <div className="font-semibold flex items-center gap-2 mb-1"><span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">3</span> ส่งข้อความยืนยัน</div>
                <p className="text-xs text-muted-foreground pl-8 mb-2">พิมพ์ (หรือคัดลอก) ข้อความต่อไปนี้แล้วส่งใน LINE ของร้าน:</p>
                <div className="pl-8 flex items-center gap-2">
                  <code className="flex-1 bg-background border rounded-lg px-3 py-2 font-mono text-sm">
                    {code ? chatMessage : "link ______"}
                  </code>
                  {code && (
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(chatMessage); toast.success("คัดลอกข้อความแล้ว"); }} className="rounded-lg">
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground pl-8 mt-2">เมื่อร้านตอบกลับว่า "ผูกสำเร็จ" ให้กด "รีเฟรช" ด้านล่างเพื่ออัปเดตสถานะ</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={loadProfile} className="rounded-xl"><RefreshCw className="w-4 h-4 mr-1" /> รีเฟรชสถานะ</Button>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}