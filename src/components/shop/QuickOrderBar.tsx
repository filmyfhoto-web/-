import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { QuickOrderDialog } from "./QuickOrderDialog";

/**
 * Customer-facing quick-action bar shown at the top of /shop.
 * Single entry point that opens a dialog where the customer picks the
 * request type (work order / delivery / quote) and types the details.
 * The message is copied + LINE OA is opened for handoff.
 */
export function QuickOrderBar({ lineUrl }: { lineUrl?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-5 rounded-3xl bg-gradient-to-r from-orange-50 via-white to-orange-50 border border-orange-100 p-3 md:p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="qo-open"
          className="w-full rounded-2xl border border-primary/30 bg-white px-4 py-3 flex items-center justify-center gap-2 text-sm md:text-base font-medium text-primary hover:bg-primary hover:text-primary-foreground transition shadow-sm"
        >
          <MessageSquareText className="w-5 h-5 shrink-0" />
          <span className="text-center leading-snug">
            สร้างใบสั่ง / ขอราคา — กรอกฟอร์มแล้วส่งถึงร้านผ่าน LINE
          </span>
        </button>
      </div>
      {open && (
        <QuickOrderDialog lineUrl={lineUrl ?? null} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export default QuickOrderBar;