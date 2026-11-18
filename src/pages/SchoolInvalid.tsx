import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SeoHead from "@/components/SeoHead";

export default function SchoolInvalid() {
  return (
    <div className="min-h-screen bg-gradient-soft grid place-items-center px-6">
      <SeoHead title="ลิงก์โรงเรียนไม่ถูกต้อง" description="ลิงก์ที่ใช้เข้าสู่หน้าสินค้าไม่ถูกต้องหรือหมดอายุ" path="/school/invalid" />
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-8 text-center shadow-card">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive grid place-items-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold mb-2">ลิงก์โรงเรียนไม่ถูกต้อง</h1>
        <p className="text-muted-foreground text-sm mb-6">
          ลิงก์ที่ใช้อาจหมดอายุ ถูกลบ หรือกรอกไม่ครบถ้วน
          กรุณาขอลิงก์ใหม่จากทางร้านผ่าน LINE OA
        </p>
        <Button asChild className="w-full h-12 rounded-2xl bg-gradient-primary text-primary-foreground">
          <Link to="/s"><ArrowLeft className="w-4 h-4 mr-2" /> กลับไปหน้าขอลิงก์โรงเรียน</Link>
        </Button>
      </div>
    </div>
  );
}