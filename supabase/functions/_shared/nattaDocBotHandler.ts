/**
 * NATTA DOC BOT — ตัวจัดการเหตุการณ์ในกลุ่มพนักงาน (ข้อความ + postback)
 *
 * ขอบเขต: ออกเอกสารเท่านั้น
 *  - ไม่สร้างงาน/คิว NATTA.Q · ไม่ตัด/คืนสต๊อก · ไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ
 *  - ทำงานเฉพาะห้อง doc-only ที่ผูกร้านแล้ว (source.type = group เท่านั้น)
 *  - บังคับใบเสนอราคาก่อนเสมอ ก่อนออกใบส่งของ/ใบเสร็จ
 */
import {
  applyDocBotCarryOver,
  computeDocBotMissing,
  parseDocBotCommand,
  type DocBotCommand,
} from "./docBotCommands.ts";
import { applyDocEditPatch, buildDocPreviewFlex, parseDocEditCommand } from "./docBotFlow.ts";
import { computeDraftTotals } from "./docCommandParser.ts";
import { loadPendingFileDraft, consumeFileDraft } from "./docFileIntake.ts";
import { issueDocFromLine } from "./docBotIssue.ts";
import { createNextDocFromQuotation } from "./docNextDoc.ts";
import {
  NDB_DELETE_BLOCKED,
  NDB_HELP_TEXT,
  NDB_NEXT_DOCS,
  buildNdbApproveConfirmFlex,
  buildNdbApprovedFlex,
  buildNdbBundleCarousel,
  buildNdbBundleLinksText,
  buildNdbDoneSummaryText,
  buildNdbDocListFlex,
  buildNdbDraftReviewFlex,
  buildNdbIssuedFlex,
  ndbShouldShowBundleButton,
  buildNdbMenuFlex,
  buildNdbMissingFlex,
  buildNdbQuotationRequiredFlex,
  buildNdbTodayFlex,
  isNdbDeleteAttempt,
  isNdbHelpTrigger,
  isNdbMenuTrigger,
  isNdbNewQuoteTrigger,
  isNdbRecentTrigger,
  isNdbSupportedMessageType,
  isNdbTodayTrigger,
  ndbActionKey,
  ndbFlexMessage,
  ndbUnsupportedFileText,
  ndbUnsupportedMessageText,
  parseNdbDirectNextDoc,
  parseNdbBundleTrigger,
  parseNdbPostback,
  parseNdbSearchTrigger,
  type NdbShopKey,
} from "./nattaDocBot.ts";
import {
  approveQuotation,
  claimNdbAction,
  createNdbDraft,
  getNdbDraft,
  isQuotationApproved,
  listOpenNdbDrafts,
  listRecentNdbDocs,
  loadNdbDocBundle,
  countNdbBundleDocs,
  ndbAudit,
  ndbDraftAllowed,
  ndbDocUrl,
  loadNdbToday,
  releaseNdbAction,
  searchNdbDocs,
  updateNdbDraft,
} from "./nattaDocBotStore.ts";

export interface NdbContext {
  admin: any;
  groupId: string;
  lineUserId: string;
  eventId: string | null;
  shopKey: NdbShopKey;
  storeId: string | null;
  storeSlug: string | null;
  storeLabel: string | null;
  channelId: string;
  appOrigin: string;
  lineToken: string;
  actorLabel: string | null;
  send: (messages: unknown[]) => Promise<void>;
}

export interface NdbResult {
  handled: boolean;
  note?: string;
}

const NOT_HANDLED: NdbResult = { handled: false };

const CLAIM_ERROR_TEXT = "ระบบกันรายการซ้ำขัดข้องชั่วคราวค่ะ กรุณาลองกดใหม่อีกครั้ง";

/**
 * ข้อความ/ไฟล์ที่บอทเอกสารทำงานต่อไม่ได้ — ตอบให้ชัดว่าทำอะไรได้บ้าง
 * และย้ำว่า "ไม่มีการสร้างร่างหรือออกเลขเอกสาร" จากอินพุตนี้ (ไม่ทำงานซ้ำ)
 */
export async function handleNdbUnsupported(
  ctx: NdbContext,
  input: { kind: "message" | "file"; messageType?: string; detail?: string | null },
): Promise<NdbResult> {
  const text = input.kind === "file"
    ? ndbUnsupportedFileText(String(input.detail || ""))
    : ndbUnsupportedMessageText(String(input.messageType || ""), input.detail ?? null);
  await ctx.send([{ type: "text", text }, menuMsg(ctx)]);
  await ndbAudit(ctx.admin, {
    groupId: ctx.groupId,
    lineUserId: ctx.lineUserId,
    action: input.kind === "file" ? "unsupported_file" : "unsupported_message",
    detail: { messageType: input.messageType ?? null, note: input.detail ?? null },
  });
  return { handled: true, note: `ndb unsupported ${input.kind} ${input.messageType ?? ""}`.trim() };
}

