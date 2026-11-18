/**
 * การ์ด "ดูเหมือนเป็นรายการสั่งของ" — ข้อความแชท LINE ที่ระบบเดาว่าเป็นออเดอร์
 * กด "สร้างงานจากข้อความนี้" เพื่อเปิดกล่องรับงานใหม่พร้อมรายการที่อ่านได้
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtWhen, type ChatOrderHint } from "@/lib/workDocs";

export default function ChatOrderHints({
  hints,
  onCreate,
  onDismiss,
}: {
  hints: ChatOrderHint[];
  onCreate: (h: ChatOrderHint) => void;
  onDismiss: (h: ChatOrderHint) => void;
}) {
  const [openId, setOpenId] = useState("");
  if (!hints.length) return null;

  return (
    <div className="mb-3 space-y-2" data-testid="chat-order-hints">
      {hints.map((h) => {
        const open = openId === h.messageId;
        return (
          <div
            key={h.messageId}
            className="ng-card py-3"
            data-testid="chat-order-hint"
            style={{ borderLeft: "4px solid hsl(var(--ng-orange))" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>
                  <MessageSquareText className="h-4 w-4" style={{ color: "hsl(var(--ng-orange-deep))" }} />
                  ดูเหมือนเป็นรายการสั่งของ — ตรวจพบ {h.itemCount} รายการ
                </p>
                <p className="mt-0.5 text-sm" style={{ color: "hsl(var(--ng-muted))" }}>
                  จาก {h.customerName} · {fmtWhen(h.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-9" data-testid="chat-hint-create" onClick={() => onCreate(h)}>
                  สร้างงานจากข้อความนี้
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  data-testid="chat-hint-dismiss"
                  onClick={() => onDismiss(h)}
                >
                  <X className="mr-1 h-4 w-4" /> ข้าม
                </Button>
              </div>
            </div>

            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold underline"
              onClick={() => setOpenId(open ? "" : h.messageId)}
              data-testid="chat-hint-toggle"
            >
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {open ? "ซ่อนข้อความ" : "ดูข้อความเต็ม"}
            </button>

            {open && (
              <div className="mt-2 space-y-2">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-2 text-sm">
                  {h.text}
                </pre>
                <ul className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>
                  {h.items.map((it, i) => (
                    <li key={`${h.messageId}-${i}`}>
                      {i + 1}. {it.name} — {it.qty} {it.unit || "ชิ้น"}
                      {it.hasQty ? "" : " (ไม่พบจำนวน)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
