import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { POS_STORES, loadRegisterPrefs } from "../posRegisterPrefs";
import { loadParkedBills } from "../parkedBills";

/**
 * Regression cover for the v1.1.7 production blockers of the touch register:
 * payment channel, fake split payment, VAT parity with `pos_checkout`,
 * real store names, unit-linked stock, variant picking and parked-bill fidelity.
 */

const PRODUCTS = [
  // ปากกา: wrapper (กล่อง) linked to base ด้าม at ratio 12
  { id: "box", name: "ปากกา (กล่อง 12)", code: "BOX", barcode: "8850100", standard_price: 200, stock: 0, unit: "กล่อง", image_url: null, active: true, deleted_at: null, has_variants: false },
  { id: "pen", name: "ปากกา (ด้าม)", code: "PEN", barcode: "8850101", standard_price: 20, stock: 18, unit: "ด้าม", image_url: null, active: true, deleted_at: null, has_variants: false },
  { id: "shirt", name: "เสื้อยืด", code: "SH", barcode: "8850200", standard_price: 150, stock: 9, unit: "ตัว", image_url: null, active: true, deleted_at: null, has_variants: true },
];

const VARIANTS = [
  { id: "v-m", product_id: "shirt", sku: "SH-M", barcode: "8850201", name: null, attributes: { ขนาด: "M" }, price: 150, price_override: null, stock: 4, active: true, archived_at: null, image_url: null },
  { id: "v-l", product_id: "shirt", sku: "SH-L", barcode: "8850202", name: null, attributes: { ขนาด: "L" }, price: 170, price_override: null, stock: 3, active: true, archived_at: null, image_url: null },
];

const LINKS = [{ id: "l1", wrapper_id: "box", base_id: "pen", ratio: 12, enabled: true }];

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { receipt_id: "r1", receipt_number: "R-0001" }, error: null })),
}));