/** ชนิดข้อความ LINE ที่บอทเอกสารรับได้ (ใช้จาก webhook ก่อนเรียก handler) */
export function ndbSupportsMessageType(t: string): boolean {
  return isNdbSupportedMessageType(t);
}

/** ชนิดเอกสารต่อเนื่องที่ร้านนี้ออกได้จริง — ตรวจฝั่ง handler ห้ามเชื่อค่าใน postback */
export function ndbAllowedNextDocTypes(shopKey: NdbShopKey): string[] {
  return (NDB_NEXT_DOCS[shopKey] ?? []).map((n) => String(n.type));
}

export function isNdbNextDocAllowed(shopKey: NdbShopKey, docType: string): boolean {
  return ndbAllowedNextDocTypes(shopKey).includes(String(docType || ""));
}

/** ป้ายชื่อเอกสารต่อเนื่องสำหรับข้อความยืนยัน */
export function nextDocLabel(shopKey: NdbShopKey, docType: string): string {
  const hit = (NDB_NEXT_DOCS[shopKey] ?? []).find((n) => String(n.type) === String(docType));
  if (hit) return hit.label;
  const fallback: Record<string, string> = {
    delivery_note: "ใบส่งของ",
    receipt: "ใบเสร็จรับเงิน",
    tax_receipt: "ใบเสร็จ/ใบกำกับภาษี",
  };
  return fallback[String(docType)] ?? "เอกสาร";
}

/** อ่านเอกสารตามเลขที่ โดยจำกัดร้านก่อนเสมอ (กันเลขซ้ำข้ามร้านหยิบผิดใบ) */
async function findDocByNo(ctx: NdbContext, docNo: string, columns = "id, store_id, document_type") {
  let q = ctx.admin.from("rds_documents").select(columns).eq("document_no", docNo);
  if (ctx.storeId) q = q.eq("store_id", ctx.storeId);
  const { data } = await q.limit(1).maybeSingle();
  return (data as Record<string, any> | null) ?? null;
}

function menuMsg(ctx: NdbContext) {
  return ndbFlexMessage("NATTA DOC BOT เมนูหลัก", buildNdbMenuFlex(ctx.shopKey, ctx.storeLabel, ctx.appOrigin));
}

function reviewMsg(ctx: NdbContext, draftId: string, command: DocBotCommand) {
  return ndbFlexMessage(
    "ตรวจสอบร่างใบเสนอราคา",
    buildNdbDraftReviewFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel, draftId, command }),
  );
}

function missingMsg(ctx: NdbContext, missing: string[], draftId?: string | null) {
  return ndbFlexMessage(
    "ข้อมูลยังไม่ครบ",
    buildNdbMissingFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel, missing, draftId }),
  );
}

/** ทำให้เป็นคำสั่ง “ใบเสนอราคา” เสมอ — บอทนี้เริ่มจากใบเสนอราคาเท่านั้น */
export function buildQuotationCommand(text: string, shopKey: NdbShopKey): DocBotCommand | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const withHead = /^(?:ออก|ทำ|สร้าง)\s*ใบ/.test(raw) ? raw : `ออกใบเสนอราคา\n${raw}`;
  const cmd = parseDocBotCommand(withHead);
  if (!cmd) return null;
  const fields = { ...cmd.fields, shopKey, docType: "quotation" as const };
  const missing = computeDocBotMissing("quotation", fields);
  fields.missing = missing;
  return {
    ...cmd,
    docType: "quotation",
    fields,
    missing,
    sendTo: null, // ห้ามส่งให้ลูกค้าอัตโนมัติ
    totals: computeDraftTotals(fields.items, fields),
  };
}

async function showRecent(ctx: NdbContext) {
  const rows = await listRecentNdbDocs(ctx.admin, ctx.storeId, ctx.appOrigin, ctx.storeSlug, 5);
  await ctx.send([
    ndbFlexMessage(
      "เอกสารล่าสุด",
      buildNdbDocListFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel, title: "เอกสารล่าสุด", rows }),
    ),
  ]);
}

async function showToday(ctx: NdbContext) {
  const summary = await loadNdbToday(ctx.admin, ctx.storeId);
  await ctx.send([
    ndbFlexMessage("เอกสารวันนี้", buildNdbTodayFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel, summary })),
  ]);
}

