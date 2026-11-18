import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Contrast } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getContrastPref,
  getTextSizePref,
  setContrastPref,
  setTextSizePref,
  type ContrastPref,
  type TextSizePref,
} from "@/lib/displayPref";

/** Per-device high-contrast / comfortable reading preference. */
export default function DisplayComfortCard({ className }: { className?: string }) {
  const [contrast, setContrast] = useState<ContrastPref>("normal");
  const [textSize, setTextSize] = useState<TextSizePref>("normal");

  useEffect(() => {
    setContrast(getContrastPref());
    setTextSize(getTextSizePref());
  }, []);

  const chooseContrast = (v: ContrastPref) => { setContrast(v); setContrastPref(v); };
  const chooseText = (v: TextSizePref) => { setTextSize(v); setTextSizePref(v); };

  const optionClass = (active: boolean) =>
    cn("rounded-xl border p-3 text-left", active ? "border-primary bg-primary/10" : "bg-card hover:bg-muted");

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Contrast className="w-4 h-4" /> การแสดงผล / อ่านสบาย
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm font-semibold mb-2">คอนทราสต์</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" aria-pressed={contrast === "normal"} onClick={() => chooseContrast("normal")} className={optionClass(contrast === "normal")}>
              <div className="text-sm font-semibold">ปกติ</div>
              <div className="text-xs text-muted-foreground">โทนสีมาตรฐานของระบบ</div>
            </button>
            <button type="button" aria-pressed={contrast === "high"} onClick={() => chooseContrast("high")} className={optionClass(contrast === "high")}>
              <div className="text-sm font-semibold">คอนทราสต์สูง</div>
              <div className="text-xs text-muted-foreground">ตัวอักษรและเส้นตารางเข้มขึ้น เมนูมือถืออ่านง่าย</div>
            </button>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold mb-2">ขนาดตัวอักษร</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" aria-pressed={textSize === "normal"} onClick={() => chooseText("normal")} className={optionClass(textSize === "normal")}>
              <div className="text-sm font-semibold">ปกติ</div>
              <div className="text-xs text-muted-foreground">แสดงข้อมูลได้มากต่อหน้าจอ</div>
            </button>
            <button type="button" aria-pressed={textSize === "large"} onClick={() => chooseText("large")} className={optionClass(textSize === "large")}>
              <div className="text-sm font-semibold">อ่านสบาย (ใหญ่ขึ้น)</div>
              <div className="text-xs text-muted-foreground">ตัวอักษรใหญ่ขึ้น แถวตารางโปร่งขึ้น</div>
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">การตั้งค่านี้บันทึกเฉพาะอุปกรณ์นี้ และไม่มีผลกับการพิมพ์เอกสาร</p>
      </CardContent>
    </Card>
  );
}
