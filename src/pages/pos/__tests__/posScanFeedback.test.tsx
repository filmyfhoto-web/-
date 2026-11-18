import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { PRODUCTS, VARIANTS } = vi.hoisted(() => ({
  PRODUCTS: [
  { id: "p1", name: "ปากกาลูกลื่น", code: "FY-001", barcode: "8850001", category_id: null,
    standard_price: 12, stock: 10, unit: "ด้าม", image_url: "https://cdn.test/pen.jpg",
    active: true, deleted_at: null, has_variants: false },
  { id: "p2", name: "สมุดโน้ต", code: "FY-002", barcode: "8850002", category_id: null,
    standard_price: 30, stock: 20, unit: "เล่ม", image_url: null,
    active: true, deleted_at: null, has_variants: true },
  { id: "p3", name: "ยางลบหมดสต๊อก", code: "FY-003", barcode: "8850003", category_id: null,
    standard_price: 5, stock: 0, unit: "ก้อน", image_url: null,
    active: true, deleted_at: null, has_variants: false },
  ],
  VARIANTS: [
  { id: "v1", product_id: "p2", sku: "SKU-A4", barcode: "8859001", name: null,
    attributes: { ขนาด: "A4" }, price: null, price_override: 35, stock: 4,
    active: true, archived_at: null, image_url: "https://cdn.test/a4.jpg" },
  { id: "v2", product_id: "p2", sku: "SKU-A5", barcode: "8859002", name: null,
    attributes: { ขนาด: "A5" }, price: null, price_override: 25, stock: 6,
    active: true, archived_at: null, image_url: null },
  ],
}));

vi.mock("@/integrations/supabase/client", () => {
  const data: Record<string, unknown[]> = {
    products: PRODUCTS,
    product_variants: VARIANTS,
    categories: [],
  };
  const build = (table: string) => {
    const rows = data[table] ?? [];
    const res = { data: rows, error: null };
    const chain: any = {
      select: () => chain,
      is: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(res),
      then: (r: any, j: any) => Promise.resolve(res).then(r, j),
    };
    return chain;
  };
  return { supabase: { from: (t: string) => build(t) } };
});

import CentralPOS from "../CentralPOS";

function renderPos() {
  return render(
    <MemoryRouter>
      <CentralPOS />
    </MemoryRouter>,
  );
}

/** Type a code into the POS search box and press Enter (scanner wedge path). */
async function scan(code: string) {
  const input = screen.getByTestId("pos-search") as HTMLInputElement;
  await act(async () => {
    input.focus();
    fireEvent.change(input, { target: { value: code } });
    fireEvent.keyDown(input, { key: "Enter" });
  });
  // Clear the "same physical beam" de-dup window between distinct scans.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
}

const card = () => screen.getByTestId("pos-scan-result");

