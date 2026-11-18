import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ProductForm from "@/components/products/ProductForm";

// Silence PhotoBarcodeDialog (pulls camera/ZXing globals we don't need here).
vi.mock("@/components/PhotoBarcodeDialog", () => ({
  default: () => null,
}));

// Minimal supabase client mock — categories/stores empty, peek_next_fy_code no-op.
vi.mock("@/integrations/supabase/client", () => {
  const table = () => ({
    select() {
      return {
        order: async () => ({ data: [], error: null }),
      };
    },
  });
  return {
    supabase: {
      from: (_t: string) => table(),
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

/**
 * Parity: every entry point mounts the exact same set of core fields via
 * the shared ProductForm. This test locks in the testids so a page can't
 * silently hide or replace a field by wrapping the form differently.
 */
const CORE_TESTIDS = [
  "product-form",
  "pf-code",
  "pf-name",
  "pf-barcode",
  "pf-photo-barcode",
  "pf-save",
];

function assertCoreFields() {
  for (const id of CORE_TESTIDS) {
    expect(screen.getByTestId(id), `missing ${id}`).toBeInTheDocument();
  }
}

describe("ProductForm — field parity across entry points", () => {
  it("POS Quick Add shape (create, defaults) mounts all core fields + shops section", () => {
    render(<ProductForm mode="create" onSaved={() => {}} />);
    assertCoreFields();
    // Shops section header (default showShops=true).
    expect(screen.getByText(/ใช้กับร้าน/)).toBeInTheDocument();
  });

  it("Staff shape (create, showShops=false) mounts all core fields but hides shops", () => {
    render(
      <ProductForm mode="create" showShops={false} onSaved={() => {}} />,
    );
    assertCoreFields();
    expect(screen.queryByText(/ใช้กับร้าน/)).not.toBeInTheDocument();
  });

  it("Admin/PosStock shape (update + headerSlot + advancedSlot) keeps all core fields AND renders slots", () => {
    render(
      <ProductForm
        mode="update"
        productId="prod-1"
        initialValues={{ name: "existing" }}
        headerSlot={<div data-testid="admin-gallery">GALLERY</div>}
        advancedSlot={<div data-testid="advanced-sku">SKU</div>}
        onSaved={() => {}}
      />,
    );
    assertCoreFields();
    // Slots render in addition to (not instead of) canonical fields.
    expect(screen.getByTestId("admin-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("advanced-sku")).toBeInTheDocument();
    // Slot content must live inside the same product-form container.
    const form = screen.getByTestId("product-form");
    expect(within(form).getByTestId("admin-gallery")).toBeInTheDocument();
    expect(within(form).getByTestId("advanced-sku")).toBeInTheDocument();
  });
});