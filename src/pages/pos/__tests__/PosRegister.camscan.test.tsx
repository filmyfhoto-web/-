import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const PRODUCTS = [
  { id: "p1", name: "ปากกาน้ำเงิน", code: "P001", barcode: "8850001", standard_price: 20, stock: 10, unit: "ด้าม", image_url: null, active: true, deleted_at: null, has_variants: false },
];

function table(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "is", "eq", "order"]) chain[m] = vi.fn(self);
  chain.limit = vi.fn(async () => ({ data: rows, error: null }));
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => table(t === "products" ? PRODUCTS : []),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "cashier@shop.th" }, isOwner: false, isAdmin: false, isStaffAny: true, loading: false, hasPerm: () => true }),
  useAuthOptional: () => null,
}));
vi.mock("../scanFeedback", () => ({ beepOk: vi.fn(), beepFail: vi.fn(), flashOk: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

/** Camera/ZXing can't run in jsdom — stub the dialog with a decode trigger. */
vi.mock("@/components/PhotoBarcodeDialog", () => ({
  default: ({ open, onDecoded }: { open: boolean; onDecoded: (c: string) => void }) =>
    open ? (
      <button type="button" data-testid="stub-decode" onClick={() => onDecoded("8850001")}>
        decode
      </button>
    ) : null,
}));

import PosRegister from "../PosRegister";

describe("POS register — camera barcode scan (มือถือ/แท็บเล็ต)", () => {
  it("opens the camera scanner and adds the decoded product to the cart", async () => {
    render(<MemoryRouter><PosRegister /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("pos-scan-input")).toBeTruthy());

    const btn = screen.getByTestId("pos-cam-scan-btn");
    expect(btn).toBeTruthy();
    expect(screen.queryByTestId("stub-decode")).toBeNull();

    fireEvent.click(btn);
    fireEvent.click(await screen.findByTestId("stub-decode"));

    await waitFor(() => expect(screen.getAllByTestId("pos-cart-row").length).toBe(1));
    // dialog closes after a successful decode
    await waitFor(() => expect(screen.queryByTestId("stub-decode")).toBeNull());
  });
});
