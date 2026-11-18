// Per-store barcode normalization rules.
// Rules apply to any code arriving from scanner/camera/manual before lookup.

export type BarcodeRules = {
  stripPrefix: string;
  stripSuffix: string;
  allowedLengths: number[]; // empty = any length
  caseMode: "asis" | "upper" | "lower";
  trim: boolean;
};

export const DEFAULT_RULES: BarcodeRules = {
  stripPrefix: "",
  stripSuffix: "",
  allowedLengths: [],
  caseMode: "asis",
  trim: true,
};

const KEY_PREFIX = "pos.barcodeRules.";
const GLOBAL_KEY = `${KEY_PREFIX}__global__`;

export function rulesKey(storeId?: string | null): string {
  return storeId ? `${KEY_PREFIX}${storeId}` : GLOBAL_KEY;
}

export function loadBarcodeRules(storeId?: string | null): BarcodeRules {
  if (typeof window === "undefined") return DEFAULT_RULES;
  try {
    const raw = window.localStorage.getItem(rulesKey(storeId));
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_RULES,
      ...parsed,
      allowedLengths: Array.isArray(parsed.allowedLengths)
        ? parsed.allowedLengths
            .map((n: unknown) => Number(n))
            .filter((n: number) => Number.isFinite(n) && n > 0)
        : [],
    };
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveBarcodeRules(rules: BarcodeRules, storeId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(rulesKey(storeId), JSON.stringify(rules));
  } catch {
    /* noop */
  }
}

/** Normalize a raw barcode using the rules. Returns null if the code
 *  fails the length filter (caller should treat as "invalid"). */
export function normalizeBarcode(raw: string, rules: BarcodeRules): string | null {
  let code = raw ?? "";
  if (rules.trim) code = code.trim();
  if (rules.stripPrefix && code.startsWith(rules.stripPrefix)) {
    code = code.slice(rules.stripPrefix.length);
  }
  if (rules.stripSuffix && code.endsWith(rules.stripSuffix)) {
    code = code.slice(0, code.length - rules.stripSuffix.length);
  }
  if (rules.caseMode === "upper") code = code.toUpperCase();
  else if (rules.caseMode === "lower") code = code.toLowerCase();
  if (rules.allowedLengths.length > 0 && !rules.allowedLengths.includes(code.length)) {
    return null;
  }
  return code;
}