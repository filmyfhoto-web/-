/**
 * อ่านข้อความจากไฟล์ Word (.docx) แบบไม่พึ่งไลบรารีภายนอก
 *
 * .docx = ไฟล์ zip ที่มี word/document.xml อยู่ข้างใน
 * ใช้ DecompressionStream("deflate-raw") ที่มีทั้งใน Deno และ Node/เบราว์เซอร์
 * (ทำงานฝั่งเซิร์ฟเวอร์เท่านั้น — ไม่รันโค้ด/มาโครใด ๆ ในไฟล์)
 */

export function isDocxFile(mime: string, fileName = ""): boolean {
  const m = String(mime || "").toLowerCase().split(";")[0];
  return (
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(String(fileName || ""))
  );
}

/** .doc รุ่นเก่า (binary) — อ่านไม่ได้อย่างน่าเชื่อถือ ต้องแจ้งให้แปลงไฟล์ */
export function isLegacyDocFile(mime: string, fileName = ""): boolean {
  const m = String(mime || "").toLowerCase().split(";")[0];
  const name = String(fileName || "");
  return (m === "application/msword" || /\.doc$/i.test(name)) && !isDocxFile(mime, name);
}

export function legacyDocMessage(fileName: string): string {
  return `ไฟล์ "${fileName}" เป็น Word รุ่นเก่า (.doc) ระบบอ่านไม่ได้อย่างแม่นยำ — กรุณาบันทึกเป็น .docx หรือ PDF แล้วแนบใหม่ (ระบบจะไม่เดาข้อมูลให้)`;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ดึงไฟล์เดียวออกจาก zip ตามชื่อ (คืน null ถ้าไม่พบ) */
export async function readZipEntry(zip: Uint8Array, entryName: string): Promise<Uint8Array | null> {
  // หา End Of Central Directory
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 66000; i--) {
    if (u32(zip, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);

  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (u32(zip, p) !== 0x02014b50) break;
    const method = u16(zip, p + 10);
    const compSize = u32(zip, p + 20);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const localOff = u32(zip, p + 42);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (name === entryName) {
      const lNameLen = u16(zip, localOff + 26);
      const lExtraLen = u16(zip, localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = zip.subarray(start, start + compSize);
      if (method === 0) return raw.slice();
      if (method === 8) return await inflateRaw(raw);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'",
};

/** WordprocessingML → ข้อความล้วน (ย่อหน้า = บรรทัด, ช่องตาราง = คั่นด้วยช่องว่าง) */
export function wordXmlToText(xml: string): string {
  const text = String(xml || "")
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
  return text
    .split("\n")
    .map((l) => l.replace(/\t+/g, " ").replace(/[ \u00a0]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .slice(0, 20000);
}

/** อ่านข้อความ (รวมตาราง) จากไฟล์ .docx */
export async function docxToText(bytes: Uint8Array): Promise<string> {
  const parts: string[] = [];
  for (const entry of ["word/document.xml", "word/header1.xml", "word/footer1.xml"]) {
    const raw = await readZipEntry(bytes, entry);
    if (!raw) continue;
    const txt = wordXmlToText(new TextDecoder().decode(raw));
    if (txt) parts.push(txt);
  }
  const out = parts.join("\n").trim();
  if (!out) throw new Error("docx_empty");
  return out.slice(0, 20000);
}
