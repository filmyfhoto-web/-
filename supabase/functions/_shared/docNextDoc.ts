/**
 * สร้างเอกสารขั้นถัดไป (ใบส่งของ / ใบเสร็จ / ใบกำกับภาษี) จาก "ใบเสนอราคาที่ออกเลขแล้ว"
 * ใช้ร่วมกันระหว่างบอท LINE และ backend อื่น — ฐานข้อมูลเป็นผู้บังคับกฎอีกชั้นหนึ่ง
 */
import { formatThaiDate } from "./docCommandParser.ts";
import { buildDocPdf, uploadDocPdf } from "./docPdf.ts";
import {
  NEXT_DOC_LABELS,
  RDS_TYPE_BY_BOT_TYPE,
  buildQuotationBlockText,
  quotationSourceReasonOf,
} from "./quotationFirst.ts";

export interface NextDocResult {
  ok: boolean;
  /** ข้อความตอบกลับพร้อมส่งเข้า LINE */
  message: string;
  docNo?: string;
  documentId?: string;
  sourceDocNo?: string;
  pdfUrl?: string | null;
}

export async function createNextDocFromQuotation(
  admin: any,
  input: {
    sourceDocNo: string;
    docType: string;
    storeId: string | null;
    storeLabel?: string | null;
    actorUserId?: string | null;
    createdSource?: string;
  },
): Promise<NextDocResult> {
  const rdsType = RDS_TYPE_BY_BOT_TYPE[input.docType];
  const label = NEXT_DOC_LABELS[input.docType] ?? "เอกสาร";
  if (!rdsType) {
    return { ok: false, message: `❌ ยังไม่รองรับการสร้าง${label}จากใบเสนอราคาค่ะ` };
  }
  if (!input.storeId) {
    return { ok: false, message: "❌ ห้องนี้ยังไม่ได้ผูกกับร้านค่ะ — ผูกห้องกับร้านก่อนนะคะ" };
  }

  // 1) หาใบเสนอราคาต้นทาง — กรองร้านก่อน limit เสมอ กันเลขเอกสารซ้ำข้ามร้านหยิบผิดใบ
  const { data: src } = await admin
    .from("rds_documents")
    .select("id, store_id, document_type, document_no, status, customer_name")
    .eq("document_no", input.sourceDocNo)
    .eq("store_id", input.storeId)
    .limit(1)
    .maybeSingle();

  if (!src) return { ok: false, message: buildQuotationBlockText("source_not_found", input.sourceDocNo) };
  if (src.store_id !== input.storeId) {
    return { ok: false, message: buildQuotationBlockText("source_store_mismatch", input.sourceDocNo) };
  }
  if (src.document_type !== "quotation") {
    return { ok: false, message: buildQuotationBlockText("source_not_quotation", input.sourceDocNo) };
  }
  if (String(src.status || "") !== "issued") {
    return { ok: false, message: buildQuotationBlockText("source_not_issued", input.sourceDocNo) };
  }

  // 2) ให้ฐานข้อมูลสร้างเอกสารต่อ (คัดลอกลูกค้า/รายการ/ภาษี + ผูก source_document_id)
  const { data: created, error } = await admin.rpc("rds_create_next_doc_from_quotation", {
    p_source_id: src.id,
    p_document_type: rdsType,
    p_actor: input.actorUserId ?? null,
    p_created_source: input.createdSource ?? "line_bot",
    p_store_id: input.storeId,
  });
  if (error) {
    const reason = quotationSourceReasonOf(error.message);
    return {
      ok: false,
      message: reason
        ? buildQuotationBlockText(reason, input.sourceDocNo)
        : `❌ สร้าง${label}ไม่สำเร็จค่ะ (${String(error.message).slice(0, 120)})`,
    };
  }
  const row = Array.isArray(created) ? created[0] : created;
  const docNo = String(row?.doc_no ?? "");
  const documentId = String(row?.document_id ?? "");
  if (!docNo) return { ok: false, message: `❌ สร้าง${label}ไม่สำเร็จค่ะ (ไม่ได้รับเลขที่เอกสาร)` };

  // 3) ไฟล์ PDF แนบกลับในแชท (ล้มเหลวได้โดยไม่กระทบเอกสาร)
  let pdfUrl: string | null = null;
  try {
    const { data: doc } = await admin.from("rds_documents").select("*").eq("id", documentId).maybeSingle();
    const { data: items } = await admin
      .from("rds_document_items")
      .select("name, description, quantity, unit, price, line_total, item_order")
      .eq("document_id", documentId)
      .order("item_order");
    if (doc) {
      const pdf = await buildDocPdf({
        docTitle: label,
        docNo,
        shopName: input.storeLabel ?? "",
        issuedAtText: formatThaiDate(new Date().toISOString()),
        customerName: doc.customer_name ?? "-",
        customerPhone: doc.customer_phone ?? null,
        customerAddress: doc.customer_address ?? null,
        project: doc.project_name ?? null,
        dueText: null,
        items: (items ?? []).map((i: any) => ({
          description: String(i.name ?? i.description ?? ""),
          quantity: Number(i.quantity ?? 0),
          unit: String(i.unit ?? ""),
          unitPrice: Number(i.price ?? 0),
          total: Number(i.line_total ?? 0),
        })),
        subtotal: Number(doc.subtotal ?? 0),
        discount: Number(doc.discount_total ?? 0),
        vatAmount: Number(doc.vat_amount ?? 0),
        whtAmount: Number(doc.withholding_tax_amount ?? 0),
        total: Number(doc.grand_total ?? doc.net_total ?? 0),
        deposit: 0,
        amountDue: Number(doc.net_total ?? doc.grand_total ?? 0),
        paymentStatusText: String(doc.payment_status ?? "unpaid") === "paid" ? "ชำระแล้ว" : "ยังไม่ชำระ",
        paymentMethod: doc.payment_method ?? null,
        notes: doc.notes ?? null,
      });
      pdfUrl = (await uploadDocPdf(admin, docNo, pdf)).url;
    }
  } catch (e) {
    console.error("[docNextDoc] pdf failed", e);
  }

  const lines = [
    `✅ ออก${label}เรียบร้อยค่ะ`,
    `เลขที่: ${docNo}`,
    `อ้างอิงใบเสนอราคา: ${input.sourceDocNo}`,
    `ลูกค้า: ${src.customer_name ?? "-"}`,
  ];
  if (pdfUrl) lines.push("", `📄 ไฟล์ PDF: ${pdfUrl}`, "(ลิงก์ใช้ได้ 30 วัน)");
  return { ok: true, message: lines.join("\n"), docNo, documentId, sourceDocNo: input.sourceDocNo, pdfUrl };
}
