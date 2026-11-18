import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ScanResultCard, { SCAN_POPUP_AUTO_CLOSE_MS } from "../ScanResultCard";
import { toScanResultView, classifyScan, type ScanProductLike } from "../scanResult";

const product = (over: Partial<ScanProductLike> = {}): ScanProductLike => ({
  id: "p1",
  name: "ปากกาลูกลื่น สีน้ำเงิน 0.5 มม.",
  code: "FY-001",
  barcode: "8850001",
  standard_price: 12,
  stock: 9,
  unit: "ด้าม",
  image_url: "https://cdn.test/pen.jpg",
  active: true,
  has_variants: false,
  ...over,
});

const view = (p = product(), code = "8850001") =>
  toScanResultView(classifyScan(code, [p], []), 1);

describe("POS scan popup (large POS-style panel)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (props: Partial<React.ComponentProps<typeof ScanResultCard>> = {}) =>
    render(
      <ScanResultCard
        result={view()}
        cartQty={2}
        onDismiss={props.onDismiss ?? (() => {})}
        {...props}
      />,
    );

  it("renders a large panel: mobile bottom sheet, desktop ~480px, safe area, no overflow", () => {
    setup();
    const cls = screen.getByTestId("pos-scan-result").className;
    expect(cls).toContain("fixed");
    expect(cls).toContain("sm:w-[480px]");
    expect(cls).toContain("max-h-[50vh]");
    expect(cls).toContain("safe-area-inset-bottom");
    expect(cls).toContain("max-w-full");
    expect(cls).toContain("overflow-x-hidden");
  });

  it("shows a big product image, full name, code, price, stock and cart qty", () => {
    setup();
    const img = screen.getByTestId("pos-scan-result-image");
    expect(img.className).toContain("sm:h-[136px]");
    expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ปากกาลูกลื่น");
    expect(screen.getByTestId("pos-scan-result-code").textContent).toContain("8850001");
    expect(screen.getByTestId("pos-scan-result-price").textContent).toContain("12");
    expect(screen.getByTestId("pos-scan-result-stock").textContent).toContain("9");
    expect(screen.getByTestId("pos-scan-result-qty").textContent).toContain("เพิ่มลงตะกร้าแล้ว");
    expect(screen.getByTestId("pos-scan-result-cart-qty").textContent).toBe("2");
  });

  it("wires the +/− and remove buttons", () => {
    const onIncrease = vi.fn();
    const onDecrease = vi.fn();
    const onRemove = vi.fn();
    setup({ onIncrease, onDecrease, onRemove });
    fireEvent.click(screen.getByTestId("pos-scan-result-inc"));
    fireEvent.click(screen.getByTestId("pos-scan-result-dec"));
    fireEvent.click(screen.getByTestId("pos-scan-result-remove"));
    expect(onIncrease).toHaveBeenCalledTimes(1);
    expect(onDecrease).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("closes on X, Escape and outside tap", () => {
    const onDismiss = vi.fn();
    const { unmount } = setup({ onDismiss });
    fireEvent.click(screen.getByTestId("pos-scan-result-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("auto-closes after the timeout when idle", () => {
    const onDismiss = vi.fn();
    setup({ onDismiss });
    act(() => {
      vi.advanceTimersByTime(SCAN_POPUP_AUTO_CLOSE_MS + 50);
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("does not auto-close while the cashier is touching / adjusting quantity", () => {
    const onDismiss = vi.fn();
    setup({ onDismiss, onIncrease: () => {} });
    fireEvent.touchStart(screen.getByTestId("pos-scan-result"));
    act(() => {
      vi.advanceTimersByTime(SCAN_POPUP_AUTO_CLOSE_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("keeps the same large panel for unknown / disabled / out-of-stock states", () => {
    const unknown = toScanResultView(classifyScan("999999", [product()], []), 2);
    const { unmount } = render(
      <ScanResultCard result={unknown} cartQty={0} onDismiss={() => {}} />,
    );
    expect(screen.getByTestId("pos-scan-result").className).toContain("sm:w-[480px]");
    expect(screen.getByTestId("pos-scan-result-message").textContent).toContain("ไม่พบสินค้านี้");
    expect(screen.getByTestId("pos-scan-result-search")).toBeInTheDocument();
    expect(screen.getByTestId("pos-scan-result-add")).toBeInTheDocument();
    expect(screen.queryByTestId("pos-scan-result-inc")).toBeNull();
    unmount();

    const oos = toScanResultView(classifyScan("8850001", [product({ stock: 0 })], []), 3);
    render(<ScanResultCard result={oos} cartQty={0} onDismiss={() => {}} />);
    expect(screen.getByTestId("pos-scan-result").getAttribute("data-status")).toBe("unavailable");
    expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ปากกาลูกลื่น");
    expect(screen.getByTestId("pos-scan-result-message").textContent).toMatch(/หมดสต๊อก/);
  });
});
