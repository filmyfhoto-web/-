import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductForm from "@/components/products/ProductForm";

/**
 * The camera → barcode wiring lives inside the shared ProductForm, so
 * every entry point inherits it automatically. This test proves clicking
 * the camera icon opens the dialog and that a decoded value flows back
 * into the barcode input.
 */

// Stub the dialog with a controlled sentinel that exposes onDecoded.
vi.mock("@/components/PhotoBarcodeDialog", () => ({
  default: ({
    open,
    onDecoded,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onDecoded: (raw: string) => void;
  }) =>
    open ? (
      <div data-testid="photo-dialog">
        <button
          data-testid="photo-dialog-decode"
          onClick={() => onDecoded("8850001234567")}
        >
          decode
        </button>
      </div>
    ) : null,
}));

// supabase mock — barcode dedupe query returns no dupe.
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select() { return chain; },
    order: async () => ({ data: [], error: null }),
    eq() { return chain; },
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    supabase: {
      from: () => chain,
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

describe("ProductForm — photo/barcode widget parity", () => {
  it("opening the camera dialog and decoding writes into the barcode input", async () => {
    render(<ProductForm mode="create" showShops={false} onSaved={() => {}} />);

    // Dialog closed initially.
    expect(screen.queryByTestId("photo-dialog")).not.toBeInTheDocument();

    // Click the camera icon (same testid across every entry point).
    fireEvent.click(screen.getByTestId("pf-photo-barcode"));
    expect(await screen.findByTestId("photo-dialog")).toBeInTheDocument();

    // Simulate a successful decode → the barcode field should update.
    fireEvent.click(screen.getByTestId("photo-dialog-decode"));
    const barcode = await screen.findByTestId("pf-barcode");
    expect((barcode as HTMLInputElement).value).toBe("8850001234567");
  });
});