/**
 * FILM SHOP — สร้างไฟล์ PDF ของเอกสารฝั่งเซิร์ฟเวอร์ แล้วอัปโหลดเพื่อแนบกลับในแชท LINE
 *
 * วิธีทำ: เรนเดอร์เอกสารเป็นพิกเซล (resvg) → ฝังเป็นภาพหน้าเดียวในไฟล์ PDF
 * (ไม่ต้องฝังฟอนต์ไทยใน PDF เพราะตัวอักษรถูกเรนเดอร์เป็นภาพแล้ว)
 */
import { renderDocRgba, type DocImageInput } from "./docImage.ts";

const encoder = new TextEncoder();

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** RGBA → RGB (ทับพื้นหลังขาว) */
function toRgb(pixels: Uint8Array): Uint8Array {
  const count = pixels.length / 4;
  const rgb = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = pixels[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const v = pixels[i * 4 + c] * a + 255 * (1 - a);
      rgb[i * 3 + c] = Math.round(v);
    }
  }
  return rgb;
}

/** สร้างไฟล์ PDF หน้าเดียวจากภาพเอกสาร (ขนาดหน้า A4 แนวตั้ง) */
export async function buildDocPdf(input: DocImageInput): Promise<Uint8Array> {
  const { width, height, pixels } = await renderDocRgba(input);
  const image = await deflate(toRgb(pixels));

  // จัดภาพให้พอดีความกว้าง A4 (595 x 842 pt) โดยคงสัดส่วน
  const pageW = 595.28;
  const margin = 18;
  const drawW = pageW - margin * 2;
  const drawH = (height / width) * drawW;
  const pageH = Math.max(841.89, drawH + margin * 2);
  const y = pageH - margin - drawH;

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
      "/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
  ];
  const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${margin.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q\n`;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    size += bytes.length;
  };
  push(encoder.encode("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n"));

  objects.forEach((body, i) => {
    offsets[i + 1] = size;
    push(encoder.encode(`${i + 1} 0 obj\n${body}\nendobj\n`));
  });

  offsets[4] = size;
  push(encoder.encode(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`));

  offsets[5] = size;
  push(
    encoder.encode(
      `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`,
    ),
  );
  push(image);
  push(encoder.encode("\nendstream\nendobj\n"));

  const xrefAt = size;
  const xref = [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...[1, 2, 3, 4, 5].map((i) => `${String(offsets[i]).padStart(10, "0")} 00000 n `),
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xrefAt),
    "%%EOF\n",
  ].join("\n");
  push(encoder.encode(xref));

  return concat(chunks);
}

/** อัปโหลด PDF ของเอกสารแล้วคืนลิงก์ที่เปิด/บันทึกได้จากแชท LINE */
export async function uploadDocPdf(
  admin: any,
  docNo: string,
  pdf: Uint8Array,
  expiresInSeconds = 60 * 60 * 24 * 30,
): Promise<{ path: string; url: string }> {
  const path = `${new Date().getUTCFullYear()}/pdf/${docNo}-${Date.now()}.pdf`;
  const up = await admin.storage.from("doc-images").upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) throw new Error(`doc_pdf_upload_failed: ${up.error.message}`);
  const signed = await admin.storage.from("doc-images").createSignedUrl(path, expiresInSeconds);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`doc_pdf_sign_failed: ${signed.error?.message ?? "no url"}`);
  }
  return { path, url: signed.data.signedUrl };
}
