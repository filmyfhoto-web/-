import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { friendlyError } from "@/lib/errors";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(friendlyError(error, "ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่")); return; }
    setSent(true);
    toast.success("ส่งลิงก์รีเซ็ตไปยังอีเมลแล้ว");
  }

  return (
    <div className="min-h-screen bg-gradient-soft grid place-items-center p-4">
      <SeoHead title="ลืมรหัสผ่าน — ร้านนัฐภรณ์ เชียงกลาง" description="รีเซ็ตรหัสผ่านผ่านอีเมล" path="/forgot-password" />
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center text-sm text-muted-foreground mb-4 hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> กลับเข้าสู่ระบบ
        </Link>
        <div className="bg-card rounded-3xl p-8 shadow-card border border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary grid place-items-center text-primary-foreground">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold leading-tight">ลืมรหัสผ่าน</h1>
              <p className="text-xs text-muted-foreground">ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณ</p>
            </div>
          </div>
          {sent ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-sm">
                ส่งลิงก์ไปที่ <b>{email}</b> แล้ว — เปิดอีเมลและคลิกลิงก์เพื่อตั้งรหัสผ่านใหม่
              </div>
              <Button variant="outline" className="w-full rounded-xl" onClick={() => setSent(false)}>ส่งอีกครั้ง</Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label>อีเมลที่ใช้สมัคร</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl mt-1" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl bg-primary text-primary-foreground">
                {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}