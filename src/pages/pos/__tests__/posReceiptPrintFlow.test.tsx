/**
 * Printing must never bounce the user out of the app: no auto-print on
 * mount, no window.close, one print per gesture, and a working way back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const state = vi.hoisted(() => ({
  headResult: { data: null as unknown, error: null as unknown },
  itemsResult: { data: [] as unknown, error: null as unknown },
  navigate: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => (table === "pos_receipts" ? chain : Promise.resolve(state.itemsResult)),
        maybeSingle: () => Promise.resolve(state.headResult),
      } as Record<string, unknown>;
      return chain;
    },
  },
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => state.navigate };
});

import PosReceiptPrint, { shouldAutoPrint } from "../PosReceiptPrint";

const RECEIPT = {
  id: "r1", receipt_number: "POS-1", created_at: new Date().toISOString(), customer_name: null,
  payment_type: "cash", payment_status: "paid", subtotal: 100, discount: 0, total: 100,
  cash_received: 100, change_amount: 0, notes: null, cancelled_at: null, branch: null,
};

function renderPage(url = "/pos/receipt/r1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/pos/receipt/:id" element={<PosReceiptPrint />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.headResult = { data: RECEIPT, error: null };
  state.itemsResult = { data: [{ id: "i1", name: "ดินสอ", qty: 1, unit: "ด้าม", unit_price: 100, line_total: 100, variant_label: null }], error: null };
  state.navigate.mockReset();
  window.print = vi.fn();
  window.close = vi.fn();
});

describe("receipt print flow", () => {
  it("never auto-prints on mount by default", async () => {
    renderPage();
    await screen.findByTestId("receipt-body");
    await new Promise((r) => setTimeout(r, 60));
    expect(window.print).not.toHaveBeenCalled();
  });

  it("prints exactly once per click, after fonts are ready", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("receipt-print"));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
  });

  it("ignores a double click while a print is in flight", async () => {
    renderPage();
    const btn = await screen.findByTestId("receipt-print");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
  });

  it("offers navigation back instead of window.close", async () => {
    renderPage("/pos/receipt/r1?returnTo=%2Fpos%2Fhistory");
    const back = await screen.findByTestId("receipt-back-top");
    expect(back).toHaveTextContent("กลับประวัติ");
    fireEvent.click(back);
    expect(state.navigate).toHaveBeenCalledWith("/pos/history");
    expect(window.close).not.toHaveBeenCalled();
  });

  it("defaults the back target to /pos and rejects unsafe returnTo", async () => {
    renderPage("/pos/receipt/r1?returnTo=https%3A%2F%2Fevil.test");
    fireEvent.click(await screen.findByTestId("receipt-back-top"));
    expect(state.navigate).toHaveBeenCalledWith("/pos");
  });

  it("does not navigate or close after printing", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("receipt-print"));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    window.dispatchEvent(new Event("afterprint"));
    expect(state.navigate).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
    expect(screen.getByTestId("receipt-body")).toBeInTheDocument();
  });

  it("keeps the print button disabled until the receipt is loaded", async () => {
    state.headResult = { data: null, error: null };
    renderPage();
    await waitFor(() => expect(screen.getByTestId("receipt-error")).toBeInTheDocument());
    expect(screen.queryByTestId("receipt-print")).toBeNull();
  });
});

describe("shouldAutoPrint", () => {
  const desktop = { navigator: { userAgent: "Mozilla/5.0 (Macintosh)" }, matchMedia: () => ({ matches: false }) } as unknown as Window;
  const ios = { navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" }, matchMedia: () => ({ matches: false }) } as unknown as Window;
  const pwa = { navigator: { userAgent: "Mozilla/5.0 (Macintosh)" }, matchMedia: () => ({ matches: true }) } as unknown as Window;

  it("is off unless explicitly opted in", () => {
    expect(shouldAutoPrint(new URLSearchParams(""), desktop)).toBe(false);
    expect(shouldAutoPrint(new URLSearchParams("autoprint=0"), desktop)).toBe(false);
  });
  it("is allowed only on a desktop browser tab", () => {
    expect(shouldAutoPrint(new URLSearchParams("autoprint=1"), desktop)).toBe(true);
    expect(shouldAutoPrint(new URLSearchParams("autoprint=1"), ios)).toBe(false);
    expect(shouldAutoPrint(new URLSearchParams("autoprint=1"), pwa)).toBe(false);
  });
});
