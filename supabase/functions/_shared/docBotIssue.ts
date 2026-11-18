/**
 * FILM SHOP — ออกเอกสารจริงจากคำสั่งบอท LINE แล้วส่งภาพให้ลูกค้า
 *
 * ลำดับการทำงาน (ทุกขั้นบันทึกลง document_command_audit ผ่าน RPC):
 *   1) สร้าง draft + รายการ (idempotent ด้วย message id)
 *   2) ออกเลขที่จริงด้วย document_command_finalize_bot (ตรวจสิทธิ์ในฐานข้อมูล)
 *   3) เรนเดอร์ภาพ PNG แล้วอัปโหลดขึ้น bucket doc-images (signed URL)
 *   4) ส่งภาพให้ลูกค้าใน LINE ถ้าหาปลายทางเจอ
 */
import { DOC_TYPE_LABELS, SHOP_LABELS, formatThaiDate } from "./docCommandParser.ts";
import type { DocBotCommand } from "./docBotCommands.ts";
import { renderDocPng, uploadDocImage } from "./docImage.ts";
import { buildDocPdf, uploadDocPdf } from "./docPdf.ts";
import { pushLineMessages } from "./linePush.ts";

export interface IssueDocInput {
  command: DocBotCommand;
  messageId: string;
  lineUserId: string;
  channelId: string;
  actorLabel?: string | null;
  lineToken: string;
  appOrigin: string;
  /** LINE group/room id ที่ออกเอกสาร — ใช้ค้น “เอกสารใบล่าสุดของห้องนี้” */
  roomId?: string | null;
}

export interface IssueDocResult {
  docNo: string;
  already: boolean;
  draftId: string;
  imageUrl: string | null;
  /** ลิงก์ไฟล์ PDF ของเอกสาร (แนบกลับในแชท) */
  pdfUrl: string | null;
  sentTo: string | null;
  sendError?: string | null;
  /** เลขที่เอกสารที่ออกพร้อมกัน (เช่น ใบส่งของ + ใบเสร็จ) */
  companionDocNos?: string[];
}

const PAYMENT_LABELS: Record<string, string> = {
  paid: "ชำระแล้ว",
  deposit: "มัดจำ",
  unpaid: "ยังไม่ชำระ",
};