describe("POS scanned-product feedback", () => {
  beforeEach(() => {
    if (!window.matchMedia) {
      // @ts-expect-error test shim
      window.matchMedia = () => ({
        matches: false, addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
      });
    }
    // AudioContext / vibrate used by scan feedback
    // @ts-expect-error test shim
    window.AudioContext = window.AudioContext || function () {
      return { createOscillator: () => ({ connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0 } }), createGain: () => ({ connect: () => {}, gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }), destination: {}, currentTime: 0, close: () => {} };
    };
    window.localStorage.clear();
  });

  it("shows image, name, code and price for a normal product scan and adds it to the cart", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(card()).toBeInTheDocument());
    expect(card().getAttribute("data-status")).toBe("added");
    expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ปากกาลูกลื่น");
    expect(screen.getByTestId("pos-scan-result-code").textContent).toContain("8850001");
    expect(screen.getByTestId("pos-scan-result-price").textContent).toContain("12");
    const img = screen.getByTestId("pos-scan-result-image-img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.test/pen.jpg");
    expect(screen.getByTestId("pos-scan-result-qty").textContent).toContain("1");
  });

  it("increments exactly once per repeated scan", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await scan("8850001");
    await scan("8850001");
    await waitFor(() =>
      expect(screen.getByTestId("pos-scan-result-qty").textContent).toContain("3"),
    );
  });

  it("adds the exact SKU variant without opening the picker, using the variant image", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8859001");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("added"));
    expect(screen.getByTestId("pos-scan-result-sku").textContent).toContain("SKU-A4");
    expect(screen.getByTestId("pos-scan-result-attrs").textContent).toContain("A4");
    expect(screen.getByTestId("pos-scan-result-price").textContent).toContain("35");
    expect((screen.getByTestId("pos-scan-result-image-img") as HTMLImageElement).src).toContain("a4.jpg");
    expect(screen.queryByTestId("pos-variant-product-name")).toBeNull();
  });

  it("opens the variant picker with product image and name for a parent code", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850002");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("variant_required"));
    await waitFor(() =>
      expect(screen.getByTestId("pos-variant-product-name").textContent).toContain("สมุดโน้ต"),
    );
    expect(screen.getByTestId("pos-variant-product-image")).toBeInTheDocument();
  });

  it("falls back to the stationery placeholder when no image exists", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8859002");
    await waitFor(() => expect(card()).toBeInTheDocument());
    const img = screen.getByTestId("pos-scan-result-image");
    expect(img.getAttribute("data-placeholder")).toBe("1");
    expect(screen.queryByTestId("pos-scan-result-image-img")).toBeNull();
    expect(img.textContent).toBeTruthy();
  });

  it("shows a Thai error with the scanned code for an unknown barcode and leaves the cart untouched", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(screen.getByTestId("pos-scan-result-qty")).toBeInTheDocument());
    await scan("0000000404");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("not_found"));
    const msg = screen.getByTestId("pos-scan-result-message").textContent || "";
    expect(msg).toContain("0000000404");
    expect(msg).toMatch(/ไม่พบสินค้า/);
    expect(screen.queryByTestId("pos-scan-result-qty")).toBeNull();
  });

  it("warns in Thai for an out-of-stock product and shows its name", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850003");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("unavailable"));
    expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ยางลบหมดสต๊อก");
    expect(screen.getByTestId("pos-scan-result-message").textContent).toMatch(/หมดสต๊อก/);
    expect(screen.queryByTestId("pos-scan-result-qty")).toBeNull();
  });

  it("processes rapid consecutive scans reliably and shows only the latest result", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await scan("8859001");
    await scan("8850001");
    await waitFor(() => expect(screen.getAllByTestId("pos-scan-result")).toHaveLength(1));
    expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ปากกาลูกลื่น");
    expect(screen.getByTestId("pos-scan-result-qty").textContent).toContain("2");
  });

  it("keeps focus in the scan input after a scan", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    const input = screen.getByTestId("pos-search");
    await scan("8850001");
    await waitFor(() => expect(document.activeElement).toBe(input));
    await scan("0000000404");
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("renders image + name in the result at mobile and desktop widths", async () => {
    for (const w of [360, 1440]) {
      window.innerWidth = w;
      window.dispatchEvent(new Event("resize"));
      const view = renderPos();
      await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
      await scan("8850001");
      await waitFor(() => expect(screen.getByTestId("pos-scan-result-image")).toBeVisible());
      expect(screen.getByTestId("pos-scan-result-name")).toBeVisible();
      view.unmount();
    }
  });
  it("shows a cart thumbnail and full product name, never only the code", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(screen.getByTestId("pos-cart-line-name")).toBeInTheDocument());
    expect(screen.getByTestId("pos-cart-line-name").textContent).toBe("ปากกาลูกลื่น");
    const thumb = screen.getByTestId("pos-cart-thumb");
    expect(thumb.getAttribute("data-placeholder")).toBe("0");
    expect(
      (screen.getByTestId("pos-cart-thumb-img") as HTMLImageElement).getAttribute("src"),
    ).toBe("https://cdn.test/pen.jpg");
  });

  it("falls back to an initials placeholder in the cart when the product has no image", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8859002");
    await waitFor(() => expect(screen.getByTestId("pos-cart-thumb")).toBeInTheDocument());
    expect(screen.getByTestId("pos-cart-thumb").getAttribute("data-placeholder")).toBe("1");
    expect(screen.queryByTestId("pos-cart-thumb-img")).toBeNull();
  });

  it("highlights the freshly scanned cart row", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid^="pos-cart-line-p1"]')?.getAttribute("data-highlight"),
      ).toBe("1"),
    );
  });

  it("keeps one cart row when the same barcode is scanned repeatedly", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await scan("8850001");
    expect(screen.getAllByTestId("pos-cart-line-name")).toHaveLength(1);
  });

  it("shows remaining stock on the scan card", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() =>
      expect(screen.getByTestId("pos-scan-result-stock").textContent).toContain("10"),
    );
  });

  it("offers search / add-product actions for an unknown barcode without clearing the cart", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(screen.getByTestId("pos-cart-line-name")).toBeInTheDocument());
    await scan("0000000404");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("not_found"));
    expect(screen.getByTestId("pos-scan-result-search")).toBeInTheDocument();
    expect(screen.getByTestId("pos-scan-result-add")).toBeInTheDocument();
    expect(screen.getByTestId("pos-cart-line-name").textContent).toBe("ปากกาลูกลื่น");
  });

  it("counts one physical beam once even when two listeners fire", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    const input = screen.getByTestId("pos-search") as HTMLInputElement;
    await act(async () => {
      input.focus();
      fireEvent.change(input, { target: { value: "8850001" } });
      // Same beam observed twice back-to-back (wedge + input handler).
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.change(input, { target: { value: "8850001" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await waitFor(() => expect(screen.getByTestId("pos-scan-result-qty")).toBeInTheDocument());
    expect(screen.getByTestId("pos-scan-result-qty").textContent).toContain("1");
  });

  it("does not overflow horizontally at 320px", async () => {
    window.innerWidth = 320;
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(card()).toBeInTheDocument());
    expect(card().className).toContain("max-w-full");
    expect(card().className).toContain("overflow-x-hidden");
  });
  it("keeps thumbnail and name after quantity changes and re-adding a removed line", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(screen.getByTestId("pos-cart-thumb")).toBeInTheDocument());
    // qty +1 then -1 must not drop the image/name
    await scan("8850001");
    expect(screen.getByTestId("pos-cart-line-name").textContent).toBe("ปากกาลูกลื่น");
    expect(
      (screen.getByTestId("pos-cart-thumb-img") as HTMLImageElement).getAttribute("src"),
    ).toBe("https://cdn.test/pen.jpg");
    // remove and scan again -> thumbnail + name come back
    await act(async () => {
      fireEvent.click(screen.getByTestId("pos-cart-remove"));
    });
    expect(screen.queryByTestId("pos-cart-line-name")).toBeNull();
    await scan("8850001");
    await waitFor(() => expect(screen.getByTestId("pos-cart-line-name")).toBeInTheDocument());
    expect(
      (screen.getByTestId("pos-cart-thumb-img") as HTMLImageElement).getAttribute("src"),
    ).toBe("https://cdn.test/pen.jpg");
  });

  it("uses the variant image, then the parent image, then the placeholder in the cart", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8859001"); // variant with its own image
    await scan("8850001"); // parent image only
    await scan("8859002"); // no image anywhere
    await waitFor(() => expect(screen.getAllByTestId("pos-cart-thumb")).toHaveLength(3));
    const thumbs = screen.getAllByTestId("pos-cart-thumb");
    const srcs = thumbs.map(
      (t) => t.querySelector("img")?.getAttribute("src") ?? `placeholder:${t.getAttribute("data-placeholder")}`,
    );
    expect(srcs).toEqual([
      "https://cdn.test/a4.jpg",
      "https://cdn.test/pen.jpg",
      "placeholder:1",
    ]);
  });

  it("shows a full, readable product name with an accessible tooltip", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850001");
    await waitFor(() => expect(screen.getByTestId("pos-cart-line-name")).toBeInTheDocument());
    expect(screen.getByTestId("pos-cart-line-name").getAttribute("title")).toBe("ปากกาลูกลื่น");
    expect(screen.getByTestId("pos-scan-result-name").getAttribute("title")).toBe("ปากกาลูกลื่น");
  });

  it("does not add an out-of-stock item and still shows its name", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("8850003");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("unavailable"));
    expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ยางลบหมดสต๊อก");
    expect(screen.queryByTestId("pos-cart-line-name")).toBeNull();
  });

  it("uses the exact Thai not-found wording with the scanned code", async () => {
    renderPos();
    await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
    await scan("7770001");
    await waitFor(() => expect(card().getAttribute("data-status")).toBe("not_found"));
    const msg = screen.getByTestId("pos-scan-result-message").textContent ?? "";
    expect(msg).toContain("ไม่พบสินค้านี้");
    expect(msg).toContain("7770001");
  });

  it.each([320, 360, 390, 430, 768, 1024, 1440])(
    "renders the scan card and cart row without horizontal overflow at %ipx",
    async (width) => {
      window.innerWidth = width;
      window.dispatchEvent(new Event("resize"));
      const view = renderPos();
      await waitFor(() => expect(screen.getByTestId("pos-search")).toBeInTheDocument());
      await scan("8850001");
      await waitFor(() => expect(card()).toBeInTheDocument());
      expect(screen.getByTestId("pos-scan-result-image")).toBeInTheDocument();
      expect(screen.getByTestId("pos-scan-result-name").textContent).toContain("ปากกาลูกลื่น");
      expect(screen.getByTestId("pos-cart-thumb")).toBeInTheDocument();
      expect(card().className).toContain("max-w-full");
      expect(card().className).toContain("overflow-x-hidden");
      view.unmount();
    },
  );
});
