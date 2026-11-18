import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, Eraser, MessageCircle, Phone, Save, Send, X, Loader2, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { fmtDateTime, fmtTHB, ORDER_STATUS_LABEL } from "@/lib/format";
import {
  TEMPLATE_KEYS, TEMPLATE_LABEL, buildOrderReplyText, type TemplateKey,
} from "@/lib/orderReplyText";
import { renderTemplate } from "@/lib/templateRender";
import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any;
  items: any[];
  total: number;
};

type Reply = {
  id: string; message: string; channel: string;
  template_type: string | null; status: string | null;
  error_message: string | null;
  replied_by_name: string | null; created_at: string;
};

const CHANNEL_LABEL: Record<string, string> = {
  copy: "คัดลอก", line: "LINE OA", phone: "โทร", saved: "บันทึก",
};

export default function ReplyCustomerDialog({ open, onOpenChange, order, items, total }: Props) {
  const { user } = useAuth();
  const [templateKey, setTemplateKey] = useState<TemplateKey>("received");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Reply[]>([]);
  const [saving, setSaving] = useState(false);
  const [lineReady, setLineReady] = useState<boolean>(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "copied" | "failed">("idle");
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(true);
  const [defaultMode, setDefaultMode] = useState<"auto" | "line_only" | "copy_only">("auto");
  const [dbTemplates, setDbTemplates] = useState<
    Array<{ id: string; name: string; category: string; content: string }>
  >([]);
  const [dbTemplateId, setDbTemplateId] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const phone = order?.guest_phone || order?.organizations?.phone || "";
  const remark: string = order?.note || order?.remark || (order as any)?.customer_note || "";
  const itemCount = Array.isArray(items) ? items.length : 0;

  function applyTemplate(key: TemplateKey) {
    setTemplateKey(key);
    setDbTemplateId("");
    const text = buildOrderReplyText(order, items, total, key);
    setMessage(text);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(text.length, text.length); }
    });
  }

  function applyDbTemplate(id: string) {
    setDbTemplateId(id);
    const tpl = dbTemplates.find((t) => t.id === id);
    if (!tpl) return;
    const adminName =
      (user?.user_metadata as any)?.full_name || user?.email || undefined;
    const text = renderTemplate(tpl.content, {
      order, items, total, adminName,
    });
    setMessage(text);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(text.length, text.length); }
    });
  }

  async function loadHistory() {
    if (!order?.id) return;
    const { data } = await supabase.from("order_replies" as any)
      .select("id, message, channel, template_type, status, error_message, replied_by_name, created_at")
      .eq("order_id", order.id).order("created_at", { ascending: false });
    setHistory((data ?? []) as any);
  }

  useEffect(() => {
    if (!open) return;
    loadHistory();
    // Pre-fill with the default template so the preview shows real text immediately.
    applyTemplate("received");
    // Load admin-managed DB templates.
    (async () => {
      const { data } = await supabase
        .from("reply_templates" as any)
        .select("id,name,category,content,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setDbTemplates(((data ?? []) as any[]).map((r) => ({
        id: r.id, name: r.name, category: r.category, content: r.content,
      })));
    })();
    // Check whether the order (or its customer) has a LINE binding so we can
    // enable / disable the "Send via LINE" button appropriately.
    (async () => {
      if (!order?.id) return;
      const { data } = await supabase.rpc("order_has_line_user" as any, { p_order_id: order.id });
      setLineReady(Boolean(data));
    })();
    // Read the global LINE OA feature toggle + default reply mode.
    (async () => {
      const { data } = await supabase
        .from("line_oa_settings" as any)
        .select("enabled, default_reply_mode")
        .limit(1)
        .maybeSingle();
      if (data) {
        setFeatureEnabled((data as any).enabled !== false);
        setDefaultMode(((data as any).default_reply_mode as any) || "auto");
      }
    })();
    setSendState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  async function logReply(channel: "copy" | "line" | "phone" | "saved", status: "success" | "failed" = "success", errorText?: string) {
    if (!message.trim()) { toast.error("กรุณาพิมพ์ข้อความก่อน"); return false; }
    setSaving(true);
    const name = (user?.user_metadata as any)?.full_name || user?.email || null;
    const { error: insertError } = await supabase.from("order_replies" as any).insert({
      order_id: order.id, message: message.trim(), channel,
      template_type: dbTemplateId ? "custom" : templateKey,
      template_id: dbTemplateId || null,
      status,
      error_message: errorText ? String(errorText).slice(0, 400) : null,
      replied_by: user?.id, replied_by_name: name,
    });
    setSaving(false);
    if (insertError) { toast.error(insertError.message); return false; }
    loadHistory();
    return true;
  }

  async function handleCopy() {
    if (!message.trim()) { toast.error("กรุณาพิมพ์ข้อความก่อน"); return; }
    setSendState("sending");
    try { await navigator.clipboard.writeText(message); } catch { /* ignore */ }
    const ok = await logReply("copy");
    setSendState(ok ? "copied" : "failed");
    if (ok) toast.success("คัดลอกข้อความแล้ว");
  }
  async function handleSendLine() {
    if (!message.trim()) { toast.error("กรุณาพิมพ์ข้อความก่อน"); return; }
    setSaving(true);
    setSendState("sending");
    // If admin forced copy-only mode, or the customer has no LINE binding,
    // don't even call the edge function — just copy immediately.
    if (defaultMode === "copy_only" || !featureEnabled || !lineReady) {
      try { await navigator.clipboard.writeText(message); } catch { /* ignore */ }
      const reason =
        !featureEnabled ? "LINE OA ปิดใช้งานอยู่"
        : defaultMode === "copy_only" ? "โหมดคัดลอกเท่านั้น"
        : "ลูกค้ายังไม่ผูก LINE";
      await logReply("copy", "failed", reason);
      setSaving(false);
      setSendState("copied");
      toast.warning(`${reason} — คัดลอกข้อความให้แล้ว`);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("reply-send-line", {
        body: {
          order_id: order.id,
          message: message.trim(),
          template_type: dbTemplateId ? "custom" : templateKey,
          template_id: dbTemplateId || null,
        },
      });
      setSaving(false);
      if (error) {
        // Fallback: copy so the staff can paste manually.
        try { await navigator.clipboard.writeText(message); } catch { /* ignore */ }
        await logReply("copy", "failed", error.message);
        setSendState("failed");
        toast.error(`ส่ง LINE ไม่สำเร็จ — คัดลอกข้อความให้แล้ว (${error.message})`);
        return;
      }
      if (data?.ok) {
        setSendState("sent");
        toast.success(data?.message_th || "เข้าคิวส่ง LINE แล้ว");
        loadHistory();
        return;
      }
      // Handled fallbacks (no token / no line user id / API error) — copy + inform.
      try { await navigator.clipboard.writeText(message); } catch { /* ignore */ }
      const reason = data?.reason;
      const messageTh = data?.message_th || "ส่ง LINE ไม่สำเร็จ — คัดลอกข้อความให้แล้ว";
      await logReply("copy", "failed", data?.detail || reason || "unknown");
      setSendState("copied");
      toast.warning(messageTh);
      loadHistory();
    } catch (e: any) {
      setSaving(false);
      try { await navigator.clipboard.writeText(message); } catch { /* ignore */ }
      await logReply("copy", "failed", e?.message);
      setSendState("failed");
      toast.error("เกิดข้อผิดพลาด — คัดลอกข้อความให้แล้ว");
    }
  }
  async function handleCall() {
    if (!phone) { toast.error("ไม่มีเบอร์โทรลูกค้า"); return; }
    if (await logReply("phone")) {
      window.location.href = `tel:${phone.replace(/[^0-9+]/g, "")}`;
    }
  }
  async function handleSave() {
    if (await logReply("saved")) toast.success("บันทึกข้อความแล้ว");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent lang="th" className="max-w-2xl max-h-[90vh] overflow-y-auto font-sans">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" /> ตอบกลับลูกค้า
          </DialogTitle>
        </DialogHeader>

        {/* Order summary */}
        <div className="rounded-xl border border-border bg-accent/30 p-3 text-sm space-y-1">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="font-mono font-semibold text-primary">{order?.order_no}</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{ORDER_STATUS_LABEL[order?.status] ?? order?.status}</Badge>
              {lineReady ? (
                <Badge className="bg-[#06C755] text-white">LINE พร้อมส่ง</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">ยังไม่เชื่อม LINE</Badge>
              )}
            </div>
          </div>
          {order?.created_at && (
            <div className="text-xs text-muted-foreground">วันที่สั่งซื้อ: {fmtDateTime(order.created_at)}</div>
          )}
          <div>ชื่อผู้ติดต่อ: <b>{order?.guest_name || order?.organizations?.contact_name || "-"}</b></div>
          <div>เบอร์โทร: <b>{phone || "-"}</b></div>
          <div>โรงเรียน/หน่วยงาน: <b>{(order as any)?.school_name || order?.organizations?.name || "-"}</b></div>
          {order?.project_name && <div>โครงการ: <b>{order.project_name}</b></div>}
          {itemCount > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">รายการสินค้า ({itemCount} รายการ)</summary>
              <ul className="pl-4 list-disc mt-1 space-y-0.5">
                {items.map((it, i) => (
                  <li key={i}>{it.product_name} × {Number(it.qty)}{it.unit ? ` ${it.unit}` : ""}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="pt-1 flex flex-wrap justify-between gap-2">
            <span>จำนวนรายการ: <b>{itemCount}</b></span>
            <span>ยอดรวม: <b className="text-primary">{fmtTHB(total)}</b></span>
          </div>
          {remark && (
            <div className="mt-2 rounded-md bg-muted/40 border border-border/60 px-2 py-1 text-xs italic text-muted-foreground">
              หมายเหตุจากลูกค้า: {remark}
            </div>
          )}
        </div>

        {/* Template selector */}
        <div>
          <div className="text-sm font-medium mb-2">ประเภทข้อความ</div>
          <Select value={templateKey} onValueChange={(v) => applyTemplate(v as TemplateKey)}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMPLATE_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{TEMPLATE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dbTemplates.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                <span>หรือเลือกจากเทมเพลตแอดมิน ({dbTemplates.length})</span>
                <Link to="/admin/reply-templates" className="text-primary hover:underline inline-flex items-center gap-1">
                  <Settings2 className="w-3 h-3" /> จัดการ
                </Link>
              </div>
              <Select value={dbTemplateId || undefined} onValueChange={applyDbTemplate}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="— เลือกเทมเพลตแอดมิน —" />
                </SelectTrigger>
                <SelectContent>
                  {dbTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Textarea */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center justify-between">
            <span>ข้อความ (แก้ไขได้ก่อนส่ง)</span>
            {message && (
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => setMessage("")}>
                <Eraser className="w-3 h-3 mr-1" /> ล้างข้อความ
              </Button>
            )}
          </div>
          <Textarea
            ref={textareaRef}
            lang="th"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="พิมพ์ข้อความภาษาไทยถึงลูกค้า..."
            rows={12}
            className="rounded-xl font-sans whitespace-pre-wrap"
            style={{ fontFamily: '"Sarabun","Noto Sans Thai",system-ui,sans-serif' }}
          />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button variant="outline" className="rounded-xl" disabled={saving} onClick={handleCopy}>
            {sendState === "sending" ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : sendState === "copied" ? (
              <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4 mr-1" />
            )}
            {sendState === "copied" ? "คัดลอกแล้ว" : "คัดลอก"}
          </Button>
          <Button
            className="rounded-xl bg-[#06C755] hover:bg-[#05b84c] text-white disabled:opacity-60"
            disabled={saving}
            title={
              !featureEnabled ? "LINE OA ปิดใช้งาน — จะคัดลอกให้แทน"
              : defaultMode === "copy_only" ? "โหมดคัดลอกเท่านั้น"
              : lineReady ? "ส่งผ่าน LINE OA"
              : "ลูกค้ายังไม่เชื่อม LINE — จะคัดลอกข้อความให้แทน"
            }
            onClick={handleSendLine}
          >
            {sendState === "sending" ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : sendState === "sent" ? (
              <CheckCircle2 className="w-4 h-4 mr-1" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            {sendState === "sent" ? "ส่งแล้ว" : sendState === "sending" ? "กำลังส่ง..." : "ส่ง LINE"}
          </Button>
          <Button variant="outline" className="rounded-xl" disabled={saving || !phone} onClick={handleCall}>
            <Phone className="w-4 h-4 mr-1" /> โทร
          </Button>
          <Button className="rounded-xl bg-gradient-primary text-primary-foreground" disabled={saving} onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" /> บันทึก
          </Button>
        </div>
        {(!featureEnabled || defaultMode === "copy_only" || !lineReady) && (
          <div className="text-[11px] text-muted-foreground -mt-1">
            {!featureEnabled ? "⚠️ LINE OA ถูกปิดในตั้งค่าระบบ — ปุ่ม “ส่ง LINE” จะทำงานเป็นโหมดคัดลอก"
              : defaultMode === "copy_only" ? "ℹ️ ตั้งค่าเริ่มต้น: โหมดคัดลอกเท่านั้น"
              : "ℹ️ ลูกค้ายังไม่ผูก LINE — ปุ่ม “ส่ง LINE” จะทำงานเป็นโหมดคัดลอก"}
          </div>
        )}

        {/* History */}
        <div>
          <div className="text-sm font-medium mb-2">ประวัติการตอบกลับ ({history.length})</div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border border-border p-2 text-xs">
                  <div className="flex justify-between flex-wrap gap-1 text-muted-foreground">
                    <span className="flex items-center gap-1 flex-wrap">
                      <b className="text-foreground">{h.replied_by_name || "-"}</b>
                      <Badge variant="secondary" className="text-[10px]">{CHANNEL_LABEL[h.channel] || h.channel}</Badge>
                      {h.template_type && (
                        <Badge variant="outline" className="text-[10px]">
                          {TEMPLATE_LABEL[h.template_type as TemplateKey] || h.template_type}
                        </Badge>
                      )}
                      {h.status === "failed" && (
                        <Badge variant="outline" className="text-[10px] border-destructive text-destructive">ล้มเหลว</Badge>
                      )}
                    </span>
                    <span>{fmtDateTime(h.created_at)}</span>
                  </div>
                  {h.status === "failed" && h.error_message && (
                    <div className="text-[11px] text-destructive mt-1">เหตุผล: {h.error_message}</div>
                  )}
                  <p className="whitespace-pre-wrap mt-1">{h.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" /> ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}