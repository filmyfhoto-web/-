import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { POS_STORES, storeLabel, loadRegisterPrefs } from "@/pages/pos/posRegisterPrefs";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("mixed payment is not implemented and cannot become a cash sale", () => {
  const register = src("src/pages/pos/PosRegister.tsx");
  // the split button's own <button> element, wherever it sits in the toolbar
  const splitStart = register.indexOf('data-testid="pos-pay-split"');
  const split = register.slice(splitStart, register.indexOf("</button>", splitStart));

  it("the split-tender button is truly disabled", () => {
    expect(split).toContain("disabled");
  });

  it("the split-tender button has no click handler at all", () => {
    expect(split).not.toContain("onClick");
    expect(split).not.toContain("openPay");
  });

  it("the payment dialog offers only the four real tenders", () => {
    const dialog = src("src/pages/pos/PaymentCalculatorDialog.tsx");
    const methods = dialog.slice(dialog.indexOf("const METHODS"), dialog.indexOf("export type PosPayItem"));
    for (const k of ["cash", "qr", "transfer", "card"]) expect(methods).toContain(`key: "${k}"`);
    expect(methods).not.toContain("mixed");
    expect(methods).not.toContain("split");
  });
});

describe("active POS stores are the canonical two", () => {
  it("lists exactly colorlab + printing (Nattaworks retired)", () => {
    expect(POS_STORES.map((s) => s.key)).toEqual(["colorlab", "printing"]);
    expect(storeLabel("colorlab")).toBe("ร้านนัฐภรณ์ คัลเลอร์แล็ป");
    expect(storeLabel("printing")).toBe("ร้านนัฐภรณ์ การพิมพ์");
  });

  it("migrates retired/invented branch keys onto a real shop", () => {
    localStorage.setItem("pos.register.v1", JSON.stringify({ storeKey: "branch3", registerKey: "pos2" }));
    expect(loadRegisterPrefs()).toEqual({ storeKey: "colorlab", registerKey: "pos2" });
    localStorage.setItem("pos.register.v1", JSON.stringify({ storeKey: "nattaworks", registerKey: "pos1" }));
    expect(loadRegisterPrefs().storeKey).toBe("colorlab");
    localStorage.removeItem("pos.register.v1");
  });
});
