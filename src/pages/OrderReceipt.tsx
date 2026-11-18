import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useGuest } from "@/contexts/GuestContext";
import { fmtTHB, fmtDateTime } from "@/lib/format";
import { ArrowLeft, Printer, FileImage, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { readIdToken } from "@/lib/lineSession";
import { useLineCustomer } from "@/contexts/LineCustomerContext";

export default function OrderReceipt() {
  const { id } = useParams();
  const { session } = useGuest();
  const { profile: lineProfile } = useLineCustomer();
  const nav = useNavigate();
  const [data, setData] = useState<{ order: any; items: any[]; org: any } | null>(null);
  const [store, setStore] = useState<any>(null);
  const [busy, setBusy] = useState<null | "jpg" | "png" | "pdf" | "line">(null);
  const [err, setErr] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let ok = true;
    (async () => {
      const id_token = readIdToken();
      const hasLineProof = !!(id_token || lineProfile);
      // Prefer the server-verified LINE path when a proof exists. The
      // edge function scopes ownership from the verified identity — we
      // MUST NOT send phone/customer_id/line_user_id/guest_id from the
      // client (they'd be ignored anyway, but sending them muddies logs
      // and could mislead future maintainers).
      if (hasLineProof) {
        try {
          const { data: r, error } = await supabase.functions.invoke("my-line-orders", {
            body: { action: "detail", order_id: id, ...(id_token ? { id_token } : {}) },
          });
          if (error) throw error;
          const p: any = r || {};
          if (p.error) {
            if (ok) setErr(p.error === "forbidden" ? "คุณไม่มีสิทธิ์ดูใบเสร็จนี้" : "โหลดใบเสร็จไม่สำเร็จ");
            return;
          }
          const order = p.order || null;
          if (!order) { if (ok) setErr("ไม่พบคำสั่งซื้อ หรือคุณไม่มีสิทธิ์ดู"); return; }
          if (!order.receipt_issued_at) {
            if (ok) setErr("ยังไม่ได้ออกใบเสร็จสำหรับคำสั่งซื้อนี้");
            return;
          }
          if (ok) setData({ order, items: p.items ?? [], org: p.organization ?? null });
          const { data: s } = await supabase.rpc("get_public_settings");
          const row: any = Array.isArray(s) ? s[0] : s;
          if (ok) setStore(row);
          return;
        } catch (e: any) {
          if (ok) setErr(e?.message || "โหลดใบเสร็จไม่สำเร็จ");
          return;
        }
      }
      // Legacy guest / staff bypass path — requires guest session phone.
      if (!session?.phone) { nav("/shop"); return; }
      const { data: r, error } = await supabase.rpc("get_guest_order_receipt" as any, {
        _order_id: id, _phone: session.phone,
      });
      if (error) { if (ok) setErr(error.message); return; }
      const p: any = r || {};
      if (!p.header) { if (ok) setErr("ยังไม่ได้ออกใบเสร็จสำหรับคำสั่งซื้อนี้"); return; }
      if (!p.header.receipt_issued_at) { if (ok) setErr("ยังไม่ได้ออกใบเสร็จสำหรับคำสั่งซื้อนี้"); return; }
      if (ok) setData({ order: p.header, items: p.items ?? [], org: p.org ?? null });
      if (ok && p.store) {
        setStore(p.store);
      } else {
        const { data: s } = await supabase.rpc("get_public_settings");
        const row: any = Array.isArray(s) ? s[0] : s;
        if (ok) setStore(row);
      }
    })();
    return () => { ok = false; };
  }, [id, session?.phone, lineProfile?.line_user_id, nav]);

  async function snapshot() {
    if (!receiptRef.current) throw new Error("ไม่พบใบเสร็จ");
    return await html2canvas(receiptRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  }

  /**
   * Higher-resolution snapshot for PNG export. scale=3 keeps Thai glyphs
   * crisp when the image is viewed on mobile / LINE and re-shared.
   */
  async function snapshotHiRes() {
    if (!receiptRef.current) throw new Error("ไม่พบใบเสร็จ");
    return await html2canvas(receiptRef.current, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
  }

  async function exportJPG() {
    if (busy) return; setBusy("jpg");
    try {
      const c = await snapshot();
      const a = document.createElement("a");
      a.href = c.toDataURL("image/jpeg", 0.95);
      a.download = `receipt-${data?.order?.receipt_no || id}.jpg`;
      a.click();
      toast.success("ดาวน์โหลด JPG แล้ว");
    } catch (e: any) { toast.error(e?.message || "ดาวน์โหลด JPG ไม่สำเร็จ"); }
    finally { setBusy(null); }
  }

  async function exportPNG() {
    if (busy) return; setBusy("png");
    try {
      const c = await snapshotHiRes();
      const dataUrl = c.toDataURL("image/png");
      const filename = `receipt-${data?.order?.receipt_no || id}.png`;

      // Try Web Share API (mobile / LINE) with the PNG as a File first, so the
      // user can send it straight into a LINE chat instead of just a link.
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], filename, { type: "image/png" });
        const anyNav = navigator as any;
        if (anyNav.canShare && anyNav.canShare({ files: [file] })) {
          await anyNav.share({
            files: [file],
            title: "ใบเสร็จ",
            text: `ใบเสร็จเลขที่ ${data?.order?.receipt_no}`,
          });
          toast.success("แชร์ PNG แล้ว");
          return;
        }
      } catch {
        /* fall through to download */
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
      toast.success("ดาวน์โหลด PNG แล้ว");
    } catch (e: any) {
      toast.error(e?.message || "ดาวน์โหลด PNG ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function exportPDF() {
    if (busy) return; setBusy("pdf");
    try {
      const c = await snapshot();
      const img = c.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = c.width / c.height;
      let w = pageW - 10, h = w / ratio;
      if (h > pageH - 10) { h = pageH - 10; w = h * ratio; }
      pdf.addImage(img, "JPEG", (pageW - w) / 2, 5, w, h);
      pdf.save(`receipt-${data?.order?.receipt_no || id}.pdf`);
      toast.success("ดาวน์โหลด PDF แล้ว");
    } catch (e: any) { toast.error(e?.message || "ดาวน์โหลด PDF ไม่สำเร็จ"); }
    finally { setBusy(null); }
  }

  async function shareLine() {
    const url = window.location.href;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: "ใบเสร็จ", text: `ใบเสร็จเลขที่ ${data?.order?.receipt_no}`, url });
        return;
      }
    } catch {}
    const line = `https://line.me/R/msg/text/?${encodeURIComponent(`ใบเสร็จเลขที่ ${data?.order?.receipt_no}\n${url}`)}`;
    window.open(line, "_blank", "noopener,noreferrer");
  }

  if (err) return (
    <CustomerLayout>
      <Link to={`/my-orders/${id}`} className="inline-flex items-center text-sm text-muted-foreground mb-4"><ArrowLeft className="w-4 h-4 mr-1" /> ย้อนกลับ</Link>
      <div className="text-center py-12 text-destructive">{err}</div>
    </CustomerLayout>
  );
  if (!data) return <CustomerLayout><div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div></CustomerLayout>;

  const { order, items, org } = data;
  const total = Number(order.total || 0);
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const shipping = Number(order.shipping_fee || 0);

  return (
    <CustomerLayout>
      <SeoHead
        title={`ใบเสร็จ ${order.receipt_no || order.order_no} — ร้านนัฐภรณ์`}
        description={`ใบเสร็จรับเงินอิเล็กทรอนิกส์เลขที่ ${order.receipt_no || order.order_no}`}
        path={`/my-orders/${order.id}/receipt`}
      />
      <style>{`@media print { .no-print { display:none !important; } body { background: white; } }`}</style>

      <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        <Link to={`/my-orders/${id}`} className="inline-flex items-center text-sm text-muted-foreground"><ArrowLeft className="w-4 h-4 mr-1" /> ย้อนกลับ</Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90">
            <Printer className="w-4 h-4" /> พิมพ์
          </button>
          <button onClick={exportJPG} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-sm hover:bg-accent disabled:opacity-60">
            <FileImage className="w-4 h-4" /> {busy === "jpg" ? "กำลังสร้าง…" : "JPG"}
          </button>
          <button onClick={exportPNG} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm hover:bg-primary/20 disabled:opacity-60">
            <FileImage className="w-4 h-4" /> {busy === "png" ? "กำลังสร้าง…" : "PNG (ส่ง LINE ได้)"}
          </button>
          <button onClick={exportPDF} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card border border-border text-sm hover:bg-accent disabled:opacity-60">
            <FileText className="w-4 h-4" /> {busy === "pdf" ? "กำลังสร้าง…" : "PDF"}
          </button>
          <button onClick={shareLine} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#06C755] text-white text-sm hover:opacity-90">
            <Send className="w-4 h-4" /> ส่ง LINE
          </button>
        </div>
      </div>

      <div ref={receiptRef} className="mx-auto max-w-[820px] bg-white shadow-card rounded-2xl p-6 sm:p-10 text-[13px] text-neutral-800 border border-border">
        <header className="flex items-start justify-between border-b border-neutral-300 pb-4">
          <div>
            {store?.logo_url && <img src={store.logo_url} alt="" className="h-14 mb-2 object-contain" />}
            <div className="text-xl font-bold">{store?.store_name || "ร้านนัฐภรณ์ เชียงกลาง"}</div>
            {store?.address && <div className="text-xs text-neutral-500 mt-1 whitespace-pre-line max-w-[300px]">{store.address}</div>}
            {store?.phone && <div className="text-xs text-neutral-500">โทร: {store.phone}</div>}
            {store?.email && <div className="text-xs text-neutral-500">อีเมล: {store.email}</div>}
            {store?.tax_id && <div className="text-xs text-neutral-500">เลขผู้เสียภาษี: {store.tax_id}</div>}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-primary">{store?.receipt_header || "ใบเสร็จรับเงินอิเล็กทรอนิกส์"}</div>
            <div className="text-[11px] text-muted-foreground">E-Receipt</div>
            <div className="text-xs mt-2">เลขที่: <span className="font-mono font-semibold">{order.receipt_no || "-"}</span></div>
            <div className="text-xs">อ้างอิงออเดอร์: <span className="font-mono">{order.order_no}</span></div>
            <div className="text-xs">วันที่: {order.receipt_issued_at ? fmtDateTime(order.receipt_issued_at) : "-"}</div>
            <div className="mt-2 inline-block px-2 py-0.5 text-[10px] rounded-full bg-success/10 text-success border border-success/30">✓ ชำระเงินแล้ว</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 mt-5">
          <div>
            <div className="text-[11px] text-neutral-500 uppercase tracking-wide">ลูกค้า</div>
            <div className="text-sm font-semibold mt-1">{order.guest_name || org?.name || "-"}</div>
            {order.guest_phone && <div className="text-xs text-neutral-500 mt-0.5">โทร: {order.guest_phone}</div>}
            {order.school_name && <div className="text-xs text-neutral-500 mt-0.5">โรงเรียน/หน่วยงาน: {order.school_name}</div>}
            {order.customer_tax_id && (
              <div className="text-xs text-neutral-700 mt-0.5">
                เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{order.customer_tax_id}</span>
                {order.customer_branch ? ` (${order.customer_branch})` : ""}
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-neutral-500 uppercase tracking-wide">รายละเอียด</div>
            <div className="text-sm font-semibold mt-1">{order.project_name || "คำสั่งซื้อ"}</div>
            {order.note && <div className="text-xs text-neutral-500 mt-0.5 whitespace-pre-line">{order.note}</div>}
          </div>
        </section>

        <table className="w-full mt-6 border-collapse">
          <thead>
            <tr className="bg-neutral-100 text-[11px]">
              <th className="border border-neutral-300 py-1.5 px-2 text-left">#</th>
              <th className="border border-neutral-300 py-1.5 px-2 text-left">รายการ</th>
              <th className="border border-neutral-300 py-1.5 px-2 text-right">จำนวน</th>
              <th className="border border-neutral-300 py-1.5 px-2 text-right">ราคา</th>
              <th className="border border-neutral-300 py-1.5 px-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="border border-neutral-300 py-4 text-center text-neutral-400 text-xs">ไม่มีรายการ</td></tr>
            ) : items.map((it: any, i: number) => (
              <tr key={it.id ?? i} className="text-[12px]">
                <td className="border border-neutral-200 py-1.5 px-2">{i + 1}</td>
                <td className="border border-neutral-200 py-1.5 px-2">
                  <div className="font-medium">{it.product_name || "-"}</div>
                  {it.product_code && <div className="text-[10px] text-neutral-500">{it.product_code}</div>}
                </td>
                <td className="border border-neutral-200 py-1.5 px-2 text-right">{Number(it.qty || 0)} {it.unit || ""}</td>
                <td className="border border-neutral-200 py-1.5 px-2 text-right">{fmtTHB(Number(it.price || 0))}</td>
                <td className="border border-neutral-200 py-1.5 px-2 text-right">{fmtTHB(Number(it.total || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="flex justify-end mt-4">
          <div className="w-64 text-sm">
            <div className="flex justify-between py-1"><span className="text-neutral-500">รวมสินค้า</span><span>{fmtTHB(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between py-1 text-xs"><span className="text-neutral-500">ส่วนลด</span><span>-{fmtTHB(discount)}</span></div>}
            {shipping > 0 && <div className="flex justify-between py-1 text-xs"><span className="text-neutral-500">ค่าจัดส่ง</span><span>{fmtTHB(shipping)}</span></div>}
            <div className="flex justify-between py-2 mt-1 border-t border-neutral-300">
              <span className="font-semibold">รวมทั้งสิ้น</span>
              <span className="font-bold text-lg text-primary">{fmtTHB(total)}</span>
            </div>
          </div>
        </section>

        <footer className="mt-10 pt-4 border-t border-neutral-200 text-[11px] text-neutral-500 text-center">
          {store?.receipt_footer ? (
            <div className="whitespace-pre-line">{store.receipt_footer}</div>
          ) : (
            <div>ขอบคุณที่ใช้บริการ · เอกสารนี้ออกโดยระบบอิเล็กทรอนิกส์</div>
          )}
          {order.paid_at && <div className="mt-1">ชำระเงินเมื่อ {fmtDateTime(order.paid_at)}</div>}
        </footer>
      </div>
    </CustomerLayout>
  );
}