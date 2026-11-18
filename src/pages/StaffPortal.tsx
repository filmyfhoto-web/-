import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Monitor, Package, Store } from "lucide-react";
import { BUILD_INFO } from "@/lib/buildInfo";

/**
 * Staff-only entry screen ("/portal"): two clear doors — owner/admin 🖥️ and
 * staff 📦. Not linked from any customer surface and marked noindex, so
 * shoppers never see it. Real access is still enforced by the route guards
 * and server-side roles; this page only routes people to the right login.
 */
export default function StaffPortal() {
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex,nofollow";
    document.head.appendChild(m);
    const prev = document.title;
    document.title = "ทางเข้าสำหรับบุคลากร — ร้านนัฐภรณ์";
    return () => { m.remove(); document.title = prev; };
  }, []);

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 py-10 bg-slate-950">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">ทางเข้าสำหรับบุคลากร</h1>
          <p className="text-sm text-slate-300">เลือกแอปที่ต้องการเข้าใช้งาน (ติดตั้งเป็นแอปบนมือถือได้)</p>
        </header>

        <div className="grid gap-3">
          {/* 🏪 POS — the flagship touch register, first and largest. */}
          <Link
            to="/launch?app=pos"
            data-testid="portal-pos"
            className="block rounded-2xl border-4 border-blue-400 bg-gradient-to-br from-blue-600 to-blue-800 px-5 py-6 text-left shadow-xl hover:from-blue-500 hover:to-blue-700 transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="text-5xl" aria-hidden>🏪</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xl text-white flex items-center gap-2">
                    <Store className="w-5 h-5" /> POS หน้าร้าน
                  </span>
                  <span
                    data-testid="portal-pos-badge"
                    className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black text-white"
                  >
                    ใหม่ v{BUILD_INFO.version}
                  </span>
                </div>
                <div className="text-sm text-blue-100">ขายสินค้า สแกนบาร์โค้ด รับชำระเงิน และพิมพ์ใบเสร็จ</div>
              </div>
            </div>
            <div
              data-testid="portal-pos-open"
              className="mt-4 grid place-items-center rounded-xl bg-white py-3 font-black text-blue-800 text-lg"
            >
              เปิด POS
            </div>
          </Link>

          <Link
            to="/auth?app=admin"
            data-testid="portal-admin"
            className="flex items-center gap-4 rounded-2xl border-2 border-blue-400/40 bg-blue-950/60 px-5 py-5 text-left hover:bg-blue-900/60 transition-colors"
          >
            <span className="text-3xl" aria-hidden>🖥️</span>
            <div>
              <div className="font-bold text-base text-white flex items-center gap-2">
                <Monitor className="w-4 h-4" /> เจ้าของ / ผู้ดูแลระบบ
              </div>
              <div className="text-xs text-slate-300">แดชบอร์ด รายงาน พนักงานและสิทธิ์ ตั้งค่าระบบทั้งหมด</div>
            </div>
          </Link>

          <Link
            to="/staff/login?app=staff"
            data-testid="portal-staff"
            className="flex items-center gap-4 rounded-2xl border-2 border-amber-400/40 bg-amber-950/40 px-5 py-5 text-left hover:bg-amber-900/40 transition-colors"
          >
            <span className="text-3xl" aria-hidden>📦</span>
            <div>
              <div className="font-bold text-base text-white flex items-center gap-2">
                <Package className="w-4 h-4" /> พนักงาน
              </div>
              <div className="text-xs text-slate-300">งานที่ได้รับมอบหมาย POS ออเดอร์ และสต๊อกสินค้า</div>
            </div>
          </Link>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          ลูกค้าไม่ต้องใช้หน้านี้ — สั่งซื้อและติดตามคำสั่งซื้อผ่านลิงก์ร้านหรือ LINE ได้เลย
        </p>
      </div>
    </main>
  );
}