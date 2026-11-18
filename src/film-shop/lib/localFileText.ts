/**
 * อ่าน "ข้อความ" ออกจากไฟล์แบบ deterministic ในเครื่องเท่านั้น
 * - ไม่มีการเรียกเครือข่าย / LLM / OCR ที่คิดเครดิต
 * - รองรับ: .xlsx/.xls (xlsx), .docx (jszip + XML), .csv/.txt/text/*, .pdf ที่มีชั้นข้อความ
 * - ไฟล์อื่น (รูป, PDF สแกน, .ai/.psd, .doc เก่า) จะคืนค่าว่าง เพื่อให้ผู้เรียก fallback ให้กรอกเอง
 */

export const LOCAL_TEXT_EXTENSIONS = ['pdf', 'xlsx', 'xlsm', 'xls', 'docx', 'csv', 'txt'] as const;

export const fileExt = (name: string) => (name.split('.').pop() || '').toLowerCase();

/** ไฟล์นี้พอจะอ่านข้อความในเครื่องได้ไหม (ไม่รับประกันว่าจะเจอข้อความ) */
export function canReadLocally(file: { name: string; type?: string }): boolean {
  const ext = fileExt(file.name);
  if ((LOCAL_TEXT_EXTENSIONS as readonly string[]).includes(ext)) return true;
  return (file.type || '').startsWith('text/');
}

type PdfTextItem = { str?: unknown; transform?: number[] };

/** รวม text item ของ pdf.js เป็น "บรรทัด" ตามพิกัดแนวตั้ง (บนลงล่าง) */
export function pdfItemsToText(items: PdfTextItem[]): string {
  const rows = new Map<number, string[]>();
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = Math.round((it.transform?.[5] ?? 0) / 3);
    const arr = rows.get(y) ?? [];
    arr.push(it.str);
    rows.set(y, arr);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.join('').replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Excel → ข้อความแบบ CSV ต่อชีต (ทุกชีต) */
export async function readXlsxText(data: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
  return wb.SheetNames
    .map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }))
    .join('\n')
    .trim();
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

/** Word (.docx) → ข้อความ โดยอ่าน word/document.xml ตรง ๆ (ไม่มี network) */
export async function readDocxText(data: ArrayBuffer): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(data);
  const entry = zip.file('word/document.xml');
  if (!entry) return '';
  const xml = await entry.async('string');
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;|&#x?[0-9a-fA-F]+;/g, (m) => {
      if (XML_ENTITIES[m]) return XML_ENTITIES[m];
      const num = /^&#x/i.test(m) ? parseInt(m.slice(3, -1), 16) : parseInt(m.slice(2, -1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    })
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function readPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist');
  try {
    // worker แบบ bundle ในโปรเจกต์ (ไม่ดึงจาก CDN / ไม่มี network)
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = '';
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += `${pdfItemsToText(content.items as PdfTextItem[])}\n`;
  }
  return out.trim();
}

/** อ่านข้อความจากไฟล์ — คืน '' เมื่ออ่านไม่ได้ (ให้ผู้เรียกไป fallback กรอกเอง) */
export async function readLocalFileText(file: File): Promise<string> {
  const ext = fileExt(file.name);
  if (ext === 'pdf') return readPdfText(await file.arrayBuffer());
  if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') return readXlsxText(await file.arrayBuffer());
  if (ext === 'docx') return readDocxText(await file.arrayBuffer());
  if (ext === 'csv' || ext === 'txt' || (file.type || '').startsWith('text/')) {
    return (await file.text()).trim();
  }
  return '';
}
