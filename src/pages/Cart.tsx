import CustomerLayout from "@/components/layout/CustomerLayout";
import { useCart } from "@/contexts/CartContext";
import { useGuest, newGuestId } from "@/contexts/GuestContext";
import { readIdToken, readBinding } from "@/lib/lineSession";
import { useLineCustomer } from "@/contexts/LineCustomerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Minus, Plus, Package, ShoppingCart, ShieldCheck, FileText, ArrowLeft, AlertCircle, Store, Paperclip, SlidersHorizontal, BadgePercent, Zap, CalendarDays } from "lucide-react";
import { fmtTHB } from "@/lib/format";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import SeoHead from "@/components/SeoHead";
import { CustomerBreadcrumbs, customerNavyButtonClass } from "@/components/layout/CustomerBreadcrumbs";
import { friendlyError } from "@/lib/errors";
import LineOrderGate, { useOrderGate } from "@/components/customer/LineOrderGate";
import { refreshLineBinding } from "@/hooks/useLineBindingState";

import { readCheckoutDraft, writeCheckoutDraft, clearCheckoutDraft } from "@/lib/checkoutDraft";
import { resolveCheckoutIdentity, isValidThaiPhone } from "@/lib/checkoutIdentity";
import { mapLineOrderError } from "@/lib/lineOrderErrors";
import { saveOrderLinkToken } from "@/lib/orderLinkTokens";
import {
  groupItems, readJobOptions, writeJobOptions, describeOptions, validateAttachment,
  type JobOptions, type AttachmentStatus,
} from "@/lib/cartGroups";
import { applyCoupon, SHOP_COUPONS } from "@/lib/customerPerks";
import { rememberOrderedProductIds } from "@/lib/recentOrders";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Cart() {
  const { items, setQty, remove, clear, note, setNote } = useCart();
  const { session, setSession } = useGuest();
  // Server-verified LINE profile (populated by RequireLineLink). Its
  // presence means the gate already confirmed this visitor's binding, so
  // the cart must not ask them to link again.
  const { profile: lineProfile } = useLineCustomer();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /**
   * ตอนจบตะกร้ามี 2 ทางเท่านั้น (ไม่ต้องกรอกอะไรเพิ่ม)
   *   order = สั่งซื้อเลย · quote = ขอใบราคา / ทำใบเบิกไปก่อน (ยังไม่ผูกมัด)
   * เก็บใน ref ด้วยเพื่อให้ callback ที่ค้างอยู่ (LINE gate) ใช้ค่าที่ถูกต้อง
   */
  const [docIntent, setDocIntent] = useState<"order" | "quote">("order");
  const docIntentRef = useRef<"order" | "quote">("order");
  useEffect(() => {
    if (searchParams.get("intent") === "quote") {
      setDocIntent("quote");
      docIntentRef.current = "quote";
    }
  }, [searchParams]);

  // LINE OA gate — ไม่บังคับตอนสั่งซื้อแล้ว (สั่งแบบไม่ผูก LINE ได้)
  // เปิดเฉพาะกรณีเซิร์ฟเวอร์ตอบว่าต้องผูก/เพิ่มเพื่อนก่อนเท่านั้น
  const [gateOpen, setGateOpen] = useState(false);
  const gate = useOrderGate();

  // ตรวจการผูก LINE ครั้งเดียวตอนเปิดตะกร้า (ใช้แคชร่วมกันทั้งแอป)
  // เพื่อให้ลูกค้าที่เคยเชื่อมแล้วเห็นชื่อตัวเองทันที ไม่ต้องเชื่อมใหม่
  useEffect(() => { void refreshLineBinding(); }, []);

  // Stable idempotency key per cart session — regenerated after a
  // successful submit so the next order gets its own key. Prevents any
  // retry/double-click from creating duplicate orders server-side.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => {
    try { return crypto.randomUUID().replace(/-/g, ""); } catch { return String(Date.now()) + Math.random().toString(36).slice(2); }
  });
  // ตัวตนลูกค้า: ดึงจากบัญชี LINE ที่ผูกไว้ — ไม่ต้องพิมพ์ซ้ำในหน้าสั่งซื้อ
  // (สถานะการผูกจากเซิร์ฟเวอร์อยู่ได้ข้ามแท็บ/ข้ามเครื่อง จึงใช้ก่อน
  //  ค่าใน sessionStorage ที่หายเมื่อปิดแท็บ)
  const liveBinding = gate.binding;
  const identity = useMemo(
    () => resolveCheckoutIdentity({
      lineProfile: lineProfile ?? (liveBinding.lineUserId ? {
        line_user_id: liveBinding.lineUserId,
        display_name: liveBinding.displayName,
        customer_name: liveBinding.customerName,
        phone: liveBinding.phone,
      } : null),
      binding: readBinding(),
      session,
    }),
    [lineProfile, liveBinding.lineUserId, liveBinding.displayName, liveBinding.customerName, liveBinding.phone, session],
  );

  // ช่องกรอกเฉพาะที่ระบบยังไม่มีข้อมูล (fallback เท่านั้น)
  const [nameInput, setNameInput] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState<string>("");
  const name = identity.missing.includes("name") ? nameInput : identity.name;
  const phone = identity.missing.includes("phone") ? phoneInput : identity.phone;
  const setName = setNameInput;
  const setPhone = setPhoneInput;
  const project = "";
  const [school, setSchool] = useState<string>(session?.org_name || "");
  const [address, setAddress] = useState<string>("");
  const [taxId, setTaxId] = useState<string>("");
  const [taxBranch, setTaxBranch] = useState<string>("");
  const [showErr, setShowErr] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Selection model (Shopee-style): every line starts selected; only the
  // selected lines are priced and submitted.
  const [unselected, setUnselected] = useState<Record<string, true>>({});
  // ตัวเลือกงานต่อรายการ (ขนาด/กระดาษ/สี/ด้าน) — เก็บต่อเนื่องใน localStorage
  const [jobOptions, setJobOptions] = useState<Record<string, JobOptions>>(() => readJobOptions());
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, { status: AttachmentStatus; message: string }>>({});
  // การรับสินค้า
  const [pickupMethod, setPickupMethod] = useState<"pickup" | "delivery">("pickup");
  const [wantDate, setWantDate] = useState<string>("");
  const [rush, setRush] = useState(false);
  // คูปองส่วนลด
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  useEffect(() => { writeJobOptions(jobOptions); }, [jobOptions]);

  function setOption(id: string, patch: Partial<JobOptions>) {
    setJobOptions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }
  function pickAttachment(id: string, file: File | null) {
    if (!file) { setAttachments((p) => ({ ...p, [id]: { status: "none", message: "ยังไม่แนบไฟล์" } })); return; }
    setAttachments((p) => ({ ...p, [id]: validateAttachment(file) }));
  }
  const selectedItems = useMemo(
    () => items.filter((it) => !unselected[it.product_id]),
    [items, unselected],
  );
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  function toggleItem(id: string, on: boolean) {
    setUnselected((prev) => {
      const next = { ...prev };
      if (on) delete next[id]; else next[id] = true;
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setUnselected(on ? {} : Object.fromEntries(items.map((it) => [it.product_id, true as const])));
  }

  // Prefill tax id / branch from onboarding snapshot (RequireLineLink).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("guest_customer_snapshot");
      const obj = raw ? JSON.parse(raw) : null;
      if (obj?.tax_id) setTaxId(String(obj.tax_id));
      if (obj?.tax_branch) setTaxBranch(String(obj.tax_branch));
    } catch { /* ignore */ }
  }, []);

  // คืนค่าฟอร์มที่กรอกค้างไว้ — ผู้ใช้ที่ออกไปเพิ่มเพื่อน LINE แล้วกลับมา
  // ต้องไม่ต้องกรอกใหม่
  useEffect(() => {
    const d = readCheckoutDraft();
    if (!d) return;
    setNameInput((v) => v || d.name || "");
    setPhoneInput((v) => v || d.phone || "");
    setSchool((v) => v || d.school || "");
    setAddress((v) => v || (d as any).address || "");
    setTaxId((v) => v || d.taxId || "");
    setTaxBranch((v) => v || d.taxBranch || "");
  }, []);

  useEffect(() => {
    writeCheckoutDraft({ name, phone, project, school, taxId, taxBranch, address } as any);
  }, [name, phone, project, school, taxId, taxBranch, address]);

  // Snapshot pricing: totals are computed from the price captured when each
  // line was added to the cart, so what the guest sees in the confirm dialog
  // is exactly what gets persisted with the order and rendered later in
  // MyOrderDetail.
  const subtotal = useMemo(
    () => selectedItems.reduce((s, it) => s + (Number(it.price ?? 0) * Number(it.qty)), 0),
    [selectedItems],
  );
  const couponDiscount = couponApplied?.discount ?? 0;
  const grandTotal = Math.max(0, subtotal - couponDiscount);
  // แสดงทุกรายการในตะกร้าเสมอ (รวมรายการที่ติ๊กออก) เพื่อให้ติ๊กกลับ/แก้ไขได้
  // ส่วนยอดรวมและรายการที่ส่งจริงใช้ selectedItems เท่านั้น
  const groups = useMemo(() => groupItems(items), [items]);



  // คูปองจะถูกตรวจเงื่อนไขใหม่ทุกครั้งที่ยอดเปลี่ยน
  useEffect(() => {
    if (!couponApplied) return;
    const r = applyCoupon(couponApplied.code, subtotal);
    if (!r.ok) { setCouponApplied(null); setCouponMsg(r.message); }
    else if (r.discount !== couponApplied.discount) setCouponApplied({ code: couponApplied.code, discount: r.discount });
  }, [subtotal, couponApplied]);

  /** สรุปรายละเอียดงานเพื่อแนบไปกับหมายเหตุถึงร้าน */
  function buildJobSummary(): string {
    const lines: string[] = [];
    for (const it of selectedItems) {
      const d = describeOptions(jobOptions[it.product_id]);
      const att = attachments[it.product_id];
      const bits = [d, att?.status === "ready" ? att.message : att?.status === "error" ? "ไฟล์มีปัญหา" : "ยังไม่แนบไฟล์"].filter(Boolean);
      if (bits.length) lines.push(`- ${it.name}: ${bits.join(" · ")}`);
    }
    if (address.trim()) lines.push(`ที่อยู่: ${address.trim()}`);
    lines.push(`วิธีรับสินค้า: ${pickupMethod === "pickup" ? "รับหน้าร้าน" : "จัดส่ง"}`);
    if (wantDate) lines.push(`วันที่ต้องการรับ: ${wantDate}`);
    if (rush) lines.push("ต้องการงานด่วน");
    if (couponApplied) lines.push(`คูปอง ${couponApplied.code} (-${couponApplied.discount} บาท)`);
    return lines.join("\n");
  }

  const errors = useMemo(() => {
    const e: { name?: string; phone?: string; school?: string; address?: string } = {};
    if (name.trim().length < 2) e.name = "กรุณากรอกชื่อผู้สั่ง (อย่างน้อย 2 ตัวอักษร)";
    if (!isValidThaiPhone(phone)) e.phone = "เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)";
    if (school.trim().length < 2) e.school = "กรุณากรอกหน่วยงาน / โรงเรียน";
    // ที่อยู่บังคับเฉพาะกรณีเลือก "จัดส่ง" — ลูกค้าที่รับหน้าร้านไม่ต้องกรอก
    if (pickupMethod === "delivery" && address.trim().length < 5) e.address = "กรุณากรอกที่อยู่สำหรับจัดส่ง";
    return e;
  }, [name, phone, school, address, pickupMethod]);


  const isValid = Object.keys(errors).length === 0;

  async function doSubmit(intent: "order" | "quote" = docIntentRef.current) {
    if (!selectedItems.length) return;

    setSubmitError(null);
    if (!isValid) {
      setShowErr(true);
      const message = "กรุณากรอกข้อมูลผู้สั่งซื้อในช่องที่มีข้อความสีแดงให้ครบ";
      setSubmitError(message);
      toast.error(message);
      // รอให้ React วาดกรอบสีแดงก่อน แล้วค่อยเลื่อนไป + โฟกัสช่องแรกที่ผิด
      window.setTimeout(() => {
        const field = document.querySelector<HTMLElement>('[data-cart-field-error="true"]');
        if (typeof field?.scrollIntoView === "function") field.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof field?.focus === "function") field.focus({ preventScroll: true } as any);
      }, 120);

      return;
    }
    // ไม่บังคับล็อกอิน/ผูก LINE ก่อนสั่งซื้อ — ลูกค้าที่ทักมาทาง LINE OA
    // และแอดมินเชื่อมให้แล้ว สั่งได้เลยด้วยชื่อ+เบอร์ (ยังไงก็ต้องเสนอราคาก่อน)
    // ถ้ามีหลักฐานตัวตน LINE อยู่แล้วก็แนบไปด้วยเพื่อผูกออเดอร์เข้ากับบัญชี
    const id_token = readIdToken();

    // Resolve guest_id synchronously so first-time visitors can submit immediately.
    let gid = session?.guest_id;
    if (!gid) {
      try {
        const raw = localStorage.getItem("guest_session_v1");
        if (raw) gid = JSON.parse(raw)?.guest_id;
      } catch { /* ignore */ }
    }
    if (!gid) gid = newGuestId();
    // persist to session for next time (setSession preserves existing guest_id, or seeds a new one)
    setSession({ guest_id: gid, name: name.trim(), phone: phone.trim(), org_name: school.trim() || null } as any);
    setSubmitting(true);
    try {
      const cleanTaxId = taxId.replace(/\D+/g, "");
      const cleanBranch = taxBranch.trim().slice(0, 40);
      const { data, error } = await supabase.functions.invoke("guest-order-submit", {
        body: {
          guest_id: gid,
          id_token: id_token || undefined,
          idempotency_key: idempotencyKey,
          doc_intent: intent,

          name: name.trim(),
          phone: phone.trim(),
          project: null,
          school_name: school.trim() || null,
          address: address.trim() || null,
          org_slug: session?.org_slug ?? null,
          note: [note, buildJobSummary()].filter(Boolean).join("\n"),
          customer_tax_id: cleanTaxId || null,
          customer_branch: cleanBranch || null,
          coupon_code: couponApplied?.code ?? null,
          coupon_discount: couponApplied?.discount ?? 0,
          customer_snapshot: {
            name: name.trim(),
            phone: phone.trim(),
            project: null,
            school: school.trim() || null,
            address: address.trim() || null,
            tax_id: cleanTaxId || null,
            tax_branch: cleanBranch || null,
            note: note || null,
            guest_id: gid,
            idempotency_key: idempotencyKey,
            doc_intent: intent,

            pickup_method: pickupMethod,
            want_date: wantDate || null,
            rush,
            coupon_code: couponApplied?.code ?? null,
            coupon_discount: couponApplied?.discount ?? 0,
            estimated_total: grandTotal,
            captured_at: new Date().toISOString(),
          },

          items: selectedItems.map((it) => ({
            product_id: it.product_id,
            name: it.name,
            code: it.code,
            unit: it.unit,
            qty: it.qty,
            price: it.price != null ? Number(it.price) : 0,
          })),
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.error === "too_many_requests" || res?.error === "rate_limited") {
        const message = res?.detail || "ส่งคำสั่งซื้อบ่อยเกินไป กรุณารอสักครู่";
        setSubmitError(message);
        toast.error(message);
        return;
      }
      const blocked = mapLineOrderError(res?.error, res?.detail);
      if (blocked && (blocked.action === "add_friend" || blocked.action === "recheck" || blocked.action === "contact_shop")) {
        // ตะกร้า/ร่างข้อมูลถูกเก็บไว้เสมอ (ไม่เคลียร์เมื่อถูกบล็อก)
        setSubmitError(blocked.message);
        toast.error(blocked.message);
        if (blocked.openGate) setGateOpen(true);
        return;
      }
      if (res?.error === "line_required") {
        const message = res?.detail || "กรุณาเข้าสู่ระบบด้วย LINE ก่อนสั่งซื้อ";
        setSubmitError(message);
        toast.error(message);
        setGateOpen(true);
        return;
      }
      if (res?.error === "line_binding_required") {
        const message = res?.detail || "กรุณาเพิ่มเพื่อนและผูก LINE กับร้านก่อนสั่งซื้อ";
        setSubmitError(message);
        toast.error(message);
        setGateOpen(true);
        return;
      }
      if (res?.error === "missing_idempotency_key") {
        const message = "กรุณารีเฟรชหน้าแล้วลองใหม่";
        setSubmitError(message);
        toast.error(message);
        return;
      }
      if (!res?.ok || !res?.order_id) throw new Error(res?.error || "submit_failed");
      try {
        if (res.line_link_token) {
          saveOrderLinkToken(res.order_id, res.line_link_token);
        }
      } catch { /* ignore */ }
      // Remove only the lines that were actually ordered; keep unselected ones in the cart
      if (selectedItems.length === items.length) {
        clear();
      } else {
        for (const it of selectedItems) remove(it.product_id);
        setUnselected({});
      }
      try {
        rememberOrderedProductIds(selectedItems.map((it) => it.product_id));
      } catch { /* ignore */ }
      try { setIdempotencyKey(crypto.randomUUID().replace(/-/g, "")); } catch { /* ignore */ }
      try { clearCheckoutDraft(); } catch { /* ignore */ }
      toast.success(intent === "quote"
        ? "ส่งคำขอใบราคาแล้ว! ทางร้านจะทำใบเสนอราคาส่งกลับ (ยังไม่ผูกมัด)"
        : "ส่งคำสั่งซื้อสำเร็จ! รอทางร้านเสนอราคา");
      const t = res.line_link_token ? `?t=${encodeURIComponent(res.line_link_token)}` : "";
      nav(`/my-orders/${res.order_id}${t}`);
    } catch (err: any) {
      // Try to surface rate-limit message returned as non-2xx
      try {
        const ctx = err?.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error === "too_many_requests" || body?.error === "rate_limited") {
            const message = body?.detail || "ส่งคำสั่งซื้อบ่อยเกินไป กรุณารอสักครู่";
            setSubmitError(message);
            toast.error(message);
            return;
          }
          const blockedBody = mapLineOrderError(body?.error, body?.detail);
          if (blockedBody && (blockedBody.action === "add_friend" || blockedBody.action === "recheck" || blockedBody.action === "contact_shop")) {
            setSubmitError(blockedBody.message);
            toast.error(blockedBody.message);
            if (blockedBody.openGate) setGateOpen(true);
            return;
          }
          if (body?.error === "line_required") {
            const message = body?.detail || "กรุณาเข้าสู่ระบบด้วย LINE ก่อนสั่งซื้อ";
            setSubmitError(message);
            toast.error(message);
            setGateOpen(true);
            return;
          }
          if (body?.error === "line_binding_required") {
            const message = body?.detail || "กรุณาเพิ่มเพื่อนและผูก LINE กับร้านก่อนสั่งซื้อ";
            setSubmitError(message);
            toast.error(message);
            setGateOpen(true);
            return;
          }
          if (body?.error === "missing_idempotency_key") {
            const message = "กรุณารีเฟรชหน้าแล้วลองใหม่";
            setSubmitError(message);
            toast.error(message);
            return;
          }
        }
      } catch { /* ignore */ }
      const message = friendlyError(err, "ส่งคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่");
      setSubmitError(message);
      toast.error(message);
    } finally { setSubmitting(false); }
  }

  function submit(intent: "order" | "quote" = "order") {
    docIntentRef.current = intent;
    setDocIntent(intent);
    if (!items.length) return;

    if (!selectedItems.length) {
      const message = "กรุณาเลือกสินค้าอย่างน้อย 1 รายการก่อนสั่งซื้อ";
      setSubmitError(message);
      toast.error(message);
      return;
    }
    if (!isValid) {
      setShowErr(true);
      const message = "กรุณากรอกข้อมูลผู้สั่งซื้อในช่องที่มีข้อความสีแดงให้ครบ";
      setSubmitError(message);
      toast.error(message);
      window.setTimeout(() => {
        const field = document.querySelector<HTMLElement>('[data-cart-field-error="true"]');
        if (typeof field?.scrollIntoView === "function") field.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof field?.focus === "function") field.focus({ preventScroll: true } as any);
      }, 120);

      return;
    }
    setSubmitError(null);
    setConfirmOpen(true);
  }

  return (
    <CustomerLayout>
      <LineOrderGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        onPassed={() => { void doSubmit(); }}
        returnTo="/cart"
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> ตรวจสอบก่อนสั่ง
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-border p-3 bg-accent/30" data-testid="cart-review-identity">
                  <div className="text-xs font-semibold text-foreground mb-1">
                    {identity.linked ? "เชื่อมต่อบัญชี LINE แล้ว ✓" : "ผู้สั่งซื้อ"}
                  </div>
                  <div className="text-foreground">{name || "-"} · {phone || "-"}</div>
                  <div className="text-muted-foreground text-xs">หน่วยงาน / โรงเรียน: {school || "-"}</div>
                  <div className="text-muted-foreground text-xs" data-testid="cart-review-address">ที่อยู่: {address || "-"}</div>
                </div>
                <div className="rounded-xl border border-border p-3 max-h-48 overflow-auto">
                  <div className="text-xs font-semibold text-foreground mb-1">รายการสินค้า ({selectedItems.length})</div>
                  <ul className="text-xs space-y-1">
                    {selectedItems.map((it) => (
                      <li key={it.product_id} className="flex justify-between gap-2">
                        <span className="truncate">{it.name}</span>
                        <span className="text-muted-foreground shrink-0">× {it.qty} {it.unit || ""}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-bold">
                    <span>ยอดรวม</span>
                    <span className="tabular-nums text-primary" data-testid="cart-review-total">{fmtTHB(grandTotal)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-foreground">
                    ข้อมูลของคุณ (ชื่อ · เบอร์ · หน่วยงาน · ที่อยู่) จะถูกใช้เพื่อ<strong>ติดต่อกลับและออกเอกสาร</strong>เท่านั้น
                    หลังส่งรายการสำเร็จ ทางร้านจะจัดทำใบเสนอราคาและติดต่อกลับตามช่องทางที่ให้ไว้
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>กลับไปแก้ไข</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-submit-order"
              onClick={(e) => {
                e.preventDefault();
                setConfirmOpen(false);
                doSubmit(docIntentRef.current);

              }}
            >
              {docIntent === "quote" ? "ยืนยันขอใบราคา" : "ยืนยันสั่งซื้อ"}
            </AlertDialogAction>

          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SeoHead
        title="ตะกร้าสินค้า — ร้านนัฐภรณ์ เชียงกลาง"
        description="ตรวจสอบรายการสินค้าในตะกร้าและส่งคำสั่งซื้อให้ร้านนัฐภรณ์ เชียงกลาง"
        path="/cart"
      />
      <CustomerBreadcrumbs current="cart" />
      <div className="mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => nav("/shop")}
          className={customerNavyButtonClass}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> กลับไปหน้าแรก
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => nav("/my-orders")}
          data-testid="cart-track-orders"
          className={`${customerNavyButtonClass} ml-2`}
        >
          <FileText className="w-4 h-4 mr-1" /> ดูสถานะออเดอร์
        </Button>
      </div>
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <ShoppingCart className="w-6 h-6 text-primary" /> ตะกร้าสินค้า
        <span className="text-base font-normal text-muted-foreground">({items.length})</span>
      </h1>
      {(() => {
        const b = readBinding();
        if (!b?.line_user_id) return null;
        const nm = b.customer_name || "ผู้ใช้ LINE";
        return (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#06C755]/40 bg-[#06C755]/10 px-3 py-1 text-xs text-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-[#06C755]" />
            สั่งในนาม LINE: <strong className="font-semibold">{nm}</strong>
          </div>
        );
      })()}
      {items.length === 0 ? (
        <div className="bg-card rounded-2xl p-12 text-center border border-border">
          <Package className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground mb-4">ยังไม่มีสินค้าในตะกร้า</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => nav("/shop")} className="rounded-xl bg-gradient-primary text-primary-foreground">ไปหน้าแรก</Button>
            <Button variant="outline" onClick={() => nav("/my-orders")} className="rounded-xl">ดูสถานะออเดอร์ของฉัน</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3 pb-28 md:pb-0">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-card">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => toggleAll(v === true)}
                aria-label="เลือกรายการทั้งหมด"
                data-testid="cart-select-all-top"
                className="min-h-5 min-w-5"
              />
              <Store className="w-4 h-4 text-primary" aria-hidden />
              <span className="text-sm font-semibold">ร้านนัฐภรณ์ เชียงกลาง</span>
            </div>
            {groups.map((g) => (
              <div key={g.key} className="space-y-2" data-testid={`cart-group-${g.key}`}>
                <div className="flex items-center gap-2 px-1 pt-1">
                  <Store className="w-3.5 h-3.5 text-primary" aria-hidden />
                  <span className="text-xs font-semibold text-primary">{g.label}</span>
                  <span className="text-[11px] text-muted-foreground">({g.items.length} รายการ)</span>
                </div>
            {g.items.map(it => {
              const opt = jobOptions[it.product_id];
              const optText = describeOptions(opt);
              const att = attachments[it.product_id];
              const attStatus: AttachmentStatus = att?.status ?? "none";
              return (
              <div
                key={it.product_id}
                data-testid="cart-line"
                style={{ contentVisibility: "auto", containIntrinsicSize: "140px" } as any}
                className="bg-card rounded-2xl p-3 border border-border flex flex-wrap items-center gap-3 shadow-card"
              >
                <Checkbox
                  checked={!unselected[it.product_id]}
                  onCheckedChange={(v) => toggleItem(it.product_id, v === true)}
                  aria-label={`เลือก ${it.name}`}
                  data-testid={`cart-select-${it.product_id}`}
                  className="min-h-5 min-w-5 shrink-0"
                />
                <div className="w-16 h-16 rounded-xl bg-accent/40 grid place-items-center overflow-hidden shrink-0">
                  {it.image_url ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" /> : <Package className="w-7 h-7 text-primary/40" />}
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className="text-[11px] text-muted-foreground">{it.code}</div>
                  <div className="font-medium text-sm truncate">{it.name}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span>{it.unit}</span>
                    <span data-testid="cart-line-price">
                      {it.price != null && Number(it.price) > 0 ? fmtTHB(Number(it.price)) : "รอเสนอราคา"}
                    </span>
                    {it.price != null && Number(it.price) > 0 && (
                      <span className="text-foreground font-medium" data-testid="cart-line-total">
                        รวม {fmtTHB(Number(it.price) * it.qty)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground truncate" data-testid="cart-line-options">
                    {optText || "ยังไม่ได้ระบุตัวเลือกงาน"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 min-h-9 rounded-lg text-xs"
                      data-testid={`cart-edit-options-${it.product_id}`}
                      onClick={() => setOptionsFor(optionsFor === it.product_id ? null : it.product_id)}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 mr-1" /> แก้ไขตัวเลือก
                    </Button>
                    <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 border ${
                          attStatus === "ready"
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : attStatus === "error"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-border text-muted-foreground"
                        }`}
                        data-testid={`cart-attach-status-${it.product_id}`}
                      >
                        <Paperclip className="w-3.5 h-3.5" aria-hidden />
                        {attStatus === "ready" ? "แนบชื่อไฟล์แล้ว" : attStatus === "error" ? "ไฟล์มีปัญหา" : "ยังไม่แนบไฟล์"}
                      </span>
                      <input
                        type="file"
                        className="sr-only"
                        aria-label={`แนบไฟล์สำหรับ ${it.name}`}
                        onChange={(e) => pickAttachment(it.product_id, e.target.files?.[0] ?? null)}
                      />
                      <span className="underline text-primary">{attStatus === "none" ? "แนบไฟล์" : "เปลี่ยนไฟล์"}</span>
                    </label>
                  </div>
                  {att?.message && attStatus !== "none" && (
                    <div className={`mt-1 text-[11px] ${attStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>{att.message}</div>
                  )}
                  {optionsFor === it.product_id && (
                    <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-border bg-accent/30 p-2" data-testid="cart-options-editor">
                      <Input value={opt?.size ?? ""} onChange={(e) => setOption(it.product_id, { size: e.target.value })} placeholder="ขนาด เช่น A4" className="rounded-lg h-10 text-xs" aria-label="ขนาด" />
                      <Input value={opt?.paper ?? ""} onChange={(e) => setOption(it.product_id, { paper: e.target.value })} placeholder="กระดาษ/วัสดุ" className="rounded-lg h-10 text-xs" aria-label="กระดาษหรือวัสดุ" />
                      <Input value={opt?.color ?? ""} onChange={(e) => setOption(it.product_id, { color: e.target.value })} placeholder="สี เช่น สี่สี" className="rounded-lg h-10 text-xs" aria-label="สี" />
                      <div className="inline-flex rounded-lg border border-border overflow-hidden">
                        {(["single", "double"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={opt?.sides === s}
                            onClick={() => setOption(it.product_id, { sides: s })}
                            className={`flex-1 min-h-10 text-xs px-2 ${opt?.sides === s ? "bg-primary text-primary-foreground" : "bg-card"}`}
                          >
                            {s === "single" ? "ด้านเดียว" : "สองด้าน"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" aria-label="ลดจำนวน" className="w-8 h-8 rounded-lg" onClick={() => setQty(it.product_id, it.qty - 1)}><Minus className="w-3 h-3" /></Button>
                  <Input type="number" value={it.qty} onChange={(e) => setQty(it.product_id, Number(e.target.value) || 1)} className="w-14 text-center rounded-lg h-8" />
                  <Button size="icon" variant="outline" aria-label="เพิ่มจำนวน" className="w-8 h-8 rounded-lg" onClick={() => setQty(it.product_id, it.qty + 1)}><Plus className="w-3 h-3" /></Button>
                </div>
                <Button size="icon" variant="ghost" aria-label="ลบสินค้าออกจากตะกร้า" className="text-destructive" onClick={() => remove(it.product_id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
              );
            })}
              </div>
            ))}
          </div>
          <div className="bg-card rounded-2xl p-5 border border-border shadow-card h-fit space-y-4 sticky top-20">
            <div>
              <div className="text-sm text-muted-foreground">จำนวนรายการ</div>
              <div className="text-2xl font-bold">{items.length} รายการ</div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">ยอดรวมประมาณการ</span>
                <span
                  className="text-xl font-bold text-primary"
                  data-testid="cart-grand-total"
                >{fmtTHB(grandTotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  <div className="flex justify-between"><span>ยอดก่อนส่วนลด</span><span>{fmtTHB(subtotal)}</span></div>
                  <div className="flex justify-between text-primary"><span>ส่วนลดคูปอง</span><span>-{fmtTHB(couponDiscount)}</span></div>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                (คำนวณจากราคาหน้าร้านกลาง · ราคาจริงยืนยันโดยร้านในใบเสนอราคา)
              </div>
            </div>

            {/* วิธีรับสินค้า / วันที่ต้องการรับ / งานด่วน */}
            <div id="pickup" className="border-t border-border pt-4 space-y-3" data-testid="cart-fulfilment">
              <div className="text-sm font-semibold">การรับสินค้า</div>
              <div className="grid grid-cols-2 gap-2">
                {([["pickup", "รับหน้าร้าน"], ["delivery", "จัดส่ง"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={pickupMethod === v}
                    data-testid={`pickup-${v}`}
                    onClick={() => setPickupMethod(v)}
                    className={`min-h-11 rounded-xl border text-sm ${pickupMethod === v ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1" htmlFor="cart-want-date">
                  <CalendarDays className="w-3.5 h-3.5" /> วันที่ต้องการรับ
                </label>
                <Input id="cart-want-date" type="date" value={wantDate} onChange={(e) => setWantDate(e.target.value)} className="rounded-xl mt-1" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={rush} onCheckedChange={(v) => setRush(v === true)} className="min-h-5 min-w-5" data-testid="cart-rush" />
                <Zap className="w-4 h-4 text-[hsl(var(--champagne-foreground))]" aria-hidden /> ต้องการงานด่วน (คิดค่าบริการเพิ่มตามที่ร้านแจ้ง)
              </label>
            </div>

            {/* คูปองส่วนลด */}
            <div id="coupon" className="border-t border-border pt-4 space-y-3" data-testid="cart-perks">
              <div className="text-sm font-semibold flex items-center gap-1"><BadgePercent className="w-4 h-4 text-primary" /> คูปองส่วนลด</div>
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponMsg(null); }}
                  placeholder="กรอกรหัสคูปอง เช่น NATTA50"
                  className="rounded-xl"
                  data-testid="cart-coupon-input"
                  aria-label="รหัสคูปอง"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl min-h-11 shrink-0"
                  data-testid="cart-coupon-apply"
                  onClick={() => {
                    const r = applyCoupon(couponCode, subtotal);
                    setCouponMsg(r.message);
                    setCouponApplied(r.ok && r.coupon ? { code: r.coupon.code, discount: r.discount } : null);
                  }}
                >
                  ใช้คูปอง
                </Button>
              </div>
              {couponMsg && (
                <div className={`text-[11px] ${couponApplied ? "text-primary" : "text-destructive"}`} data-testid="cart-coupon-msg">{couponMsg}</div>
              )}
              {couponApplied && (
                <div className="text-[11px] text-muted-foreground" data-testid="cart-coupon-pending">
                  ส่วนลดนี้เป็นการคำนวณเบื้องต้น — ร้านจะยืนยันส่วนลดจริงในใบเสนอราคา
                </div>

              )}
              <ul className="text-[11px] text-muted-foreground space-y-0.5">
                {SHOP_COUPONS.map((c) => (
                  <li key={c.code}><span className="font-mono text-foreground">{c.code}</span> — {c.label}</li>
                ))}
              </ul>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-1">
                ข้อมูลผู้สั่งซื้อ <span className="text-destructive">*</span>
              </div>
              {identity.linked && (
                <div
                  className="rounded-xl border border-[#06C755]/40 bg-[#06C755]/10 p-3 text-xs"
                  data-testid="cart-identity-card"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#06C755]" /> เชื่อมต่อบัญชี LINE แล้ว ✓
                  </div>
                  <div className="mt-1 text-foreground" data-testid="cart-identity-name">
                    {identity.name || "-"} · {identity.phone || "-"}
                  </div>
                </div>
              )}
              {identity.missing.includes("name") && (
                <div>
                  <label className="text-xs text-muted-foreground">ชื่อผู้สั่ง</label>
                  <Input
                    value={name}
                    onChange={(e) => { setName(e.target.value); setSubmitError(null); }}
                    className={`rounded-xl mt-1 ${showErr && errors.name ? "border-destructive" : ""}`}
                    placeholder="เช่น ครูสมชาย"
                    data-testid="cart-name"
                    data-cart-field-error={showErr && !!errors.name}
                  />
                  {showErr && errors.name && <div className="text-[11px] text-destructive mt-1">{errors.name}</div>}
                </div>
              )}
              {identity.missing.includes("phone") && (
                <div>
                  <label className="text-xs text-muted-foreground">เบอร์โทร</label>
                  <Input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setSubmitError(null); }}
                    inputMode="tel"
                    className={`rounded-xl mt-1 ${showErr && errors.phone ? "border-destructive" : ""}`}
                    placeholder="เช่น 0812345678"
                    data-testid="cart-phone"
                    data-cart-field-error={showErr && !!errors.phone}
                  />
                  {showErr && errors.phone && <div className="text-[11px] text-destructive mt-1">{errors.phone}</div>}
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">หน่วยงาน / โรงเรียน <span className="text-destructive">*</span></label>
                <Input
                  value={school}
                  onChange={(e) => { setSchool(e.target.value); setSubmitError(null); }}
                  className={`rounded-xl mt-1 ${showErr && errors.school ? "border-destructive" : ""}`}
                  placeholder="เช่น โรงเรียนบ้านเชียงกลาง"
                  data-testid="cart-school"
                  data-cart-field-error={showErr && !!errors.school}
                />
                {showErr && errors.school && <div className="text-[11px] text-destructive mt-1">{errors.school}</div>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ที่อยู่ <span className="text-destructive">*</span></label>
                <Textarea
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setSubmitError(null); }}
                  rows={3}
                  className={`rounded-xl mt-1 ${showErr && errors.address ? "border-destructive" : ""}`}
                  placeholder="ที่อยู่สำหรับจัดส่งสินค้า / ออกเอกสาร"
                  data-testid="cart-address"
                  data-cart-field-error={showErr && !!errors.address}
                />
                {showErr && errors.address && <div className="text-[11px] text-destructive mt-1">{errors.address}</div>}
              </div>
            </div>
            <div className="text-xs bg-accent rounded-xl p-3 flex gap-2">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                ข้อมูลของคุณจะถูกใช้เพื่อ<strong>ติดต่อกลับและเสนอราคา</strong>เท่านั้น
                — ราคาจะถูกเสนอโดยร้านหลังได้รับรายการ
              </span>
            </div>
            {submitError && (
              <div role="alert" data-testid="cart-submit-error" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}
            <Button
              onClick={() => submit("order")}
              disabled={submitting}
              data-testid="submit-order-btn"
              className="w-full rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft h-12 disabled:opacity-60"
            >
              {submitting ? "กำลังส่ง..." : "สั่งซื้อเลย"}
            </Button>
            <Button
              variant="outline"
              onClick={() => submit("quote")}
              disabled={submitting}
              data-testid="submit-quote-btn"
              className="w-full rounded-xl h-12 border-primary/40 text-primary disabled:opacity-60"
            >
              ขอใบราคา / ทำใบเบิกไปก่อน
            </Button>
            <div className="text-[11px] text-muted-foreground text-center">
              ขอใบราคาไว้ก่อนได้ ยังไม่ผูกมัด — ทางร้านจะส่งใบเสนอราคากลับให้
            </div>

            {!isValid && !showErr && (
              <div className="text-[11px] text-muted-foreground text-center">
                กรอก หน่วยงาน / โรงเรียน และที่อยู่ ให้ครบก่อนสั่ง
              </div>
            )}
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div
          className="md:hidden fixed bottom-16 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border px-4 py-3 safe-bottom"
          data-testid="cart-sticky-footer"
        >
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs shrink-0">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => toggleAll(v === true)}
                aria-label="เลือกทั้งหมด"
                data-testid="cart-select-all"
                className="min-h-5 min-w-5"
              />
              ทั้งหมด
            </label>
            <div className="flex-1 min-w-0 text-right">
              <div className="text-[11px] text-muted-foreground">ยอดที่เลือก</div>
              <div className="font-bold text-primary tabular-nums" data-testid="cart-selected-total">{fmtTHB(subtotal)}</div>
            </div>
            <Button
              variant="outline"
              onClick={() => submit("quote")}
              disabled={submitting || selectedItems.length === 0}
              data-testid="cart-sticky-quote"
              className="rounded-xl h-12 px-3 shrink-0 border-primary/40 text-primary text-xs disabled:opacity-60"
            >
              ขอใบราคา
            </Button>
            <Button
              onClick={() => submit("order")}
              disabled={submitting || selectedItems.length === 0}
              data-testid="cart-sticky-submit"
              className="rounded-xl h-12 px-4 shrink-0 bg-gradient-primary text-primary-foreground disabled:opacity-60"
            >
              สั่งซื้อเลย ({selectedItems.length})
            </Button>
          </div>

          {selectedItems.length === 0 && (
            <div className="mt-1 text-[11px] text-destructive text-center" data-testid="cart-none-selected-hint">
              เลือกอย่างน้อย 1 รายการเพื่อดำเนินการสั่งซื้อ
            </div>
          )}
        </div>
      )}
    </CustomerLayout>
  );
}