/** หา LINE userId ของลูกค้าจากเบอร์โทรที่เคยผูกไว้ (ไม่เดา ถ้าไม่เจอคืน null) */
export async function resolveCustomerLineUser(
  admin: any,
  target: { lineUserId?: string; phone?: string } | null,
  fallbackPhone?: string | null,
): Promise<string | null> {
  if (!target) return null;
  if (target.lineUserId) return target.lineUserId;
  const digits = String(target.phone || fallbackPhone || "").replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  const tail = digits.slice(-9);
  const like = `%${tail}`;

  const { data: link } = await admin
    .from("line_account_links")
    .select("line_user_id")
    .like("phone", like)
    .limit(1)
    .maybeSingle();
  if (link?.line_user_id) return link.line_user_id as string;

  const { data: cust } = await admin
    .from("film_customers")
    .select("line_user_id")
    .like("phone", like)
    .not("line_user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (cust?.line_user_id) return cust.line_user_id as string;

  const { data: prof } = await admin
    .from("profiles")
    .select("line_user_id")
    .like("phone", like)
    .not("line_user_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (prof?.line_user_id as string | undefined) ?? null;
}

export async function issueDocFromLine(admin: any, input: IssueDocInput): Promise<IssueDocResult> {
  const { command, messageId, lineUserId, channelId } = input;
  const f = command.fields;
  const totals = command.totals;
  const tempRef = `linebot:${messageId}`;

  // 1) draft (idempotent ต่อ message id)
  let draftId: string | null = null;
  const { data: existing } = await admin
    .from("document_command_drafts")
    .select("id, final_doc_no, status, image_url, sent_to_line_user_id")
    .eq("temp_ref", tempRef)
    .maybeSingle();

  if (existing) {
    draftId = existing.id as string;
  } else {
    const { data: created, error } = await admin
      .from("document_command_drafts")
      .insert({
        temp_ref: tempRef,
        doc_type: command.docType,
        shop_key: f.shopKey,
        customer_name: f.customerName ?? null,
        customer_phone: f.customerPhone ?? null,
        customer_address: f.customerAddress ?? null,
        customer_tax_id: f.customerTaxId ?? null,
        customer_branch: command.doc?.customerBranch ?? null,
        paper_size: command.doc?.paperSize ?? "A4",
        template: command.doc?.template ?? "modern",
        price_type: command.doc?.priceType ?? null,
        document_date: command.doc?.documentDate ?? null,
        companions: command.doc?.companions ?? [],
        project: f.project ?? null,
        notes: f.notes ?? null,
        discount: f.discount,
        vat_mode: f.vatMode,
        vat_rate: f.vatRate,
        wht_rate: f.whtRate,
        deposit: f.deposit,
        payment_status: f.paymentStatus,
        payment_method: f.paymentMethod ?? null,
        due_at: f.dueAtISO ?? null,
        subtotal: totals.subtotal,
        vat_amount: totals.vatAmount,
        wht_amount: totals.whtAmount,
        total: totals.total,
        missing_fields: [],
        status: "draft",
        source: "line",
        transcript: null,
        raw_command: null,
        parsed: { ...(f as unknown as Record<string, unknown>), room_id: input.roomId ?? null },
        line_user_id: lineUserId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`draft_insert_failed: ${error?.message ?? "unknown"}`);
    draftId = created.id as string;

    const { error: itemErr } = await admin.from("document_command_items").insert(
      f.items.map((it, i) => ({
        draft_id: draftId,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unitPrice,
        discount: it.discount ?? 0,
        total: it.total,
        sort_order: i + 1,
      })),
    );
    if (itemErr) throw new Error(`draft_items_failed: ${itemErr.message}`);
  }

  // 2) ออกเลขที่จริง (ฐานข้อมูลตรวจสิทธิ์ + กันออกซ้ำ)
  const { data: finRaw, error: finErr } = await admin.rpc("document_command_finalize_bot", {
    p_draft_id: draftId,
    p_line_user_id: lineUserId,
    p_channel_id: channelId,
    p_actor_label: input.actorLabel ?? null,
  });
  if (finErr) throw new Error(finErr.message);
  const fin = Array.isArray(finRaw) ? finRaw[0] : finRaw;
  const docNo = String(fin?.doc_no ?? "");
  const already = Boolean(fin?.already);
  if (!docNo) throw new Error("finalize_no_doc_no");

  const { data: finalRow } = await admin
    .from("document_command_drafts")
    .select("companion_doc_nos")
    .eq("id", draftId)
    .maybeSingle();
  const companionDocNos = Array.isArray(finalRow?.companion_doc_nos)
    ? (finalRow!.companion_doc_nos as string[])
    : [];

  // 3) ภาพเอกสาร
  let imageUrl: string | null = (existing?.image_url as string | null) ?? null;
  let pdfUrl: string | null = null;
  {
    const docImageInput = {
      docTitle: DOC_TYPE_LABELS[command.docType],
      docNo,
      shopName: SHOP_LABELS[f.shopKey ?? "film"],
      issuedAtText: formatThaiDate(new Date().toISOString()),
      customerName: f.customerName ?? "-",
      customerPhone: f.customerPhone ?? null,
      customerAddress: f.customerAddress ?? null,
      project: f.project ?? null,
      dueText: f.dueAtISO ? formatThaiDate(f.dueAtISO) : null,
      items: f.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      vatAmount: totals.vatAmount,
      whtAmount: totals.whtAmount,
      total: totals.total,
      deposit: f.deposit,
      amountDue: totals.amountDue,
      paymentStatusText: PAYMENT_LABELS[f.paymentStatus] ?? f.paymentStatus,
      paymentMethod: f.paymentMethod ?? null,
      notes: f.notes ?? null,
    };

    if (!imageUrl) {
      const png = await renderDocPng(docImageInput);
      const uploaded = await uploadDocImage(admin, docNo, png);
      imageUrl = uploaded.url;
      await admin.from("document_command_drafts").update({ image_url: imageUrl }).eq("id", draftId);
    }

    // ไฟล์ PDF สำหรับแนบกลับในแชท — ล้มเหลวได้โดยไม่กระทบการออกเอกสาร
    try {
      const pdf = await buildDocPdf(docImageInput);
      pdfUrl = (await uploadDocPdf(admin, docNo, pdf)).url;
    } catch (e) {
      console.error("[docBotIssue] pdf failed", e);
    }
  }

  // 4) ส่งภาพให้ลูกค้า
  let sentTo: string | null = (existing?.sent_to_line_user_id as string | null) ?? null;
  let sendError: string | null = null;
  if (!sentTo) {
    const targetUser = await resolveCustomerLineUser(admin, command.sendTo, f.customerPhone);
    if (targetUser && imageUrl && input.lineToken) {
      const res = await pushLineMessages(input.lineToken, targetUser, [
        {
          type: "text",
          text: `${DOC_TYPE_LABELS[command.docType]} เลขที่ ${docNo}\n${SHOP_LABELS[f.shopKey ?? "film"]}\nยอดสุทธิ ${totals.amountDue.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท\nขอบคุณที่ใช้บริการค่ะ 🙏`,
        },
        { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl },
      ]);
      if (res.ok) {
        sentTo = targetUser;
        await admin
          .from("document_command_drafts")
          .update({ sent_to_line_user_id: targetUser, sent_at: new Date().toISOString() })
          .eq("id", draftId);
        await admin.from("document_command_audit").insert({
          draft_id: draftId,
          event: "image_sent_to_customer",
          detail: { doc_no: docNo },
          source: "line",
          line_user_id: targetUser,
        });
      } else {
        sendError = `line_${res.status ?? 0}`;
      }
    } else if (command.sendTo) {
      sendError = "customer_not_linked";
    }
  }

  return { docNo, already, draftId: draftId!, imageUrl, pdfUrl, sentTo, sendError, companionDocNos };
}
