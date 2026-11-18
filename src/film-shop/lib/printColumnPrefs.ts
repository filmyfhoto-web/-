/**
 * จดจำคอลัมน์ที่เลือกแสดงในหน้าพิมพ์เอกสาร
 * - ค่าเริ่มต้นระบบ (SYSTEM_DEFAULTS) แยกตามประเภทเอกสาร
 * - เทมเพลตของผู้ใช้ต่อประเภทเอกสาร (ใบสั่งจ้าง/ใบเสร็จ ฯลฯ)
 * - ค่าที่เลือกไว้ต่อเอกสารแต่ละใบ (จำเลขที่เอกสาร)
 */
export type DocKind = 'quotation' | 'invoice' | 'receipt' | 'other';

export interface ColumnPrefs {
  showPricePerSqm: boolean;
  showArea: boolean;
  showPricePerPiece: boolean;
}

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  quotation: 'ใบเสนอราคา',
  invoice: 'ใบสั่งจ้าง / ใบวางบิล',
  receipt: 'ใบเสร็จรับเงิน',
  other: 'เอกสารทั่วไป',
};

/** ค่าเริ่มต้นของระบบ — ใบเสร็จเน้นสั้น ใบสั่งจ้างแสดงรายละเอียดครบ */
export const SYSTEM_DEFAULTS: Record<DocKind, ColumnPrefs> = {
  quotation: { showPricePerSqm: true, showArea: true, showPricePerPiece: true },
  invoice: { showPricePerSqm: true, showArea: true, showPricePerPiece: true },
  receipt: { showPricePerSqm: false, showArea: false, showPricePerPiece: true },
  other: { showPricePerSqm: true, showArea: true, showPricePerPiece: true },
};

const TEMPLATE_KEY = 'film_shop_print_col_templates_v1';
const DOC_KEY = 'film_shop_print_col_docs_v1';
const MAX_DOCS = 300;

const sanitize = (raw: unknown, fallback: ColumnPrefs): ColumnPrefs => {
  const o = (raw ?? {}) as Partial<ColumnPrefs>;
  return {
    showPricePerSqm: typeof o.showPricePerSqm === 'boolean' ? o.showPricePerSqm : fallback.showPricePerSqm,
    showArea: typeof o.showArea === 'boolean' ? o.showArea : fallback.showArea,
    showPricePerPiece: typeof o.showPricePerPiece === 'boolean' ? o.showPricePerPiece : fallback.showPricePerPiece,
  };
};

const readMap = (key: string): Record<string, unknown> => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const writeMap = (key: string, value: Record<string, unknown>) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage disabled */ }
};

/** เทมเพลตของผู้ใช้ต่อประเภทเอกสาร (ถ้ายังไม่เคยตั้ง = ค่าระบบ) */
export function loadTemplate(kind: DocKind): ColumnPrefs {
  return sanitize(readMap(TEMPLATE_KEY)[kind], SYSTEM_DEFAULTS[kind]);
}

export function saveTemplate(kind: DocKind, prefs: ColumnPrefs) {
  const map = readMap(TEMPLATE_KEY);
  map[kind] = sanitize(prefs, SYSTEM_DEFAULTS[kind]);
  writeMap(TEMPLATE_KEY, map);
}

export function clearTemplate(kind: DocKind) {
  const map = readMap(TEMPLATE_KEY);
  delete map[kind];
  writeMap(TEMPLATE_KEY, map);
}

export function hasTemplate(kind: DocKind): boolean {
  return Object.prototype.hasOwnProperty.call(readMap(TEMPLATE_KEY), kind);
}

const docKey = (kind: DocKind, docNumber: string) => `${kind}:${docNumber}`;

/** ค่าที่เลือกไว้ของเอกสารใบนั้น — ถ้ายังไม่เคยเลือกจะได้เทมเพลตของประเภทนั้น */
export function loadDocPrefs(kind: DocKind, docNumber?: string | null): ColumnPrefs {
  const template = loadTemplate(kind);
  if (!docNumber) return template;
  const stored = readMap(DOC_KEY)[docKey(kind, docNumber)];
  return stored ? sanitize(stored, template) : template;
}

export function saveDocPrefs(kind: DocKind, docNumber: string | null | undefined, prefs: ColumnPrefs) {
  if (!docNumber) return;
  const map = readMap(DOC_KEY);
  map[docKey(kind, docNumber)] = sanitize(prefs, SYSTEM_DEFAULTS[kind]);
  const keys = Object.keys(map);
  if (keys.length > MAX_DOCS) keys.slice(0, keys.length - MAX_DOCS).forEach((k) => delete map[k]);
  writeMap(DOC_KEY, map);
}

export function clearDocPrefs(kind: DocKind, docNumber?: string | null) {
  if (!docNumber) return;
  const map = readMap(DOC_KEY);
  delete map[docKey(kind, docNumber)];
  writeMap(DOC_KEY, map);
}

export function samePrefs(a: ColumnPrefs, b: ColumnPrefs): boolean {
  return a.showPricePerSqm === b.showPricePerSqm
    && a.showArea === b.showArea
    && a.showPricePerPiece === b.showPricePerPiece;
}