/** ส่งชุดเอกสารทั้งชุด: การ์ดตัวอย่างรายฉบับ + ข้อความรวมลิงก์ */
async function showBundle(ctx: NdbContext, docNo: string): Promise<NdbResult> {
  const { docs, sourceDocNo } = await loadNdbDocBundle(
    ctx.admin,
    ctx.storeId,
    docNo,
    ctx.appOrigin,
    ctx.storeSlug,
  );
  if (!docs.length) {
    await ctx.send([{ type: "text", text: `ไม่พบเอกสารเลขที่ ${docNo} ในร้านของกลุ่มนี้ค่ะ` }]);
    return { handled: true, note: "ndb bundle not found" };
  }
  if (docs.length < 2) {
    await ctx.send([{
      type: "text",
      text: `ชุดของ ${sourceDocNo ?? docNo} ยังมีแค่ใบเสนอราคาต้นชุด ยังไม่มีเอกสารต่อเนื่องค่ะ`,
    }]);
    await ndbAudit(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: "bundle_links_skipped",
      documentNo: sourceDocNo ?? docNo,
      detail: { reason: "no_child_docs", shopKey: ctx.shopKey, storeId: ctx.storeId },
    });
    return { handled: true, note: "ndb bundle single" };
  }
  await ctx.send([
    ndbFlexMessage(`รวมลิงก์ทั้งชุด ${sourceDocNo ?? docNo} (${docs.length} ฉบับ)`, buildNdbBundleCarousel({
      shopKey: ctx.shopKey,
      storeLabel: ctx.storeLabel,
      docs,
    })),
    { type: "text", text: buildNdbBundleLinksText(docs, sourceDocNo) },
  ]);
  await ndbAudit(ctx.admin, {
    groupId: ctx.groupId,
    lineUserId: ctx.lineUserId,
    action: "bundle_links",
    documentNo: sourceDocNo ?? docNo,
    detail: {
      shopKey: ctx.shopKey,
      storeId: ctx.storeId,
      requestedDocNo: docNo,
      docCount: docs.length,
      docTypes: docs.map((d) => d.docTypeLabel),
    },
  });
  return { handled: true, note: `ndb bundle ${docs.length}` };
}

async function showSearch(ctx: NdbContext, keyword: string) {
  const rows = await searchNdbDocs(ctx.admin, ctx.storeId, keyword, ctx.appOrigin, ctx.storeSlug, 10);
  await ctx.send([
    ndbFlexMessage(
      "ผลการค้นหาเอกสาร",
      buildNdbDocListFlex({
        shopKey: ctx.shopKey,
        storeLabel: ctx.storeLabel,
        title: `ผลการค้นหา “${keyword}”`,
        rows,
      }),
    ),
  ]);
}

async function blockNextDoc(ctx: NdbContext) {
  await ctx.send([
    ndbFlexMessage(
      "ต้องมีใบเสนอราคาก่อน",
      buildNdbQuotationRequiredFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel }),
    ),
  ]);
}

/** สร้าง/อัปเดตร่าง แล้วตอบการ์ดตรวจสอบหรือการ์ดข้อมูลขาด */
async function upsertDraftAndReply(ctx: NdbContext, command: DocBotCommand, draftId?: string | null) {
  let cmd = command;
  if (cmd.missing.length) {
    const pending = await loadPendingFileDraft(ctx.admin, ctx.groupId, ctx.lineUserId);
    if (pending) {
      const merged = applyDocBotCarryOver(cmd, pending.extract);
      if (merged.missing.length < cmd.missing.length) cmd = { ...merged, docType: "quotation", sendTo: null };
    }
  }
  let id = draftId ?? null;
  if (id) {
    await updateNdbDraft(ctx.admin, id, { command: cmd, missing: cmd.missing });
  } else {
    const row = await createNdbDraft(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      shopKey: ctx.shopKey,
      storeId: ctx.storeId,
      command: cmd,
      missing: cmd.missing,
    });
    id = row?.id ?? null;
  }
  await ndbAudit(ctx.admin, {
    groupId: ctx.groupId,
    lineUserId: ctx.lineUserId,
    action: draftId ? "draft_updated" : "draft_created",
    draftId: id,
    detail: { missing: cmd.missing.length },
  });
  if (cmd.missing.length) {
    await ctx.send([missingMsg(ctx, cmd.missing, id)]);
    return;
  }
  if (!id) {
    await ctx.send([{ type: "text", text: "บันทึกร่างไม่สำเร็จค่ะ กรุณาลองใหม่อีกครั้ง" }]);
    return;
  }
  await ctx.send([reviewMsg(ctx, id, cmd)]);
}

