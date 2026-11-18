import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/lib/orderActivity", async () => {
  const actual = await vi.importActual<any>("@/lib/orderActivity");
  return {
    ...actual,
    fetchOrderActivity: vi.fn(() => Promise.resolve([
      { id: "1", action: "order_export_csv", detail: { filename: "a.csv" }, created_at: new Date().toISOString(), user_id: null, user_email: null },
      { id: "2", action: "order_export_xlsx", detail: { filename: "a.xlsx" }, created_at: new Date().toISOString(), user_id: null, user_email: null },
      { id: "3", action: "order_pdf_download", detail: { filename: "a.pdf" }, created_at: new Date().toISOString(), user_id: null, user_email: null },
      { id: "4", action: "order_ack", detail: null, created_at: new Date().toISOString(), user_id: null, user_email: null },
    ])),
  };
});

import OrderActivityTimeline from "../OrderActivityTimeline";

describe("OrderActivityTimeline filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by download document type", async () => {
    render(<OrderActivityTimeline orderId="o1" />);
    await waitFor(() => expect(screen.getByText("รับทราบคำสั่งซื้อ")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("timeline-filter"), { target: { value: "downloads" } });
    expect(screen.queryByText("รับทราบคำสั่งซื้อ")).not.toBeInTheDocument();
    expect(screen.getByText("ดาวน์โหลด CSV")).toBeInTheDocument();
    expect(screen.getByText("ดาวน์โหลด Excel")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("timeline-filter"), { target: { value: "xlsx" } });
    expect(screen.getByText("ดาวน์โหลด Excel")).toBeInTheDocument();
    expect(screen.queryByText("ดาวน์โหลด CSV")).not.toBeInTheDocument();
  });
});
