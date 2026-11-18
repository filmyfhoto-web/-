export type ConsentSnapshot = {
  termsVersion?: string | null;
  termsAt?: string | null;
  privacyVersion?: string | null;
  privacyAt?: string | null;
  capturedAt?: string | null;
} | null | undefined;

export function consentFooterLine(c: ConsentSnapshot): string {
  if (!c || (!c.termsVersion && !c.privacyVersion)) return "";
  const t = `terms=${c.termsVersion || "-"}@${c.termsAt || "-"}`;
  const p = `privacy=${c.privacyVersion || "-"}@${c.privacyAt || "-"}`;
  const cap = c.capturedAt ? ` captured=${c.capturedAt}` : "";
  return `# Consent: ${t} ${p}${cap}`;
}

export function toCsv(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    // Prevent spreadsheet formula injection (CWE-1236): prefix risky leading chars with `'`
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
    return safe;
  };
  const head = cols.join(",");
  const body = rows.map(r => cols.map(c => escape(r[c])).join(",")).join("\n");
  return head + "\n" + body;
}

export function downloadCsv(
  filename: string,
  rows: Record<string, any>[],
  columns?: string[],
  consent?: ConsentSnapshot,
  branding?: { storeName?: string; subtitle?: string },
) {
  let csv = toCsv(rows, columns);
  const footer = consentFooterLine(consent);
  if (footer) csv += `\n${footer}\n`;
  // Brand/watermark header (Excel/Sheets honors leading `#` lines as data,
  // but it makes provenance unambiguous and survives copy/paste).
  const brand = branding?.storeName || "นัฐภรณ์คัลเลอร์แล็ป & การพิมพ์ (Nattapron Color Lab & Printing)";
  const sub = branding?.subtitle || "";
  const header =
    `# ${brand}\n` +
    (sub ? `# ${sub}\n` : "") +
    `# Downloaded: ${new Date().toISOString()}\n`;
  csv = header + csv;
  // UTF-8 BOM so Excel/Google Sheets opens Thai correctly
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}