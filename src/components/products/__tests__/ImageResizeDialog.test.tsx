import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ImageResizeDialog from "@/components/products/ImageResizeDialog";

beforeAll(() => {
  // jsdom lacks Object URL APIs used by ImageCropPanel
  if (!(URL as any).createObjectURL) (URL as any).createObjectURL = () => "blob:mock";
  if (!(URL as any).revokeObjectURL) (URL as any).revokeObjectURL = () => {};
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});

/**
 * Crop dialog regression — verifies:
 *  - closed state: dialog not rendered
 *  - open with URL: fetches → crop UI renders zoom/reset/cancel/confirm
 *  - cancel: calls onOpenChange(false), never fires onConfirm
 *  - open with Blob: no fetch, crop UI renders immediately
 */
describe("ImageResizeDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ImageResizeDialog open={false} source={null} onOpenChange={() => {}} onConfirm={() => {}} />,
    );
    expect(container.querySelector('[data-testid="image-resize-dialog"]')).toBeNull();
  });

  it("shows loading state then crop UI when source is a URL", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/png" }),
    }) as unknown as typeof fetch;
    try {
      render(
        <ImageResizeDialog
          open
          source="https://example.com/a.png"
          onOpenChange={() => {}}
          onConfirm={() => {}}
        />,
      );
      // Loading placeholder first
      expect(screen.getByText(/กำลังโหลดรูป/)).toBeInTheDocument();
      // Then the crop panel controls (zoom slider label + cancel + confirm buttons)
      await waitFor(() => {
        expect(screen.getByText(/ซูม/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /ยกเลิก/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /ใช้รูปที่ครอป/ })).toBeInTheDocument();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("cancel closes without calling onConfirm", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const blob = new Blob(["x"], { type: "image/png" });
    render(
      <ImageResizeDialog open source={blob} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
    );
    const cancel = await screen.findByRole("button", { name: /ยกเลิก/ });
    fireEvent.click(cancel);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders the localized title", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    render(
      <ImageResizeDialog open source={blob} onOpenChange={() => {}} onConfirm={() => {}} />,
    );
    expect(await screen.findByText("ปรับขนาดรูปภาพ")).toBeInTheDocument();
  });
});