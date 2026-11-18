import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMotionPref,
  prefersReducedMotionOS,
  setMotionPref,
  type MotionPref,
} from "@/lib/motionPref";

const OPTIONS: { value: MotionPref; label: string; desc: string }[] = [
  { value: "auto", label: "อัตโนมัติ", desc: "ตามการตั้งค่าของอุปกรณ์" },
  { value: "reduced", label: "ลดแอนิเมชัน", desc: "ปิดการเคลื่อนไหว ลดอาการเด้ง/สีเพี้ยน" },
  { value: "full", label: "เต็มรูปแบบ", desc: "เปิดแอนิเมชันทั้งหมด" },
];

/** Per-device animation preference. */
export default function ReducedMotionCard({ className }: { className?: string }) {
  const [pref, setPref] = useState<MotionPref>("auto");
  const [osReduced, setOsReduced] = useState(false);

  useEffect(() => {
    setPref(getMotionPref());
    setOsReduced(prefersReducedMotionOS());
  }, []);

  const choose = (v: MotionPref) => {
    setPref(v);
    setMotionPref(v);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="w-4 h-4" /> การเคลื่อนไหว / แอนิเมชัน
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={pref === o.value}
              onClick={() => choose(o.value)}
              className={cn(
                "rounded-xl border p-3 text-left",
                pref === o.value ? "border-primary bg-primary/10" : "bg-card hover:bg-muted",
              )}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs text-muted-foreground">{o.desc}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {pref === "auto"
            ? osReduced
              ? "อุปกรณ์นี้ตั้งค่าลดการเคลื่อนไหวอยู่ — ระบบกำลังลดแอนิเมชันให้"
              : "อุปกรณ์นี้ยังไม่ได้ตั้งค่าลดการเคลื่อนไหว"
            : "การตั้งค่านี้บันทึกเฉพาะอุปกรณ์นี้"}
        </p>
      </CardContent>
    </Card>
  );
}
