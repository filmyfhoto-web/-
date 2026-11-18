import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const PRODUCTS = [
  { id: "p1", name: "ปากกาน้ำเงิน", code: "P001", barcode: "8850001", standard_price: 20, stock: 10, unit: "ด้าม", image_url: null, active: true, deleted_at: null, has_variants: false },
  { id: "p2", name: "สมุด A5", code: "P002", barcode: "8850002", standard_price: 35, stock: 5, unit: "เล่ม", image_url: null, active: true, deleted_at: null, has_variants: false },
];

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { receipt_id: "r1", receipt_number: "R-0001" }, error: null })),
}));

const { PRODUCT_ROWS } = vi.hoisted(() => ({ PRODUCT_ROWS: [] as unknown[] }));

function table(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "is", "eq", "order"]) chain[m] = vi.fn(self);
  chain.limit = vi.fn(async () => ({ data: rows, error: null }));
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => table(t === "products" ? PRODUCT_ROWS : []),
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

PRODUCT_ROWS.push(...PRODUCTS);

async function setup() {
  const view = render(<MemoryRouter><PosRegister /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId("pos-scan-input")).toBeTruthy());
  await waitFor(() => expect(screen.getByText(/สแกนบาร์โค้ดเพื่อเริ่มขาย|ยังไม่มีรายการ/)).toBeTruthy());
  return view;
}

function scan(code: string) {
  const input = screen.getByTestId("pos-scan-input") as HTMLInputElement;
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: "Enter" });
}

/** Scan the same code again after the 120ms duplicate window has passed. */
function scanLater(code: string) {
  const base = Date.now();
  const spy = vi.spyOn(Date, "now").mockReturnValue(base + 5000);
  try {
    scan(code);
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => {
  rpc.mockClear();
  localStorage.clear();
});

describe("POS touch register", () => {
  it("adds a scanned barcode to the cart and totals it", async () => {
    await setup();
    scan("8850001");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    expect(screen.getByTestId("pos-item-count").textContent).toContain("1 รายการ");
    expect(screen.getByTestId("pos-net-total").textContent).toBe("20.00");
  });

  it("rejects an unknown barcode without adding a line", async () => {
    await setup();
    scan("does-not-exist");
    await waitFor(() => expect(screen.queryAllByTestId("pos-cart-row").length).toBe(0));
  });

  it("drops a duplicate beam of the same barcode inside the dedupe window", async () => {
    await setup();
    scan("8850001");
    scan("8850001");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    expect(screen.getByTestId("pos-line-qty").textContent).toBe("1");
  });

  it("merges a repeat scan, changes qty with +/- and removes the line", async () => {
    await setup();
    scan("8850001");
    scanLater("8850001");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    expect(screen.getByTestId("pos-line-qty").textContent).toBe("2");
    const row = screen.getAllByTestId("pos-cart-row")[0];
    fireEvent.click(within(row).getByLabelText("เพิ่มจำนวน"));
    expect(screen.getByTestId("pos-line-qty").textContent).toBe("3");
    fireEvent.click(within(row).getByLabelText("ลดจำนวน"));
    expect(screen.getByTestId("pos-line-qty").textContent).toBe("2");
    expect(screen.getByTestId("pos-net-total").textContent).toBe("40.00");
    fireEvent.click(within(row).getByLabelText("ลบรายการ"));
    await waitFor(() => expect(screen.queryAllByTestId("pos-cart-row").length).toBe(0));
  });

  it("sets qty from the numpad and applies a line discount", async () => {
    await setup();
    scan("8850002");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-key-4"));
    fireEvent.click(screen.getByTestId("pos-apply-entry"));
    expect(screen.getByTestId("pos-line-qty").textContent).toBe("4");
    expect(screen.getByTestId("pos-net-total").textContent).toBe("140.00");
    // switch the pad to discount mode → 40 off
    fireEvent.click(screen.getByTestId("pos-entry-mode"));
    fireEvent.click(screen.getByTestId("pos-key-4"));
    fireEvent.click(screen.getByTestId("pos-key-0"));
    fireEvent.click(screen.getByTestId("pos-apply-entry"));
    expect(screen.getByTestId("pos-net-total").textContent).toBe("100.00");
  });

  it("holds a bill and brings it back with the same lines", async () => {
    await setup();
    scan("8850001");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-park"));
    await waitFor(() => expect(screen.queryAllByTestId("pos-cart-row").length).toBe(0));
    expect(screen.getByTestId("pos-held-btn").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("pos-held-btn"));
    const restore = await screen.findByTestId(/^pos-parked-restore-/);
    fireEvent.click(restore);
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
  });

  it("commits exactly one sale per checkout and clears the cart", async () => {
    await setup();
    scan("8850001");
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    fireEvent.click(screen.getByTestId("pos-checkout"));
    const pad = await screen.findByTestId("pos-payment-calc");
    // pay exactly the due amount
    for (const k of ["2", "0"]) fireEvent.click(within(pad).getByRole("button", { name: k }));
    fireEvent.click(within(pad).getByTestId("pos-pay-confirm"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, payload] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("pos_checkout");
    expect(payload.p_items).toEqual([{ product_id: "p1", variant_id: null, qty: 1 }]);
    expect(String(payload.p_idempotency_key)).toMatch(/^pos-/);
    await waitFor(() => expect(screen.queryAllByTestId("pos-cart-row").length).toBe(0));
  });

  it("refuses to open payment on an empty cart", async () => {
    await setup();
    fireEvent.click(screen.getByTestId("pos-checkout"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