function table(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "is", "eq", "order"]) chain[m] = vi.fn(self);
  chain.limit = vi.fn(async () => ({ data: rows, error: null }));
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) =>
      table(t === "products" ? PRODUCTS : t === "product_variants" ? VARIANTS : t === "product_unit_links" ? LINKS : []),
    rpc,
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "cashier@shop.th" }, isOwner: false, isAdmin: false, isStaffAny: true, loading: false, hasPerm: () => true }),
  useAuthOptional: () => null,
}));
vi.mock("../scanFeedback", () => ({ beepOk: vi.fn(), beepFail: vi.fn(), flashOk: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import PosRegister from "../PosRegister";

async function setup() {
  const view = render(<MemoryRouter><PosRegister /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId("pos-scan-input")).toBeTruthy());
  await waitFor(() => expect(screen.getByText(/ยังไม่มีรายการ|สแกนบาร์โค้ด/)).toBeTruthy());
  return view;
}

function scan(code: string, skewMs = 0) {
  const spy = skewMs ? vi.spyOn(Date, "now").mockReturnValue(Date.now() + skewMs) : null;
  try {
    const input = screen.getByTestId("pos-scan-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: code } });
    fireEvent.keyDown(input, { key: "Enter" });
  } finally {
    spy?.mockRestore();
  }
}

beforeEach(() => {
  rpc.mockClear();
  localStorage.clear();
});

describe("POS register — production blockers", () => {
  it("keeps the chosen payment channel instead of resetting to cash", async () => {
    await setup();
    scan("8850101");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-pay-transfer"));
    const pad = await screen.findByTestId("pos-payment-calc");
    fireEvent.click(within(pad).getByTestId("pos-pay-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [, payload] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(payload.p_payment_type).toBe("transfer");
  });

  it("does not offer a working split payment (warns instead of committing)", async () => {
    await setup();
    scan("8850101");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    const split = screen.getByTestId("pos-pay-split");
    // Hardened: a real `disabled` button with no handler, so it can never
    // fall through to a cash sale.
    expect((split as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(split);
    expect(screen.queryByTestId("pos-payment-calc")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("charges exactly what pos_checkout charges — VAT is extracted, never added", async () => {
    localStorage.setItem("pos.settings.v1", JSON.stringify({ vatEnabled: true, vatRate: 7, vatIncluded: false }));
    await setup();
    scan("8850101"); // 20.00
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    expect(screen.getByTestId("pos-net-total").textContent).toBe("20.00");
    fireEvent.click(screen.getByTestId("pos-checkout"));
    const pad = await screen.findByTestId("pos-payment-calc");
    for (const k of ["2", "0"]) fireEvent.click(within(pad).getByRole("button", { name: k }));
    fireEvent.click(within(pad).getByTestId("pos-pay-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [, payload] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    // backend total = sum(price*qty) - p_discount = 20 → matches the display
    expect(Number(payload.p_discount)).toBe(0);
  });

  it("uses the real shops only and commits the branch with the sale", async () => {
    expect(POS_STORES.map((s) => s.label)).toEqual([
      "ร้านนัฐภรณ์ คัลเลอร์แล็ป",
      "ร้านนัฐภรณ์ การพิมพ์",
    ]);
    expect(POS_STORES.some((s) => /สาขา 2|สาขา 3/.test(s.label))).toBe(false);
    await setup();
    scan("8850101");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-checkout"));
    const pad = await screen.findByTestId("pos-payment-calc");
    for (const k of ["2", "0"]) fireEvent.click(within(pad).getByRole("button", { name: k }));
    fireEvent.click(within(pad).getByTestId("pos-pay-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [, payload] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(payload.p_branch).toBe("ร้านนัฐภรณ์ คัลเลอร์แล็ป");
    expect(String(payload.p_notes)).toContain("หน้าร้าน");
  });

  it("migrates legacy invented branch keys onto real shops", () => {
    localStorage.setItem("pos.register.v1", JSON.stringify({ storeKey: "branch3", registerKey: "pos2" }));
    expect(loadRegisterPrefs()).toEqual({ storeKey: "colorlab", registerKey: "pos2" });
  });

  it("opens the variant picker for an SKU product and sells the picked variant", async () => {
    await setup();
    scan("8850200"); // parent barcode → must ask which size
    const picker = await screen.findByTestId("pos-variant-picker");
    fireEvent.click(within(picker).getByTestId("pos-variant-opt-v-l"));
    fireEvent.click(within(picker).getByTestId("pos-variant-confirm"));
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    expect(screen.getByTestId("pos-net-total").textContent).toBe("170.00");
  });

  it("hides the desktop rail on phones and shows a sticky mobile action bar", async () => {
    await setup();
    const panel = screen.getByTestId("pos-numpad-panel");
    // rail is desktop-only; portrait phones use the sticky bar + numpad sheet
    expect(panel.className).toContain("hidden");
    expect(panel.className).toContain("lg:flex");
    const bar = screen.getByTestId("pos-mobile-actions");
    expect(bar.className).toContain("lg:hidden");
    expect(screen.getByTestId("pos-mobile-checkout").textContent).toContain("ชำระเงิน");
    expect(screen.getByTestId("pos-mobile-park")).toBeTruthy();
    // the sheet is closed until asked for → no duplicate numpad test ids
    expect(screen.queryByTestId("m-pos-key-1")).toBeNull();
    fireEvent.click(screen.getByTestId("pos-mobile-pad-open"));
    const sheet = await screen.findByTestId("pos-mobile-pad");
    expect(sheet.className).toContain("max-h-[100dvh]");
    expect(within(sheet).getByTestId("m-pos-key-1")).toBeTruthy();
    expect(within(sheet).getByTestId("pos-mobile-pad-done")).toBeTruthy();
  });

  it("shows the selected real store as the title and settings name only as subtitle", async () => {
    localStorage.setItem("pos.settings.v1", JSON.stringify({ storeName: "ชื่อธุรกิจในตั้งค่า" }));
    await setup();
    expect(screen.getByTestId("pos-store-name").textContent).toBe("ร้านนัฐภรณ์ คัลเลอร์แล็ป");
    expect(screen.getByTestId("pos-store-subtitle").textContent).toBe("ชื่อธุรกิจในตั้งค่า");
  });

  it("guards numpad quantity entry with the same aggregate stock check as +/-", async () => {
    await setup();
    scan("8850100"); // กล่อง = 12 ด้าม
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    scan("8850101"); // ด้าม
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(2));
    // select the wrapper line and type qty 2 (24 ด้าม + 1 = 25 > 18 in stock)
    fireEvent.click(screen.getAllByTestId("pos-cart-row")[0]);
    fireEvent.click(screen.getByTestId("pos-key-2"));
    fireEvent.click(screen.getByTestId("pos-apply-entry"));
    const qtys = screen.getAllByTestId("pos-line-qty").map((n) => n.textContent);
    expect(qtys).toEqual(["1", "1"]);
  });

  it.each([
    ["cash", "pos-checkout"],
    ["transfer", "pos-pay-transfer"],
    ["qr", "pos-pay-qr"],
    ["card", "pos-pay-card"],
  ])("sends p_payment_type=%s to pos_checkout", async (type, testid) => {
    await setup();
    scan("8850101");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId(testid));
    const pad = await screen.findByTestId("pos-payment-calc");
    if (type === "cash") for (const k of ["2", "0"]) fireEvent.click(within(pad).getByRole("button", { name: k }));
    fireEvent.click(within(pad).getByTestId("pos-pay-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [, payload] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(payload.p_payment_type).toBe(type);
    if (type === "cash") expect(Number(payload.p_cash_received)).toBe(20);
    else expect(payload.p_cash_received).toBeNull();
  });

  it("blocks a unit-linked wrapper once aggregate base stock runs out (stock guard)", async () => {
    await setup();
    scan("8850100"); // 1 กล่อง = 12 ด้าม (base stock 18)
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    const row = screen.getAllByTestId("pos-cart-row")[0];
    fireEvent.click(within(row).getByLabelText("เพิ่มจำนวน")); // 24 > 18 → blocked
    expect(screen.getByTestId("pos-line-qty").textContent).toBe("1");
  });

  it("applies คูปอง/ส่วนลด as a bill-wide discount, not a line discount", async () => {
    await setup();
    scan("8850101"); // 20
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    scan("8850200"); // shirt parent → pick M (150)
    const picker = await screen.findByTestId("pos-variant-picker");
    fireEvent.click(within(picker).getByTestId("pos-variant-opt-v-m"));
    fireEvent.click(within(picker).getByTestId("pos-variant-confirm"));
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(2));
    expect(screen.getByTestId("pos-net-total").textContent).toBe("170.00");

    fireEvent.click(screen.getByTestId("pos-bill-discount"));
    for (const k of ["5", "0"]) fireEvent.click(screen.getByTestId(`pos-key-${k}`));
    fireEvent.click(screen.getByTestId("pos-apply-entry"));

    // whole bill discounted by 50, no single line clamped it
    expect(screen.getByTestId("pos-net-total").textContent).toBe("120.00");
    expect(screen.getAllByTestId("pos-line-qty").map((n) => n.textContent)).toEqual(["1", "1"]);
    expect(screen.getAllByText(/ส่วนลดท้ายบิล/).length).toBeGreaterThan(0);
  });

  it("parks a bill with its line discount, channel and till intact", async () => {
    await setup();
    scan("8850101");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-source-shopee"));
    fireEvent.click(screen.getByTestId("pos-entry-mode"));
    fireEvent.click(screen.getByTestId("pos-key-5"));
    fireEvent.click(screen.getByTestId("pos-apply-entry"));
    fireEvent.click(screen.getByTestId("pos-park"));
    await waitFor(() => expect(screen.queryAllByTestId("pos-cart-row").length).toBe(0));
    const [bill] = loadParkedBills();
    expect(bill.lines[0].discount).toBe(5);
    expect(bill.source).toBe("shopee");
    expect(bill.store_key).toBe("colorlab");
    fireEvent.click(screen.getByTestId("pos-held-btn"));
    const restore = await screen.findByTestId(/^pos-parked-restore-/);
    fireEvent.click(restore);
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    expect(screen.getByTestId("pos-net-total").textContent).toBe("15.00");
    expect(screen.getByTestId("pos-source-shopee").getAttribute("aria-pressed")).toBe("true");
  });

  it("records a ลงบัญชี bill with credit status and the cashier's note", async () => {
    await setup();
    scan("8850101");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-pay-credit"));
    const pad = await screen.findByTestId("pos-payment-calc");
    expect(within(pad).getByTestId("pos-pay-credit-panel")).toBeTruthy();
    fireEvent.change(within(pad).getByTestId("pos-pay-note"), { target: { value: "รอวางบิลสิ้นเดือน" } });
    fireEvent.click(within(pad).getByTestId("pos-pay-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [, payload] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(payload.p_payment_type).toBe("credit");
    expect(payload.p_payment_status).toBe("credit");
    expect(String(payload.p_notes)).toContain("หมายเหตุ: รอวางบิลสิ้นเดือน");
  });
});