async function confirmDraft(ctx: NdbContext, draftId: string): Promise<NdbResult> {
  const draft = await getNdbDraft(ctx.admin, draftId);
  if (!ndbDraftAllowed(draft, ctx.groupId, ctx.lineUserId)) {
    await ctx.send([{ type: "text", text: "ร่างนี้ไม่ใช่ของคุณหรือถูกยกเลิกไปแล้วค่ะ" }]);
    return { handled: true, note: "ndb confirm denied" };
  }
  if (draft!.status === "confirmed" && draft!.document_no) {
    await ctx.send([{ type: "text", text: `ร่างนี้ออกเป็นเอกสารเลขที่ ${draft!.document_no} แล้วค่ะ` }]);
    return { handled: true, note: "ndb confirm duplicate" };
  }
  const claimKey = ndbActionKey({
    groupId: ctx.groupId,
    lineUserId: ctx.lineUserId,
    action: "confirm",
    ref: draftId,
  });
  const claim = await claimNdbAction(ctx.admin, claimKey);
  if (claim === "error") {
    await ctx.send([{ type: "text", text: CLAIM_ERROR_TEXT }]);
    return { handled: true, note: "ndb confirm claim error" };
  }
  if (claim === "duplicate") {
    return { handled: true, note: "ndb confirm already claimed" };
  }
  const command = draft!.payload?.command as DocBotCommand | undefined;
  if (!command) {
    await releaseNdbAction(ctx.admin, claimKey);
    await ctx.send([{ type: "text", text: "ไม่พบข้อมูลร่างค่ะ กรุณาเริ่มใหม่" }]);
    return { handled: true, note: "ndb confirm no command" };
  }
  try {
    const issued = await issueDocFromLine(ctx.admin, {
      command: { ...command, sendTo: null },
      // ใช้ messageId เดิมเสมอ เพื่อให้ issueDocFromLine dedupe ได้ตอน retry
      messageId: `ndb:${draftId}`,
      lineUserId: ctx.lineUserId,
      channelId: ctx.channelId,
      actorLabel: ctx.actorLabel,
      lineToken: ctx.lineToken,
      appOrigin: ctx.appOrigin,
      roomId: ctx.groupId,
    });
    await updateNdbDraft(ctx.admin, draftId, { status: "confirmed", documentNo: issued.docNo });
    const pending = await loadPendingFileDraft(ctx.admin, ctx.groupId, ctx.lineUserId);
    if (pending) await consumeFileDraft(ctx.admin, pending.id, issued.docNo);
    await ndbAudit(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: "quotation_issued",
      draftId,
      documentNo: issued.docNo,
      detail: { actor: ctx.actorLabel },
    });
    const doc = await findDocByNo(ctx, issued.docNo, "id, store_id");
    const docUrl = doc?.id ? ndbDocUrl(ctx.appOrigin, ctx.storeSlug, String(doc.id)) : null;
    const bundle = await countNdbBundleDocs(ctx.admin, ctx.storeId, issued.docNo);
    const showBundleBtn = ndbShouldShowBundleButton(bundle.total);
    const flexRef = `ndbflex:${issued.docNo}:${Date.now().toString(36)}`;
    await ndbAudit(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: "flex_issued_card",
      draftId,
      documentNo: issued.docNo,
      detail: {
        ref: flexRef,
        docType: "quotation",
        docTypeLabel: "ใบเสนอราคา",
        shopKey: ctx.shopKey,
        storeId: ctx.storeId,
        storeLabel: ctx.storeLabel,
        bundleCount: bundle.total,
        bundleSourceDocNo: bundle.sourceDocNo,
        bundleButton: showBundleBtn,
      },
    });
    console.log(`[ndb] issued flex ${flexRef} shop=${ctx.shopKey} store=${ctx.storeId ?? "-"} doc=${issued.docNo} bundleCount=${bundle.total} bundleButton=${showBundleBtn}`);
    await ctx.send([
      ndbFlexMessage(
        `สร้างเอกสารสำเร็จ ${issued.docNo}`,
        buildNdbIssuedFlex({
          shopKey: ctx.shopKey,
          storeLabel: ctx.storeLabel,
          appOrigin: ctx.appOrigin,
          docTypeLabel: "ใบเสนอราคา",
          docNo: issued.docNo,
          customerName: command.fields.customerName,
          project: command.fields.project,
          total: command.totals.total,
          actorLabel: ctx.actorLabel,
          docUrl,
          pdfUrl: issued.pdfUrl,
          bundleCount: bundle.total,
        }),
      ),
      {
        type: "text",
        text: buildNdbDoneSummaryText({
          docTypeLabel: "ใบเสนอราคา",
          docNo: issued.docNo,
          customerName: command.fields.customerName,
          total: command.totals.total,
          docUrl,
          pdfUrl: issued.pdfUrl ?? null,
        }),
      },
    ]);
    return { handled: true, note: `ndb quotation ${issued.docNo}` };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    // ปล่อยสิทธิ์จองคืน เพื่อให้กด “ยืนยัน” ซ้ำแล้ว retry ได้ (issueDocFromLine ยัง dedupe ด้วย messageId เดิม)
    await releaseNdbAction(ctx.admin, claimKey);
    await ndbAudit(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: "quotation_issue_failed",
      draftId,
      detail: { error: msg.slice(0, 200) },
    });
    await ctx.send([{ type: "text", text: `ออกใบเสนอราคาไม่สำเร็จค่ะ (${msg.slice(0, 120)})` }]);
    return { handled: true, note: "ndb confirm failed" };
  }
}

