/**
 * The printable receipt must tell the truth about failures and must never
 * print with partial data or create a new sale when reprinting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  headResult: { data: null as unknown, error: null as unknown },
  itemsResult: { data: [] as unknown, error: null as unknown },
}));
const rpc = state.rpc;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => (table === "pos_receipts" ? chain : Promise.resolve(state.itemsResult)),
        maybeSingle: () => Promise.resolve(state.headResult),
      } as Record<string, unknown> & { then?: unknown };
      return chain;
    },
  },
}));

import PosReceiptPrint from "../PosReceiptPrint";

const RECEIPT = {
  id: "r1", receipt_number: "POS-1", created_at: new Date().toISOString(), customer_name: null,
  payment_type: "cash", payment_status: "paid", subtotal: 100, discount: 0, total: 100,
  cash_received: 100, change_amount: 0, notes: null, cancelled_at: null, branch: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pos/receipt/r1?autoprint=0"]}>
      <Routes><Route path="/pos/receipt/:id" element={<PosReceiptPrint />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  state.headResult = { data: null, error: null };
  state.itemsResult = { data: [], error: null };
  window.print = vi.fn();
});

describe("PosReceiptPrint", () => {
  it("renders the receipt for an authorised user without calling any RPC", async () => {
    state.headResult = { data: RECEIPT, error: null };
    state.itemsResult = { data: [{ id: "i1", name: "ดินสอ", qty: 1, unit: "ด้าม", unit_price: 100, line_total: 100, variant_label: null }], error: null };
    renderPage();
    expect(await screen.findByTestId("receipt-body")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(window.print).not.toHaveBeenCalled(); // autoprint=0 → reprint never re-fires
  });

  it("reports a permission failure as denied, not as 'ไม่พบใบเสร็จ'", async () => {
    state.headResult = { data: null, error: { code: "42501", message: "permission denied for table pos_receipts" } };
    renderPage();
    const box = await screen.findByTestId("receipt-error");
    expect(box).toHaveAttribute("data-error", "denied");
    expect(screen.queryByText("ไม่พบใบเสร็จ")).toBeNull();
    expect(screen.getByTestId("receipt-relogin")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-retry")).toBeInTheDocument();
  });

  it("does not open a partial print when the line items fail to load", async () => {
    state.headResult = { data: RECEIPT, error: null };
    state.itemsResult = { data: null, error: { code: "42501", message: "permission denied for table pos_receipt_items" } };
    renderPage();
    await waitFor(() => expect(screen.getByTestId("receipt-error")).toHaveAttribute("data-error", "denied"));
    expect(screen.queryByTestId("receipt-body")).toBeNull();
  });

  it("keeps a schema/query error distinct from a missing bill", async () => {
    state.headResult = { data: null, error: { code: "42703", message: 'column "ghost" does not exist' } };
    renderPage();
    await waitFor(() => expect(screen.getByTestId("receipt-error")).toHaveAttribute("data-error", "query"));
  });

  it("shows a real not-found only when the query succeeded with no row", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("receipt-error")).toHaveAttribute("data-error", "not_found"));
    expect(screen.getByText("ไม่พบใบเสร็จ")).toBeInTheDocument();
  });

  it("always prints teacher, school, bill no., credit status and note for a ลงบัญชี bill", async () => {
    state.headResult = {
      data: {
        ...RECEIPT,
        payment_type: "credit",
        payment_status: "credit",
        customer_name: "ครูสมศรี",
        cash_received: null,
        change_amount: null,
        notes: "หน่วยงาน: โรงเรียนบ้านเชียงกลาง | หมายเหตุ: วางบิลสิ้นเดือน",
      },
      error: null,
    };
    state.itemsResult = { data: [{ id: "i1", name: "ดินสอ", qty: 1, unit: "ด้าม", unit_price: 100, line_total: 100, variant_label: null }], error: null };
    renderPage();
    const block = await screen.findByTestId("receipt-credit-block");
    expect(block).toHaveTextContent("บิลลงบัญชี");
    expect(screen.getByTestId("receipt-credit-number")).toHaveTextContent("POS-1");
    expect(screen.getByTestId("receipt-credit-teacher")).toHaveTextContent("ครูสมศรี");
    expect(screen.getByTestId("receipt-credit-org")).toHaveTextContent("โรงเรียนบ้านเชียงกลาง");
    expect(screen.getByTestId("receipt-credit-note")).toHaveTextContent("วางบิลสิ้นเดือน");
  });

  it("falls back to ไม่ระบุ so a credit bill never prints an empty field", async () => {
    state.headResult = {
      data: { ...RECEIPT, payment_type: "credit", payment_status: "credit", customer_name: null, notes: null, cash_received: null, change_amount: null },
      error: null,
    };
    state.itemsResult = { data: [{ id: "i1", name: "ดินสอ", qty: 1, unit: "ด้าม", unit_price: 100, line_total: 100, variant_label: null }], error: null };
    renderPage();
    expect(await screen.findByTestId("receipt-credit-teacher")).toHaveTextContent("ไม่ระบุ");
    expect(screen.getByTestId("receipt-credit-org")).toHaveTextContent("ไม่ระบุ");
    expect(screen.getByTestId("receipt-credit-note")).toHaveTextContent("หมายเหตุ: ไม่ระบุ");
  });
});
