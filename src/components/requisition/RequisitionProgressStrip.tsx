/**
 * แถบสถานะออเดอร์/ใบเขียนเบิก — ให้ลูกค้าเห็นว่ากำลังอยู่ขั้นไหน
 * เตรียมออเดอร์ → รออนุมัติ → ส่งสำเร็จ
 * (แสดงผลอย่างเดียว ไม่ยุ่งกับ logic การบันทึก/ส่ง)
 */
import { Check, Clock, Loader2, ShoppingCart } from "lucide-react";

const STEPS = [
  { key: "prepare", label: "เตรียมออเดอร์", hint: "เลือกสินค้าและกรอกข้อมูล", Icon: ShoppingCart },
  { key: "waiting", label: "รออนุมัติ", hint: "ร้านกำลังตรวจสอบและใส่ราคา", Icon: Clock },
  { key: "sent", label: "ส่งสำเร็จ", hint: "ร้านได้รับรายการแล้ว", Icon: Check },
] as const;

export default function RequisitionProgressStrip({
  stage,
  busy = false,
  className = "",
}: {
  /** 0 = เตรียมออเดอร์, 1 = รออนุมัติ, 2 = ส่งสำเร็จ */
  stage: 0 | 1 | 2;
  busy?: boolean;
  className?: string;
}) {
  return (
    <ol
      className={`grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 bg-white ${className}`}
      aria-label="สถานะออเดอร์"
      data-testid="requisition-progress-strip"
    >
      {STEPS.map((s, i) => {
        const active = stage === i;
        const done = stage > i;
        const { Icon } = s;
        return (
          <li
            key={s.key}
            aria-current={active ? "step" : undefined}
            data-state={done ? "done" : active ? "active" : "todo"}
            className={`flex min-w-0 items-center gap-2 px-3 py-2.5 ${
              active ? "bg-blue-50" : done ? "bg-emerald-50/60" : ""
            }`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {active && busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0">
              <span
                className={`block truncate text-xs font-bold sm:text-sm ${
                  done ? "text-emerald-700" : active ? "text-blue-700" : "text-slate-500"
                }`}
              >
                {s.label}
              </span>
              <span className="hidden truncate text-[11px] text-slate-500 sm:block">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
