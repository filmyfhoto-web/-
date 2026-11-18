import { Link } from "react-router-dom";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

/** Friendly dead-end for an authenticated user without a usable role. */
export default function NoAccess() {
  const { profile, signOut } = useAuth();
  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center space-y-4 shadow-sm">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-500" />
        <h1 className="text-xl font-bold">บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน</h1>
        <p className="text-sm text-muted-foreground">
          บัญชี {profile?.email || "ของคุณ"} ยังไม่ได้ถูกกำหนดบทบาท กรุณาติดต่อเจ้าของกิจการเพื่อขอสิทธิ์
        </p>
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/customer/login">เข้าสู่ระบบในฐานะลูกค้า</Link>
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={async () => { await signOut(); window.location.assign("/welcome"); }}>
            <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ
          </Button>
        </div>
      </div>
    </main>
  );
}