async function issueNextDoc(ctx: NdbContext, quotationNo: string, docType: string): Promise<NdbResult> {
  if (!isNdbNextDocAllowed(ctx.shopKey, docType)) {
    await ctx.send([
      {
        type: "text",
        text: `ร้านนี้ออกเอกสารชนิดนี้ไม่ได้ค่ะ\nเอกสารต่อเนื่องที่รองรับ: ${(NDB_NEXT_DOCS[ctx.shopKey] ?? [])
          .map((n) => n.label)
          .join(" · ")}`,
      },
    ]);
    await ndbAudit(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: "next_doc_rejected",
      documentNo: quotationNo,
      detail: { docType, shopKey: ctx.shopKey },
    });
    return { handled: true, note: `ndb next doc rejected ${docType}` };
  }
  const approved = await isQuotationApproved(ctx.admin, ctx.storeId, quotationNo);
  if (!approved) {
    await blockNextDoc(ctx);
    return { handled: true, note: "ndb next doc blocked (not approved)" };
  }
  const types = docType === "delivery_receipt" ? ["delivery_note", "receipt"] : [docType];
  const lines: string[] = [];
  let done = 0;
  let skipped = 0;
  for (const t of types) {
    // จองสิทธิ์แยกต่อชนิดเอกสาร — ถ้าใบส่งของสำเร็จแต่ใบเสร็จล้ม จะ retry เฉพาะใบที่ขาด
    const key = ndbActionKey({
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: `next:${t}`,
      ref: quotationNo,
    });
    const claim = await claimNdbAction(ctx.admin, key);
    if (claim === "duplicate") {
      skipped += 1;
      continue;
    }
    if (claim === "error") {
      lines.push(CLAIM_ERROR_TEXT);
      continue;
    }
    const res = await createNextDocFromQuotation(ctx.admin, {
      sourceDocNo: quotationNo,
      docType: t,
      storeId: ctx.storeId,
      storeLabel: ctx.storeLabel,
      actorUserId: null,
      createdSource: "line_doc_bot",
    });
    if (!res.ok) await releaseNdbAction(ctx.admin, key);
    else done += 1;
    if (res.ok && res.docNo) {
      lines.push(
        buildNdbDoneSummaryText({
          docTypeLabel: nextDocLabel(ctx.shopKey, t),
          docNo: res.docNo,
          sourceDocNo: quotationNo,
          docUrl: res.documentId ? ndbDocUrl(ctx.appOrigin, ctx.storeSlug, String(res.documentId)) : null,
          pdfUrl: res.pdfUrl ?? null,
        }),
      );
    } else {
      lines.push(res.message);
    }
    await ndbAudit(ctx.admin, {
      groupId: ctx.groupId,
      lineUserId: ctx.lineUserId,
      action: res.ok ? "next_doc_issued" : "next_doc_failed",
      documentNo: res.docNo ?? null,
      detail: { source: quotationNo, docType: t },
    });
  }
  if (!lines.length) {
    await ctx.send([{ type: "text", text: "เอกสารชุดนี้ออกครบแล้วค่ะ ไม่มีการออกใบซ้ำ" }, menuMsg(ctx)]);
    return { handled: true, note: "ndb next doc duplicate" };
  }
  await ctx.send([{ type: "text", text: lines.join("\n\n") }, menuMsg(ctx)]);
  return { handled: true, note: `ndb next doc ${docType} (${done} ใหม่, ${skipped} ข้าม)` };
}

/* ------------------------------- postback -------------------------------- */

