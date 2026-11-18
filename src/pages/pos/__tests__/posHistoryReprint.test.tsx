/**
 * Reprinting from history must be a plain same-tab navigation: no popup,
 * no checkout RPC, no stock mutation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ navigate: vi.fn(), rpc: vi.fn(), update: vi.fn() }));

const ROW = {
  id: "r9", receipt_number: "POS-9", created_at: new Date().toISOString(), total: 50,
  subtotal: 50, discount: 0, payment_type: "cash", payment_status: "paid",
  cancelled_at: null, customer_name: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: state.rpc,
    from: () => {
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        gte: () => chain,
        eq: () => Promise.resolve({ data: [], error: null }),
        update: state.update.mockReturnValue({ eq: () => Promise.resolve({ error: null }) }),
        then: (res: any) => Promise.resolve({ data: [ROW], error: null }).then(res),
      };
      return chain;
    },
  },
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => state.navigate };
});

import PosHistory from "../PosHistory";

beforeEach(() => {
  state.navigate.mockReset();
  state.rpc.mockReset();
  state.update.mockReset();
  window.open = vi.fn();
});

describe("PosHistory reprint", () => {
  it("navigates same-tab to the preview with returnTo=/pos/history", async () => {
    render(<MemoryRouter><PosHistory /></MemoryRouter>);
    const btn = await screen.findByTestId("pos-history-print-r9");
    fireEvent.click(btn);
    expect(state.navigate).toHaveBeenCalledWith(
      "/pos/receipt/r9?returnTo=%2Fpos%2Fhistory",
      { state: { returnTo: "/pos/history" } },
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it("never triggers checkout or stock mutations when reprinting", async () => {
    render(<MemoryRouter><PosHistory /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId("pos-history-print-r9"));
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
});
