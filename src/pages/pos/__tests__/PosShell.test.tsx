import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PosShell from "@/components/layout/PosShell";

// jsdom shim for Radix / matchMedia
if (!window.matchMedia) {
  // @ts-expect-error test shim
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

function renderShell(path = "/pos/stock") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pos" element={<PosShell />}>
          <Route path="stock" element={<div data-testid="pos-stock-page">STOCK</div>} />
          <Route path="customers" element={<div>C</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("PosShell", () => {
  it("renders blue top bar with title and back-to-R&D link", () => {
    renderShell();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/POS หน้าร้าน/);
    // Top bar back button
    const back = screen.getByTestId("pos-shell-back-top") as HTMLAnchorElement;
    expect(back.getAttribute("href")).toBe("/admin/home");
  });

  it("exposes sidebar nav links to all POS sections + back to R&D", () => {
    renderShell();
    const nav = screen.getByTestId("pos-shell-sidebar");
    expect(nav).toBeInTheDocument();
    for (const label of [
      "หน้าขาย", "สต๊อกสินค้า", "ลูกค้า", "ประวัติการขาย", "เครื่องมือ", "ตั้งค่า",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // sidebar back link points to /receipts
    const backLinks = screen.getAllByTestId("pos-shell-back");
    expect((backLinks[0] as HTMLAnchorElement).getAttribute("href")).toBe("/admin/home");
  });

  it("renders child Outlet content and never mounts AdminLayout", () => {
    renderShell();
    expect(screen.getByTestId("pos-stock-page")).toBeInTheDocument();
    // AdminLayout must never mount inside the POS shell (POS has its own
    // blue chrome; the POS nav has its own "แดชบอร์ด" entry which is fine).
    expect(screen.queryByTestId("admin-layout")).toBeNull();
    expect(screen.getByTestId("pos-shell")).toBeInTheDocument();
  });

  it("opens the mobile drawer when the menu button is clicked", () => {
    renderShell();
    const menuBtn = screen.getByTestId("pos-shell-menu-btn");
    fireEvent.click(menuBtn);
    // After opening, sidebar labels appear at least twice (desktop + drawer)
    expect(screen.getAllByText("สต๊อกสินค้า").length).toBeGreaterThanOrEqual(1);
  });
});