export async function handleNdbPostback(ctx: NdbContext, data: string): Promise<NdbResult> {
  const pb = parseNdbPostback(data);
  if (!pb) return NOT_HANDLED;

  switch (pb.action) {
    case "menu":
      await ctx.send([menuMsg(ctx)]);
      return { handled: true, note: "ndb menu" };
    case "help":
      await ctx.send([{ type: "text", text: NDB_HELP_TEXT }, menuMsg(ctx)]);
      return { handled: true, note: "ndb help" };
    case "new_quote":
    case "more_info":
      await ctx.send([
        {
          type: "text",
          text: "ส่งข้อมูลงานเข้ามาได้เลยค่ะ (พิมพ์ข้อความ ส่งรูป หรือไฟล์ PDF/Word/Excel)\nตัวอย่าง: ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800",
        },
      ]);
      return { handled: true, note: "ndb ask info" };
    case "recent":
      await showRecent(ctx);
      return { handled: true, note: "ndb recent" };
    case "today":
      await showToday(ctx);
      return { handled: true, note: "ndb today" };
    case "search":
      await ctx.send([{ type: "text", text: "พิมพ์คำค้นได้เลยค่ะ เช่น “ค้นหา QT2026080002” หรือ “ค้นหา โรงเรียนบ้านนา”" }]);
      return { handled: true, note: "ndb search prompt" };
    case "show_draft": {
      const draft = pb.draftId ? await getNdbDraft(ctx.admin, pb.draftId) : null;
      if (!ndbDraftAllowed(draft, ctx.groupId, ctx.lineUserId)) {
        await ctx.send([{ type: "text", text: "ไม่พบร่างของคุณในกลุ่มนี้ค่ะ" }]);
        return { handled: true, note: "ndb draft not found" };
      }
      const cmd = draft!.payload?.command as DocBotCommand | undefined;
      if (!cmd) return { handled: true, note: "ndb draft empty" };
      await ctx.send([reviewMsg(ctx, draft!.id, cmd)]);
      return { handled: true, note: "ndb draft shown" };
    }
    case "preview": {
      const draft = pb.draftId ? await getNdbDraft(ctx.admin, pb.draftId) : null;
      if (!ndbDraftAllowed(draft, ctx.groupId, ctx.lineUserId)) {
        await ctx.send([{ type: "text", text: "ไม่พบร่างของคุณในกลุ่มนี้ค่ะ" }]);
        return { handled: true, note: "ndb preview denied" };
      }
      const cmd = draft!.payload?.command as DocBotCommand | undefined;
      if (!cmd) return { handled: true, note: "ndb preview empty" };
      // ตัวอย่างเอกสารแบบละเอียดจากข้อมูลร่าง — ยังไม่ออกเลขจริง
      await ctx.send([
        ndbFlexMessage(
          "ตัวอย่างเอกสาร (ยังไม่ออกเลข)",
          buildDocPreviewFlex(cmd, { storeLabel: ctx.storeLabel }),
        ),
        { type: "text", text: "นี่คือตัวอย่างเท่านั้น ยังไม่มีเลขเอกสารและยังไม่บันทึกเป็นเอกสารจริงค่ะ" },
      ]);
      return { handled: true, note: "ndb preview" };
    }
    case "edit":
      await ctx.send([
        {
          type: "text",
          text: "พิมพ์คำสั่งแก้ไขได้เลยค่ะ เช่น “แก้จำนวนป้ายจาก 2 เป็น 3 ผืน” · “เปลี่ยนราคาผืนละ 800” · “เพิ่มหมายเหตุ ส่งงานวันที่ 20 สิงหาคม”",
        },
      ]);
      return { handled: true, note: "ndb edit prompt" };
    case "cancel": {
      const draft = pb.draftId ? await getNdbDraft(ctx.admin, pb.draftId) : null;
      if (!ndbDraftAllowed(draft, ctx.groupId, ctx.lineUserId)) {
        await ctx.send([{ type: "text", text: "ไม่พบร่างของคุณในกลุ่มนี้ค่ะ" }]);
        return { handled: true, note: "ndb cancel denied" };
      }
      await updateNdbDraft(ctx.admin, draft!.id, { status: "cancelled" });
      await ndbAudit(ctx.admin, {
        groupId: ctx.groupId,
        lineUserId: ctx.lineUserId,
        action: "draft_cancelled",
        draftId: draft!.id,
      });
      await ctx.send([{ type: "text", text: "ยกเลิกร่างแล้วค่ะ ยังไม่มีการออกเลขเอกสารใด ๆ" }, menuMsg(ctx)]);
      return { handled: true, note: "ndb draft cancelled" };
    }
    case "confirm":
      if (!pb.draftId) return { handled: true, note: "ndb confirm no draft" };
      return await confirmDraft(ctx, pb.draftId);
    case "copy_link": {
      if (!pb.docNo) return { handled: true, note: "ndb copy no doc" };
      const doc = await findDocByNo(ctx, pb.docNo, "id, store_id");
      if (!doc) {
        await ctx.send([{ type: "text", text: "ไม่พบเอกสารนี้ในร้านของกลุ่มนี้ค่ะ" }]);
        return { handled: true, note: "ndb copy denied" };
      }
      await ctx.send([{ type: "text", text: ndbDocUrl(ctx.appOrigin, ctx.storeSlug, String(doc.id)) }]);
      return { handled: true, note: "ndb copy link" };
    }
    case "bundle": {
      if (!pb.docNo) return { handled: true, note: "ndb bundle no doc" };
      return await showBundle(ctx, pb.docNo);
    }
    case "revise":
      await ctx.send([
        {
          type: "text",
          text: `ต้องการแก้ไขใบเสนอราคาเลขที่ ${pb.docNo ?? "-"} ใช่ไหมคะ\nกรุณาแก้ไขผ่านระบบเอกสารในเว็บ ระบบจะบันทึกเป็นฉบับแก้ไข (revision) และต้องให้ลูกค้ายืนยันใหม่ก่อนออกเอกสารต่อเนื่อง`,
        },
      ]);
      return { handled: true, note: "ndb revise" };
    case "approve_ask":
      if (!pb.docNo) return { handled: true, note: "ndb approve no doc" };
      await ctx.send([
        ndbFlexMessage(
          "ยืนยันการอนุมัติ",
          buildNdbApproveConfirmFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel, docNo: pb.docNo }),
        ),
      ]);
      return { handled: true, note: "ndb approve ask" };
    case "approve_yes": {
      if (!pb.docNo) return { handled: true, note: "ndb approve no doc" };
      const doc = await findDocByNo(ctx, pb.docNo, "id, store_id, document_type");
      if (!doc || doc.document_type !== "quotation") {
        await ctx.send([{ type: "text", text: "ไม่พบใบเสนอราคานี้ในร้านของกลุ่มนี้ค่ะ" }]);
        return { handled: true, note: "ndb approve denied" };
      }
      await approveQuotation(ctx.admin, {
        storeId: ctx.storeId,
        quotationNo: pb.docNo,
        groupId: ctx.groupId,
        lineUserId: ctx.lineUserId,
      });
      await ndbAudit(ctx.admin, {
        groupId: ctx.groupId,
        lineUserId: ctx.lineUserId,
        action: "quotation_approved",
        documentNo: pb.docNo,
      });
      await ctx.send([
        ndbFlexMessage(
          "อนุมัติแล้ว",
          buildNdbApprovedFlex({ shopKey: ctx.shopKey, storeLabel: ctx.storeLabel, docNo: pb.docNo }),
        ),
      ]);
      return { handled: true, note: "ndb approved" };
    }
    case "next_doc":
      if (!pb.docNo || !pb.docType) return { handled: true, note: "ndb next doc missing ref" };
      return await issueNextDoc(ctx, pb.docNo, pb.docType);
    default:
      return { handled: true, note: `ndb unknown action ${pb.action}` };
  }
}

