import * as XLSX from "xlsx";
import type { ConsentSnapshot } from "./csv";
import { consentFooterLine } from "./csv";

export function downloadXlsx(
  filename: string,
  sheets: Record<string, any[]>,
  consent?: ConsentSnapshot,
  branding?: { storeName?: string; subtitle?: string },
) {
  const wb = XLSX.utils.book_new();
  const brand = branding?.storeName || "นัฐภรณ์คัลเลอร์แล็ป & การพิมพ์ (Nattapron Color Lab & Printing)";
  const sub = branding?.subtitle || "";
  wb.Props = { Title: brand, Subject: sub, Company: brand, CreatedDate: new Date() } as any;
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet([
      [brand],
      [sub ? sub : `Downloaded: ${new Date().toLocaleString()}`],
    ]);
    XLSX.utils.sheet_add_json(ws, rows.length ? rows : [{}], { origin: "A3" });
    const footer = consentFooterLine(consent);
    if (footer) {
      XLSX.utils.sheet_add_aoa(ws, [[footer]], { origin: -1 });
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}