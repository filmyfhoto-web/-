/**
 * Outbound attachment rules for the Film Shop Inbox.
 *
 * LINE Messaging API reality check (do NOT fabricate unsupported types):
 *   - `image` message: JPEG/PNG only, <= 10 MB, must be a plain HTTPS URL that
 *     LINE's servers can GET without auth. A short-lived signed URL works.
 *   - There is NO generic "file/document" push message type. PDFs, ZIPs and
 *     office files are therefore delivered as a secure, expiring download link
 *     inside a normal text message.
 */

export const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** LINE fetches the image immediately; keep the window tight. */
export const IMAGE_URL_TTL_SEC = 60 * 60;
/** The customer may open a document link later — but not forever. */
export const FILE_URL_TTL_SEC = 60 * 60 * 24 * 7;

export interface OutboundAttachmentInput {
  kind?: string;
  path?: string;
  name?: string;
  mime?: string;
  size?: number;
}

export interface NormalizedAttachment {
  kind: "image" | "file";
  path: string;
  name: string;
  mime: string;
  size: number;
}

export type ValidationResult =
  | { ok: true; items: NormalizedAttachment[] }
  | { ok: false; reason: string };

/** Strip directory tricks and control characters out of a display filename. */
export function sanitizeFileName(raw: unknown): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f<>"|?*]/g, "").trim();
  return (clean || "attachment").slice(0, 120);
}

/**
 * Attachments are uploaded by the client into the private bucket first; the
 * server only accepts paths inside this conversation's outbound prefix so one
 * staff request can never reference another thread's (or a customer's) files.
 */
export function outboundPrefix(conversationId: string): string {
  return `outbound/${conversationId}/`;
}

export function validateOutboundAttachments(
  conversationId: string,
  raw: unknown,
): ValidationResult {
  if (raw == null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) return { ok: false, reason: "attachment_invalid" };
  if (raw.length > 4) return { ok: false, reason: "attachment_too_many" };

  const prefix = outboundPrefix(conversationId);
  const items: NormalizedAttachment[] = [];

  for (const entry of raw as OutboundAttachmentInput[]) {
    const path = String(entry?.path ?? "");
    if (!path || !path.startsWith(prefix) || path.includes("..")) {
      return { ok: false, reason: "attachment_path_invalid" };
    }
    const mime = String(entry?.mime ?? "").toLowerCase().slice(0, 100);
    const size = Number(entry?.size ?? 0);
    if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: "attachment_size_invalid" };

    const isImage = IMAGE_MIMES.includes(mime);
    if (isImage) {
      if (size > MAX_IMAGE_BYTES) return { ok: false, reason: "attachment_image_too_large" };
    } else {
      if (size > MAX_FILE_BYTES) return { ok: false, reason: "attachment_file_too_large" };
    }
    items.push({
      kind: isImage ? "image" : "file",
      path,
      name: sanitizeFileName(entry?.name),
      mime: mime || "application/octet-stream",
      size,
    });
  }
  return { ok: true, items };
}

/**
 * Turn validated attachments into real LINE message objects.
 * Images become `image` messages; everything else becomes a link line that is
 * appended to the outgoing text — never a fake "file" message type.
 */
export async function buildLineAttachmentMessages(
  admin: any,
  items: NormalizedAttachment[],
): Promise<{ messages: unknown[]; linkLines: string[]; failed: string[] }> {
  const messages: unknown[] = [];
  const linkLines: string[] = [];
  const failed: string[] = [];
  const bucket = admin.storage.from("film-line-attachments");

  for (const item of items) {
    const ttl = item.kind === "image" ? IMAGE_URL_TTL_SEC : FILE_URL_TTL_SEC;
    const { data, error } = await bucket.createSignedUrl(item.path, ttl);
    const url = data?.signedUrl as string | undefined;
    if (error || !url) { failed.push(item.name); continue; }
    if (item.kind === "image") {
      messages.push({ type: "image", originalContentUrl: url, previewImageUrl: url });
    } else {
      linkLines.push(`📎 ${item.name}\n${url}`);
    }
  }
  return { messages, linkLines, failed };
}