/* --------------------------------- text ---------------------------------- */

/**
 * ข้อความที่บอทไม่เข้าใจ → ตอบด้วย “เมนูหลัก NATTA DOC BOT” เสมอ
 * (คำสั่ง/การ์ดตัวช่วยชุดเก่าถูกถอดออกจากระบบแล้ว)
 */
async function fallbackMenu(ctx: NdbContext, note: string): Promise<NdbResult> {
  await ctx.send([menuMsg(ctx)]);
  return { handled: true, note };
}

export async function handleNdbText(ctx: NdbContext, rawText: string): Promise<NdbResult> {
  const text = String(rawText || "").trim();
  if (!text) return NOT_HANDLED;
  return await handleNdbTextInner(ctx, text);
}

/**
 * ห้องรันคิวที่เปิดคำสั่งเอกสารด้วย (ไม่ใช่ห้องเอกสารล้วน)
 * รับเฉพาะ “คำสั่งเอกสารที่ชัดเจน” เท่านั้น เพื่อไม่ให้ไปทับคำสั่งรันคิว/รับงานใหม่
 * คืนค่า null = ปล่อยให้ระบบคิวจัดการต่อ · string = ข้อความที่ส่งต่อให้บอทเอกสาร
 */
export async function ndbSharedRoomText(
  admin: any,
  groupId: string,
  lineUserId: string,
  rawText: string,
): Promise<string | null> {
  const text = String(rawText || "").trim();
  if (!text) return null;

  if (/^(เมนูเอกสาร|บอทเอกสาร|doc menu)$/i.test(text)) return "เมนู";
  if (/^(วิธีใช้เอกสาร|วิธีใช้บอทเอกสาร)$/i.test(text)) return "วิธีใช้งาน";
  if (/^(เอกสารล่าสุด|recent)$/i.test(text)) return text;
  if (/^(เอกสารวันนี้|today)$/i.test(text)) return text;
  if (/^(?:ค้นหาเอกสาร|search)\s*[:：]?\s*.+/i.test(text)) return text;
  if (parseNdbBundleTrigger(text)) return text;
  if (isNdbNewQuoteTrigger(text) || isNdbDeleteAttempt(text)) return text;
  if (parseNdbDirectNextDoc(text)) return text;

  // “ออกเอกสาร …” / “เอกสาร: …” = ขึ้นร่างใบเสนอราคาจากข้อความที่เหลือ
  const m = text.match(/^(?:ออกเอกสาร|ทำเอกสาร|เอกสาร)\s*[:：]?\s*([\s\S]+)$/);
  if (m) return m[1].trim();

  // มีร่างเอกสารค้างอยู่ของคนนี้ → รับคำสั่งแก้ไขร่างต่อได้
  if (parseDocEditCommand(text)) {
    const drafts = await listOpenNdbDrafts(admin, groupId, lineUserId);
    if (drafts.length) return text;
  }
  return null;
}

