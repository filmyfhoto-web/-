import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => {
  const build = () => {
    const chain: any = {
      select: () => chain,
      is: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: [], error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: () => build(),
    },
  };
});

import CentralPOS from "../CentralPOS";

function renderPos() {
  return render(
    <MemoryRouter>
      <CentralPOS />
    </MemoryRouter>,
  );
}

describe("CentralPOS layout", () => {
  beforeEach(() => {
    // jsdom needs matchMedia (Radix Tooltip touches it)
    if (!window.matchMedia) {
      // @ts-expect-error - test shim
      window.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    }
  });

  it("renders the unified POS surface without a branch picker", () => {
    renderPos();
    expect(document.title).toMatch(/POS ขายหน้าร้าน/);
    expect(screen.getByTestId("pos-search")).toBeInTheDocument();
    // No branch picker text ever appears
    expect(screen.queryByText(/เลือกสาขา/)).toBeNull();
  });

  it("exposes search, categories, checkout panel, icon rail and mobile bar layout hooks", () => {
    renderPos();
    expect(screen.getByTestId("pos-search")).toBeInTheDocument();
    expect(screen.getByTestId("pos-categories")).toBeInTheDocument();
    expect(screen.getByTestId("pos-checkout-panel")).toBeInTheDocument();
    expect(screen.getByTestId("pos-mobile-bar")).toBeInTheDocument();
    expect(screen.getByTestId("pos-icon-rail")).toBeInTheDocument();
    expect(screen.getByTestId("pos-bottom-shortcuts")).toBeInTheDocument();
  });

  it("disables checkout while the cart is empty", () => {
    renderPos();
    const checkout = screen.getAllByTestId("pos-checkout")[0] as HTMLButtonElement;
    expect(checkout.disabled).toBe(true);
  });

  it("shows onboarding with add + full-stock CTAs when catalog is empty", async () => {
    renderPos();
    await waitFor(() => {
      expect(screen.getByTestId("pos-onboarding")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /ไม่มีสินค้าในสต๊อก/ })).toBeInTheDocument();
    const add = screen.getByTestId("pos-onboarding-add") as HTMLAnchorElement;
    expect(add.getAttribute("href")).toBe("/admin/products?quick=1");
    const full = screen.getByTestId("pos-onboarding-fullstock") as HTMLAnchorElement;
    expect(full.getAttribute("href")).toBe("/admin/products");
  });

  it("keeps scan / quick-add entry points in the toolbar at all times", () => {
    renderPos();
    expect(screen.getByTestId("pos-scan-open")).toBeInTheDocument();
    expect(screen.getByTestId("pos-quick-add-open")).toBeInTheDocument();
    const history = screen.getByTestId("pos-scan-history-link") as HTMLAnchorElement;
    expect(history.getAttribute("href")).toBe("/pos/scan-history");
  });
});