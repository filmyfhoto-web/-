import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PosSaleSuccessDialog, { type PosSaleSuccess } from "../PosSaleSuccessDialog";

const sale: PosSaleSuccess = {
  receiptId: "rid-1",
  receiptNumber: "R2607-0042",
  total: 1234.5,
  cashReceived: 1500,
  change: 265.5,
  paymentLabel: "เงินสด",
  itemCount: 3,
};

function setup(overrides: Partial<Parameters<typeof PosSaleSuccessDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onPrint = vi.fn();
  const onView = vi.fn();
  render(
    <PosSaleSuccessDialog sale={sale} onClose={onClose} onPrint={onPrint} onView={onView} {...overrides} />,
  );
  return { onClose, onPrint, onView };
}

describe("PosSaleSuccessDialog", () => {
  it("shows the receipt number, total and change", () => {
    setup();
    expect(screen.getByTestId("success-receipt-number")).toHaveTextContent("R2607-0042");
    expect(screen.getByText("฿1,234.50")).toBeInTheDocument();
    expect(screen.getByTestId("success-change")).toHaveTextContent("฿265.50");
    expect(screen.getByText("3 รายการ")).toBeInTheDocument();
  });

  it("hides the cash rows for non-cash payments", () => {
    const onClose = vi.fn();
    render(
      <PosSaleSuccessDialog
        sale={{ ...sale, cashReceived: null, change: null, paymentLabel: "QR" }}
        onClose={onClose}
        onPrint={vi.fn()}
        onView={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("success-change")).toBeNull();
    expect(screen.getByText("QR")).toBeInTheDocument();
  });

  it("wires print, view and next-sale actions", () => {
    const { onClose, onPrint, onView } = setup();
    fireEvent.click(screen.getByTestId("success-print"));
    expect(onPrint).toHaveBeenCalledWith(sale);
    fireEvent.click(screen.getByTestId("success-view"));
    expect(onView).toHaveBeenCalledWith(sale);
    fireEvent.click(screen.getByTestId("success-next"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when there is no sale", () => {
    render(<PosSaleSuccessDialog sale={null} onClose={vi.fn()} onPrint={vi.fn()} onView={vi.fn()} />);
    expect(screen.queryByTestId("pos-sale-success")).toBeNull();
  });
});