async function handleNdbTextInner(ctx: NdbContext, text: string): Promise<NdbResult> {

  if (isNdbMenuTrigger(text)) {
    await ctx.send([menuMsg(ctx)]);
    return { handled: true, note: "ndb menu" };
  }
  if (isNdbHelpTrigger(text)) {
    await ctx.send([{ type: "text", text: NDB_HELP_TEXT }, menuMsg(ctx)]);
    return { handled: true, note: "ndb help" };
  }
  if (isNdbDeleteAttempt(text)) {
    await ctx.send([{ type: "text", text: NDB_DELETE_BLOCKED }]);
    return { handled: true, note: "ndb delete blocked" };
  }
  if (isNdbRecentTrigger(text)) {
    await showRecent(ctx);
    return { handled: true, note: "ndb recent" };
  }
  if (isNdbTodayTrigger(text)) {
    await showToday(ctx);
    return { handled: true, note: "ndb today" };
  }
  const bundle = parseNdbBundleTrigger(text);
  if (bundle) {
    let docNo = bundle.docNo;
    if (!docNo) {
      const recent = await listRecentNdbDocs(ctx.admin, ctx.storeId, ctx.appOrigin, ctx.storeSlug, 1);
      docNo = recent[0]?.docNo ?? null;
    }
    if (!docNo) {
      await ctx.send([{ type: "text", text: "ยังไม่มีเอกสารในร้านนี้ให้รวมลิงก์ค่ะ" }]);
      return { handled: true, note: "ndb bundle empty" };
    }
    return await showBundle(ctx, docNo);
  }
  const kw = parseNdbSearchTrigger(text);
  if (kw) {
    await showSearch(ctx, kw);
    return { handled: true, note: "ndb search" };
  }
  if (isNdbNewQuoteTrigger(text)) {
    await ctx.send([
      { type: "text", text: "ส่งข้อมูลงานเข้ามาได้เลยค่ะ บอทจะทำร่างใบเสนอราคาให้ตรวจสอบก่อนออกเลขจริง" },
    ]);
    return { handled: true, note: "ndb new quote" };
  }

  // ออกใบส่งของ/ใบเสร็จตรง ๆ = บล็อก ต้องมีใบเสนอราคาที่อนุมัติก่อน
  if (parseNdbDirectNextDoc(text)) {
    await blockNextDoc(ctx);
    return { handled: true, note: "ndb direct next doc blocked" };
  }

  // มีร่างเปิดอยู่ของ “คนนี้” → รองรับคำสั่งแก้ไขภาษาธรรมชาติ
  const drafts = await listOpenNdbDrafts(ctx.admin, ctx.groupId, ctx.lineUserId);
  const patch = parseDocEditCommand(text);
  if (patch && drafts.length > 1) {
    await ctx.send([
      {
        type: "text",
        text: [
          "คุณมีร่างค้างอยู่หลายฉบับค่ะ ต้องการแก้ไขฉบับไหน",
          ...drafts.map((d, i) => {
            const c = d.payload?.command as DocBotCommand | undefined;
            return `${i + 1}) ${c?.fields?.customerName ?? "ไม่ระบุลูกค้า"} — ${c?.fields?.items?.length ?? 0} รายการ`;
          }),
        ].join("\n"),
      },
      ...drafts.map((d) => {
        const c = d.payload?.command as DocBotCommand | undefined;
        return c ? reviewMsg(ctx, d.id, c) : { type: "text", text: "ร่างว่าง" };
      }),
    ]);
    return { handled: true, note: "ndb draft ambiguous" };
  }
  if (patch && drafts.length === 1) {
    const current = drafts[0].payload?.command as DocBotCommand | undefined;
    if (current) {
      const edited = applyDocEditPatch(current, patch);
      const missing = computeDocBotMissing("quotation", edited.fields);
      const next: DocBotCommand = { ...edited, docType: "quotation", sendTo: null, missing };
      await updateNdbDraft(ctx.admin, drafts[0].id, { command: next, missing });
      await ndbAudit(ctx.admin, {
        groupId: ctx.groupId,
        lineUserId: ctx.lineUserId,
        action: "draft_edited",
        draftId: drafts[0].id,
      });
      await ctx.send(missing.length ? [missingMsg(ctx, missing, drafts[0].id)] : [reviewMsg(ctx, drafts[0].id, next)]);
      return { handled: true, note: "ndb draft edited" };
    }
  }

  // ข้อความงานใหม่ → ทำร่างใบเสนอราคา
  const cmd = buildQuotationCommand(text, ctx.shopKey);
  if (!cmd) return await fallbackMenu(ctx, "ndb fallback menu (no command)");
  const hasSignal = Boolean(cmd.fields.customerName || cmd.fields.items.length);
  if (!hasSignal) return await fallbackMenu(ctx, "ndb fallback menu (no signal)");
  const openDraft = drafts.length === 1 && !drafts[0].document_no ? drafts[0] : null;
  const mergedCmd = openDraft?.payload?.command
    ? (() => {
        const base = openDraft.payload.command as DocBotCommand;
        const merged = applyDocBotCarryOver(cmd, {
          customerName: base.fields.customerName,
          customerPhone: base.fields.customerPhone,
          customerAddress: base.fields.customerAddress,
          customerTaxId: base.fields.customerTaxId,
          project: base.fields.project,
          shopKey: ctx.shopKey,
          items: base.fields.items,
        });
        return { ...merged, docType: "quotation" as const, sendTo: null };
      })()
    : cmd;
  await upsertDraftAndReply(ctx, mergedCmd, openDraft?.id ?? null);
  return { handled: true, note: "ndb draft" };
}
