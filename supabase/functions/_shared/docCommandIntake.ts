/**
 * FILM SHOP — document commands arriving from LINE OA (text or audio).
 *
 * Always creates a DRAFT only: LINE can never issue a real document.
 * Idempotent on the LINE message id, and every step is written to
 * document_command_audit.
 */
import {
  parseDocCommand,
  computeDraftTotals,
  type DocCommandType,
} from "./docCommandParser.ts";

export interface DocCommandIntakeInput {
  messageId?: string | null;
  lineUserId?: string | null;
  displayName?: string | null;
  text: string;
  /** "line" for text messages, "line_audio" when transcribed from a voice note */
  source?: "line" | "line_audio";
  transcript?: string | null;
  now?: Date;
}

export interface DocCommandIntakeResult {
  duplicate: boolean;
  draftId?: string;
  docType: DocCommandType;
  missing: string[];
}

/** Download a LINE message's binary content (voice note) server-side. */
export async function fetchLineAudio(messageId: string, accessToken: string): Promise<Blob> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`line_content_${res.status}`);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: res.headers.get("content-type") ?? "audio/m4a" });
}

/** Thai transcription of a LINE voice note through the Lovable AI gateway. */
export async function transcribeLineAudio(audio: Blob, apiKey: string): Promise<string> {
  const type = (audio.type || "audio/m4a").split(";")[0];
  const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("wav") ? "wav" : "mp3";
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", audio, `line-voice.${ext}`);
  form.append("language", "th");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcription_failed_${res.status}`);
  return String((await res.json())?.text ?? "").trim();
}

export async function ingestDocCommand(
  admin: any,
  input: DocCommandIntakeInput,
): Promise<DocCommandIntakeResult> {
  const now = input.now ?? new Date();
  const fields = parseDocCommand(input.text, now);
  const totals = computeDraftTotals(fields.items, fields);
  const source = input.source ?? "line";

  if (input.messageId) {
    const { data: existing } = await admin
      .from("document_command_drafts")
      .select("id,doc_type,missing_fields")
      .eq("temp_ref", `line:${input.messageId}`)
      .maybeSingle();
    if (existing) {
      return {
        duplicate: true,
        draftId: existing.id,
        docType: existing.doc_type,
        missing: existing.missing_fields ?? [],
      };
    }
  }

  const { data, error } = await admin
    .from("document_command_drafts")
    .insert({
      temp_ref: input.messageId ? `line:${input.messageId}` : null,
      doc_type: fields.docType,
      shop_key: fields.shopKey,
      customer_name: fields.customerName ?? input.displayName ?? null,
      customer_phone: fields.customerPhone ?? null,
      customer_address: fields.customerAddress ?? null,
      customer_tax_id: fields.customerTaxId ?? null,
      project: fields.project ?? null,
      notes: fields.notes ?? null,
      discount: fields.discount,
      vat_mode: fields.vatMode,
      vat_rate: fields.vatRate,
      wht_rate: fields.whtRate,
      deposit: fields.deposit,
      payment_status: fields.paymentStatus,
      payment_method: fields.paymentMethod ?? null,
      due_at: fields.dueAtISO ?? null,
      subtotal: totals.subtotal,
      vat_amount: totals.vatAmount,
      wht_amount: totals.whtAmount,
      total: totals.total,
      missing_fields: fields.missing,
      status: "draft",
      source,
      transcript: input.transcript ?? input.text,
      raw_command: input.text.slice(0, 4000),
      parsed: fields as unknown as Record<string, unknown>,
      line_user_id: input.lineUserId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (String(error?.code) === "23505") {
      return { duplicate: true, docType: fields.docType, missing: fields.missing };
    }
    throw new Error(`doc command draft insert failed: ${error?.message}`);
  }

  await admin.from("document_command_audit").insert({
    draft_id: data.id,
    event: "line_command_received",
    detail: { missing: fields.missing, total: totals.total, doc_type: fields.docType },
    source,
    line_user_id: input.lineUserId ?? null,
    actor_label: input.displayName ?? null,
  });

  return { duplicate: false, draftId: data.id, docType: fields.docType, missing: fields.missing };
}