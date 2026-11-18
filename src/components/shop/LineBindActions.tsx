import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { extractLineBasicId, normalizeLineUrl, openLine, openLineWithMessage } from "@/lib/line";

interface Props {
  bindPhrase: string;
  shopLineUrl?: string | null;
  /** Unique key so "opened" state persists per phrase across dialog reopens. */
  storageKey: string;
}

/**
 * Shared LINE-bind action block used by CartLineBindDialog and
 * OrderSuccessLineDialog. Renders the copyable phrase, a Copy button, and
 * an "Open LINE + auto-fill" button. Tracks whether the user has already
 * tapped "Open LINE" via sessionStorage so we can flag repeat clicks and
 * avoid the sense of "did it work?".
 */
export default function LineBindActions({ bindPhrase, shopLineUrl, storageKey }: Props) {
  const basicId = extractLineBasicId(shopLineUrl);
  const addFriendUrl = normalizeLineUrl(shopLineUrl || "");
  const skey = `rds_line_bind_opened:${storageKey}`;
  const [opened, setOpened] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    try { setOpened(sessionStorage.getItem(skey) === "1"); } catch { /* ignore */ }
  }, [skey]);

  async function copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to legacy path */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  async function handleCopy() {
    if (!bindPhrase) return;
    const ok = await copyToClipboard(bindPhrase);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("คัดลอกข้อความแล้ว", {
        description: "วางในแชท LINE ของร้าน แล้วกดส่ง",
        icon: <Check className="w-4 h-4" />,
      });
    } else {
      toast.error("คัดลอกไม่สำเร็จ", {
        description: "กรุณากดที่ข้อความแล้วคัดลอกด้วยตนเอง",
      });
    }
  }

  function markOpened() {
    try { sessionStorage.setItem(skey, "1"); } catch { /* ignore */ }
    setOpened(true);
  }

  async function handleOpenLine() {
    // Always copy to clipboard first — many LINE deep links open the chat
    // but do NOT pre-fill the text field on older devices.
    await copyToClipboard(bindPhrase);
    if (basicId && bindPhrase) {
      openLineWithMessage(shopLineUrl || "", bindPhrase);
    } else if (addFriendUrl) {
      openLine(shopLineUrl);
    } else {
      toast.error("ไม่พบลิงก์ LINE ของร้าน");
      return;
    }
    markOpened();
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
      <div className="text-[11px] text-muted-foreground">
        ข้อความสำหรับส่งในแชท LINE ของร้าน:
      </div>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border text-sm font-mono truncate select-all"
          onClick={() => {
            const sel = window.getSelection();
            const range = document.createRange();
            const el = document.getElementById(`bind-phrase-${storageKey}`);
            if (el) { range.selectNodeContents(el); sel?.removeAllRanges(); sel?.addRange(range); }
          }}
          id={`bind-phrase-${storageKey}`}
        >
          {bindPhrase}
        </code>
      </div>

      {addFriendUrl && (
        <Button
          onClick={handleOpenLine}
          size="lg"
          className={`w-full rounded-xl font-semibold text-white ${opened ? "bg-[#04a548]" : "bg-[#06C755] hover:bg-[#05b84c]"}`}
        >
          {opened ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              เปิด LINE แล้ว — เปิดอีกครั้ง
            </>
          ) : (
            <>
              <MessageCircle className="w-4 h-4 mr-2" />
              {basicId ? "เปิด LINE ผูกอัตโนมัติ" : "เปิด LINE + คัดลอกข้อความ"}
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-80" />
            </>
          )}
        </Button>
      )}

      <Button
        onClick={handleCopy}
        size="lg"
        variant="outline"
        className="w-full rounded-xl font-semibold"
      >
        {copied ? (
          <><Check className="w-4 h-4 mr-2 text-[#06C755]" /> คัดลอกแล้ว</>
        ) : (
          <><Copy className="w-4 h-4 mr-2" /> คัดลอกข้อความ</>
        )}
      </Button>

      {opened && (
        <div className="text-[11px] text-center text-muted-foreground">
          หากยังไม่ได้ส่ง ให้เปิดแชท LINE ของร้าน แล้ววางข้อความที่คัดลอกไว้ กดส่ง เพื่อให้ระบบผูก LINE ให้อัตโนมัติ
        </div>
      )}
    </div>
  );
}