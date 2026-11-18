import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock, LineChart } from "lucide-react";
import SeoHead from "@/components/SeoHead";

/**
 * Public signup is closed. This project only allows a pre-approved
 * admin allow-list to sign in via /login; customers use LINE (/l/shop).
 * The page remains routable so old links don't 404 — it explains the
 * change and points visitors to the right entrypoint.
 */
export default function Signup() {
  return (
    <div className="min-h-screen bg-gradient-soft grid place-items-center p-6">
      <SeoHead
        title="ปิดรับสมัครสมาชิก — ร้านนัฐภรณ์ เชียงกลาง"
        description="ร้านเปิดใช้เฉพาะแอดมินและลูกค้าผ่าน LINE เท่านั้น ไม่รับสมัครสมาชิกทั่วไปแล้ว"
        path="/signup"
      />
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-card p-6 space-y-5">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> กลับหน้าหลัก
        </Link>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 grid place-items-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold">ปิดรับสมัครสมาชิก</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ระบบนี้เปิดใช้เฉพาะ <b>แอดมิน</b> ที่ได้รับอนุญาต<br />
            ลูกค้าทั่วไปกรุณาเข้าใช้งานผ่าน <b>LINE</b>
          </p>
        </div>

        <div className="grid gap-2">
          <Button asChild className="w-full h-11 rounded-xl">
            <Link to="/l/shop">
              <LineChart className="w-4 h-4 mr-1.5" /> เข้าสู่ระบบด้วย LINE (ลูกค้า)
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full h-11 rounded-xl">
            <Link to="/login?admin=1">
              <Lock className="w-4 h-4 mr-1.5" /> เข้าสู่ระบบแอดมิน
            </Link>
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          ต้องการเป็นแอดมิน? ติดต่อเจ้าของร้านเพื่อเพิ่มอีเมลเข้ารายการที่อนุญาต
        </p>
      </div>
    </div>
  );
}
