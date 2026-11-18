import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SARABUN_REGULAR_B64, SARABUN_BOLD_B64 } from "@/assets/fonts/sarabun-base64";
import { formatMoney, formatThaiDate, lineTotal, type Requisition } from "@/lib/schoolRequisition";

/** ลงทะเบียนฟอนต์ Sarabun ต่อ 1 เอกสาร (VFS ของ jsPDF แยกตาม instance) */
function ensureThaiFont(doc: jsPDF) {
  doc.addFileToVFS("Sarabun-Regular.ttf", SARABUN_REGULAR_B64);
  doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  doc.addFileToVFS("Sarabun-Bold.ttf", SARABUN_BOLD_B64);
  doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
}

/** สร้างไฟล์ PDF ของ "ใบเขียนเบิก" — เอกสารประมาณการ ไม่ตัดสต๊อก */
export function makeRequisitionPdf(doc0: Requisition): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  ensureThaiFont(doc);

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(16);
  doc.text("NATTA GROUP", 14, 18);
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.text("เอกสารประมาณการ · ไม่ตัดสต๊อก", 14, 24);

  doc.setFont("Sarabun", "bold");
  doc.setFontSize(15);
  doc.text("ใบเขียนเบิก", 196, 18, { align: "right" });
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.text(`เลขที่อ้างอิง: ${doc0.id.slice(0, 8).toUpperCase()}`, 196, 24, { align: "right" });
  doc.text(`วันที่: ${formatThaiDate(doc0.doc_date)}`, 196, 29, { align: "right" });

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(14, 33, 196, 33);

  doc.setFontSize(10);
  doc.text(`โรงเรียน/หน่วยงาน: ${doc0.school_name || "-"}`, 14, 41);
  doc.text(`โครงการ: ${doc0.project_name || "-"}`, 14, 47);
  doc.text(`ผู้จัดทำ: ${doc0.prepared_by || "-"}`, 14, 53);
  doc.text(`สถานะ: ${doc0.status === "submitted" ? "ส่งให้ร้านแล้ว" : "แบบร่าง"}`, 120, 41);
  if (doc0.submitted_at) {
    doc.text(`วันที่ส่ง: ${formatThaiDate(String(doc0.submitted_at).slice(0, 10))}`, 120, 47);
  }

  autoTable(doc, {
    startY: 60,
    head: [["#", "รหัส", "รายการ", "ราคา/หน่วย", "จำนวน", "หน่วย", "รวม"]],
    body: doc0.items.map((it, i) => [
      i + 1,
      it.code || "",
      it.name,
      formatMoney(it.price),
      String(it.qty),
      it.unit || "",
      formatMoney(lineTotal(it)),
    ]),
    styles: { fontSize: 9, cellPadding: 2, font: "Sarabun" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, font: "Sarabun", fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      3: { halign: "right", cellWidth: 26 },
      4: { halign: "right", cellWidth: 18 },
      5: { halign: "center", cellWidth: 18 },
      6: { halign: "right", cellWidth: 28 },
    },
  });

  let y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 8;
  doc.setFont("Sarabun", "bold");
  doc.setFontSize(12);
  doc.text(`ยอดรวมทั้งสิ้น: ${formatMoney(doc0.total)} บาท`, 196, y, { align: "right" });
  y += 10;

  if (doc0.note) {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.text(`หมายเหตุ: ${doc0.note}`, 14, y, { maxWidth: 182 });
    y += 10;
  }

  y = Math.max(y, 250);
  doc.setFont("Sarabun", "normal");
  doc.setFontSize(9);
  doc.line(28, y, 82, y);
  doc.line(128, y, 182, y);
  doc.text("ผู้จัดทำ", 55, y + 5, { align: "center" });
  doc.text("ผู้อนุมัติ", 155, y + 5, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("เอกสารประมาณการ ไม่ใช่ใบสั่งซื้อ และไม่มีการตัดสต๊อกสินค้า", 14, 287);
  doc.setTextColor(0);

  return doc.output("blob");
}

export function requisitionPdfFilename(doc0: Requisition): string {
  const safe = (s: string) => (s || "").replace(/[\\/:*?"<>|]/g, " ").trim();
  const name = safe(doc0.school_name) || "ใบเขียนเบิก";
  return `ใบเขียนเบิก_${name}_${doc0.doc_date}.pdf`;
}

/** ดาวน์โหลดใบเขียนเบิกเป็นไฟล์ PDF */
export function downloadRequisitionPdf(doc0: Requisition): void {
  const blob = makeRequisitionPdf(doc0);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = requisitionPdfFilename(doc0);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
