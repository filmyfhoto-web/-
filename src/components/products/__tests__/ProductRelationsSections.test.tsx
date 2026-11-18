import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProductRelationsSections from "@/components/products/ProductRelationsSections";

/**
 * Phase 3B UI tests — cover load/save/validation/relations for tiers/variants/bundles
 * and the "no productId" placeholder gate. Supabase client is mocked to a chainable
 * stub so we can assert on payloads without touching the network.
 */

type Row = Record<string, any>;

/**
 * Chainable stub mirroring the PostgREST builder surface the components
 * actually call. It must include the row-terminators (`maybeSingle`/`single`)
 * — an incomplete stub makes the builder throw a TypeError *inside* an async
 * effect, which surfaces as an unhandled rejection rather than a test failure.
 */
function makeTable(initial: Row[] = []) {
  const state = { rows: [...initial], lastInsert: null as Row | null, lastUpdate: null as Row | null, deleted: [] as string[] };
  const builder: any = {
    _filter: {} as Record<string, any>,
    select() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    is() { return builder; },
    eq(col: string, val: any) { builder._filter[col] = val; return builder; },
    in(_col: string, ids: string[]) { state.deleted.push(...ids); return builder; },
    delete() { return builder; },
    insert(payload: Row) { state.lastInsert = payload; return { select: () => ({ single: () => Promise.resolve({ data: { id: `new-${Math.random()}` }, error: null }) }) , then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }; },
    update(payload: Row) { state.lastUpdate = payload; return builder; },
    // Row terminators: resolve to the row matched by the recorded `eq` filters.
    maybeSingle() {
      const match = state.rows.find((r) =>
        Object.entries(builder._filter).every(([k, v]) => r[k] === v),
      );
      return Promise.resolve({ data: match ?? null, error: null });
    },
    single() { return builder.maybeSingle(); },
    then(fn: any) { return Promise.resolve({ data: state.rows, error: null }).then(fn); },
  };
  return { state, builder };
}

const tables: Record<string, ReturnType<typeof makeTable>> = {};
function resetTables() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["product_wholesale_tiers"] = makeTable();
  tables["product_variants"] = makeTable();
  tables["product_bundles"] = makeTable();
  // The unit-link editor loads these on mount; without them the shared
  // fallback table would answer and hide a genuinely missing mock.
  tables["product_unit_links"] = makeTable();
  tables["products"] = makeTable([
    { id: "p1", name: "สินค้าหลัก", code: "FY-P1", has_variants: false, stock: 0, unit: "ชิ้น" },
    { id: "child-a", name: "สินค้า A", code: "FY-A", has_variants: false, stock: 10, unit: "ชิ้น" },
    { id: "child-b", name: "สินค้า B", code: "FY-B", has_variants: false, stock: 10, unit: "ชิ้น" },
  ]);
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => tables[t]?.builder ?? makeTable().builder,
  },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

beforeEach(() => {
  resetTables();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("ProductRelationsSections gate", () => {
  it("shows the 'save product first' hint when there is no productId", () => {
    render(<ProductRelationsSections productId={null} />);
    expect(screen.getByTestId("relations-hint")).toBeInTheDocument();
  });

  it("renders three collapsible sections when a productId is given", async () => {
    render(<ProductRelationsSections productId="p1" />);
    await waitFor(() => expect(screen.getByTestId("product-relations")).toBeInTheDocument());
    expect(screen.getByTestId("section-tiers")).toBeInTheDocument();
    expect(screen.getByTestId("section-variants")).toBeInTheDocument();
    expect(screen.getByTestId("section-bundles")).toBeInTheDocument();
  });
});

describe("TiersEditor validation", () => {
  it("rejects negative price and duplicate min_qty with Thai messages", async () => {
    render(<ProductRelationsSections productId="p1" />);
    // open tier section (details is open by state; still triggerable)
    const section = await screen.findByTestId("section-tiers");
    fireEvent.click(within(section).getByTestId("add-tier"));
    fireEvent.click(within(section).getByTestId("add-tier"));

    const rows = within(section);
    fireEvent.change(rows.getByTestId("tier-min-qty-0"), { target: { value: "10" } });
    fireEvent.change(rows.getByTestId("tier-price-0"), { target: { value: "-5" } });
    fireEvent.click(rows.getByTestId("save-tiers"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("ราคาต่อหน่วย")));

    toastError.mockReset();
    fireEvent.change(rows.getByTestId("tier-price-0"), { target: { value: "8" } });
    fireEvent.change(rows.getByTestId("tier-min-qty-1"), { target: { value: "10" } });
    fireEvent.change(rows.getByTestId("tier-price-1"), { target: { value: "7" } });
    fireEvent.click(rows.getByTestId("save-tiers"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("ซ้ำ")));
  });
});

describe("VariantsEditor validation", () => {
  it("rejects blank SKU, duplicate SKU, and negative stock", async () => {
    render(<ProductRelationsSections productId="p1" />);
    const section = await screen.findByTestId("section-variants");

    fireEvent.click(within(section).getByTestId("add-variant"));
    fireEvent.click(within(section).getByTestId("save-variants"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("SKU ห้ามว่าง")));

    toastError.mockReset();
    fireEvent.change(within(section).getByTestId("variant-sku-0"), { target: { value: "SKU-1" } });
    fireEvent.click(within(section).getByTestId("add-variant"));
    fireEvent.change(within(section).getByTestId("variant-sku-1"), { target: { value: "SKU-1" } });
    fireEvent.click(within(section).getByTestId("save-variants"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("SKU ซ้ำ")));

    toastError.mockReset();
    fireEvent.change(within(section).getByTestId("variant-sku-1"), { target: { value: "SKU-2" } });
    fireEvent.change(within(section).getByTestId("variant-stock-1"), { target: { value: "-1" } });
    fireEvent.click(within(section).getByTestId("save-variants"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("สต๊อก")));
  });
});

describe("BundlesEditor validation", () => {
  it("rejects missing child and non-positive conversion_qty", async () => {
    render(<ProductRelationsSections productId="p1" />);
    const section = await screen.findByTestId("section-bundles");

    fireEvent.click(within(section).getByTestId("add-bundle"));
    fireEvent.click(within(section).getByTestId("save-bundles"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("เลือกสินค้าลูก")));
  });
});