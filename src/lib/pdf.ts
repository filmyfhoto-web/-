import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtTHB, fmtDate } from "./format";
import { SARABUN_REGULAR_B64, SARABUN_BOLD_B64 } from "@/assets/fonts/sarabun-base64";

// Register Sarabun on each jsPDF instance so Thai glyphs render correctly.
// jsPDF's VFS is per-instance, so this MUST run for every new document.
function ensureThaiFont(doc: jsPDF) {
  doc.addFileToVFS("Sarabun-Regular.ttf", SARABUN_REGULAR_B64);
  doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  doc.addFileToVFS("Sarabun-Bold.ttf", SARABUN_BOLD_B64);
  doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
}

export type DocKind = "quotation" | "purchase_order" | "delivery_note" | "e_receipt";

const DOC_TITLE: Record<DocKind, string> = {
  quotation: "ใบเสนอราคา / Quotation",
  purchase_order: "ใบสั่งซื้อ / Purchase Order",
  delivery_note: "ใบส่งของ / Delivery Note",
  e_receipt: "ใบเสร็จรับเงิน / Receipt",
};

export interface DocPayload {
  kind: DocKind;
  docNo: string;
  date: string | Date;
  store: { name: string; address?: string; phone?: string; email?: string; logoUrl?: string };
  customer: { name: string; address?: string; phone?: string; contact?: string; taxId?: string; email?: string };
  items: { name: string; code?: string; qty: number; unit?: string; price: number; total: number }[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  note?: string;
  vatRate?: number;
  vatAmount?: number;
  depositPaid?: number;
  balance?: number;
  paymentMethod?: string;
  paidAt?: string | Date;
  consent?: {
    termsVersion?: string | null;
    termsAt?: string | null;
    privacyVersion?: string | null;
    privacyAt?: string | null;
    capturedAt?: string | null;
  } | null;
}

export async function makePdf(p: DocPayload): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  ensureThaiFont(doc);
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(16);
  doc.text(p.store.name, 14, 18);
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(10);
  if (p.store.address) doc.text(p.store.address, 14, 24);
  if (p.store.phone) doc.text(`Tel: ${p.store.phone}`, 14, 29);

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(14);
  doc.text(DOC_TITLE[p.kind], 200, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("Sarabun", "normal");
  doc.text(`No: ${p.docNo}`, 200, 24, { align: "right" });
  doc.text(`Date: ${fmtDate(p.date)}`, 200, 29, { align: "right" });

  doc.setDrawColor(230, 30, 90);
  doc.setLineWidth(0.5);
  doc.line(14, 34, 200, 34);

  doc.setFont("Sarabun", "bold");
  doc.text("Customer / ลูกค้า:", 14, 42);
  doc.setFont("Sarabun", "normal");
  doc.text(p.customer.name, 45, 42);
  if (p.customer.contact) doc.text(`Contact: ${p.customer.contact}`, 14, 47);
  if (p.customer.phone) doc.text(`Tel: ${p.customer.phone}`, 14, 52);
  if (p.customer.address) doc.text(`${p.customer.address}`, 14, 57, { maxWidth: 180 });
  {
    let cy = 57 + (p.customer.address ? 10 : 5);
    if (p.customer.taxId) { doc.text(`Tax ID: ${p.customer.taxId}`, 14, cy); cy += 5; }
    if (p.customer.email) { doc.text(`Email: ${p.customer.email}`, 14, cy); cy += 5; }
  }

  autoTable(doc, {
    startY: 65,
    head: [["#", "Code", "Item / รายการ", "Qty", "Unit", "Price", "Total"]],
    body: p.items.map((it, i) => [
      i + 1,
      it.code ?? "",
      it.name,
      it.qty,
      it.unit ?? "",
      it.price.toFixed(2),
      it.total.toFixed(2),
    ]),
    styles: { fontSize: 9, cellPadding: 2, font: "Sarabun" },
    headStyles: { fillColor: [230, 30, 90], textColor: 255, font: "Sarabun", fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      3: { halign: "right", cellWidth: 18 },
      4: { halign: "center", cellWidth: 18 },
      5: { halign: "right", cellWidth: 24 },
      6: { halign: "right", cellWidth: 28 },
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 8;
  const right = 200;
  const labelX = 145;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(10);
  doc.text("Subtotal:", labelX, y); doc.text(p.subtotal.toFixed(2), right, y, { align: "right" }); y += 6;
  if (p.discount) { doc.text("Discount:", labelX, y); doc.text("-" + p.discount.toFixed(2), right, y, { align: "right" }); y += 6; }
  if (p.shippingFee) { doc.text("Shipping:", labelX, y); doc.text(p.shippingFee.toFixed(2), right, y, { align: "right" }); y += 6; }
  if (p.vatAmount) { doc.text(`VAT${p.vatRate ? ` (${p.vatRate}%)` : ""}:`, labelX, y); doc.text(p.vatAmount.toFixed(2), right, y, { align: "right" }); y += 6; }
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL (THB):", labelX, y + 2); doc.text(p.total.toFixed(2), right, y + 2, { align: "right" });
  y += 10;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(10);
  if (p.depositPaid) { doc.text("Deposit / มัดจำ:", labelX, y); doc.text(p.depositPaid.toFixed(2), right, y, { align: "right" }); y += 6; }
  if (p.balance != null) { doc.text("Balance / คงเหลือ:", labelX, y); doc.text(p.balance.toFixed(2), right, y, { align: "right" }); y += 6; }
  if (p.paymentMethod) { doc.text(`Payment / วิธีชำระ: ${p.paymentMethod}`, labelX, y); y += 6; }
  if (p.paidAt) { doc.text(`Paid at: ${fmtDate(p.paidAt)}`, labelX, y); y += 6; }

  y += 18;
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  if (p.note) { doc.text(`Note: ${p.note}`, 14, y, { maxWidth: 180 }); y += 10; }

  // signatures
  y = Math.max(y, 250);
  doc.line(30, y, 80, y);
  doc.line(130, y, 180, y);
  doc.text("Customer / ผู้สั่งซื้อ", 55, y + 5, { align: "center" });
  doc.text("Authorized / ผู้มีอำนาจ", 155, y + 5, { align: "center" });

  // Consent snapshot footer (compliance audit trail)
  if (p.consent && (p.consent.termsVersion || p.consent.privacyVersion)) {
    const c = p.consent;
    const fmt = (d?: string | null) => (d ? fmtDate(d) : "—");
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    const line1 = `Consent: Terms v${c.termsVersion || "—"} (${fmt(c.termsAt)}) · Privacy v${c.privacyVersion || "—"} (${fmt(c.privacyAt)})`;
    doc.text(line1, 14, 287, { maxWidth: 186 });
    if (c.capturedAt) doc.text(`Captured: ${fmt(c.capturedAt)}`, 200, 287, { align: "right" });
    doc.setTextColor(0);
  }

  return doc.output("blob");
}

export async function downloadPdf(filename: string, payload: DocPayload) {
  const blob = await makePdf(payload);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}