/**
 * Deterministic document-number seeds for the "delivery + receipt companion"
 * regression suite. Centralising the constants keeps fixtures, unit tests and
 * Playwright snapshots in sync so changes to numbering scheme are caught.
 */

export const FIXED_DELIVERY_NO = "DN-2026-000001";
export const FIXED_RECEIPT_NO = "RC-2026-000001";
export const FIXED_INVOICE_NO = "INV-2026-000001";

/** Snippet injected into a Playwright page to freeze Date / randomUUID. */
export const COMPANION_SEED_INIT = `
  const FIXED = new Date("2026-01-15T03:00:00.000Z").getTime();
  const OrigDate = Date;
  // @ts-ignore
  Date = class extends OrigDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED); else super(...args);
    }
    static now() { return FIXED; }
  };
  let __c = 0;
  if (window.crypto) {
    window.crypto.randomUUID = () => {
      __c += 1;
      return "00000000-0000-4000-8000-" + String(__c).padStart(12, "0");
    };
  }
`;

/**
 * In-process seeder used by Node-side unit tests. Returns a restore() callback
 * so individual tests can opt-in without leaking globals.
 */
export function seedDocNumberGenerator(): { restore: () => void; nextInvoice: () => string; nextReceipt: () => string; nextDelivery: () => string } {
  let inv = 0, rec = 0, dn = 0;
  return {
    restore: () => { inv = 0; rec = 0; dn = 0; },
    nextInvoice: () => `INV-2026-${String(++inv).padStart(6, "0")}`,
    nextReceipt: () => `RC-2026-${String(++rec).padStart(6, "0")}`,
    nextDelivery: () => `DN-2026-${String(++dn).padStart(6, "0")}`,
  };
}