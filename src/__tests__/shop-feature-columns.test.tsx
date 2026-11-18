import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FeatureColumns from "@/components/shop/home/FeatureColumns";
import {
  DEFAULT_FEATURE_COLUMNS, columnItems, visibleColumns, toneToken, resolveFeatureIcon,
  type FeatureItemRow,
} from "@/lib/shopFeatureColumns";

const cols = DEFAULT_FEATURE_COLUMNS;

const items: FeatureItemRow[] = [
  { id: "i2", column_id: "default-rush", title: "ปริ้นด่วน", subtitle: "A4 ขาวดำ", image_url: null, price_text: "เริ่มต้น 2 บาท", badge_text: "ภายใน 30 นาที", link_url: null, sort_order: 1, is_active: true },
  { id: "i1", column_id: "default-rush", title: "ถ่ายเอกสาร", subtitle: null, image_url: null, price_text: null, badge_text: null, link_url: null, sort_order: 0, is_active: true },
  { id: "i3", column_id: "default-rush", title: "ซ่อน", subtitle: null, image_url: null, price_text: null, badge_text: null, link_url: null, sort_order: 2, is_active: false },
];

describe("shop feature columns — config", () => {
  it("keeps only active columns, ordered by sort_order", () => {
    const mixed = [
      { ...cols[2], sort_order: 0 },
      { ...cols[0], sort_order: 1 },
      { ...cols[1], is_active: false },
    ];
    expect(visibleColumns(mixed).map((c) => c.key)).toEqual(["foryou", "popular"]);
  });

  it("sorts and filters items per column and caps the list", () => {
    const list = columnItems(items, "default-rush");
    expect(list.map((i) => i.title)).toEqual(["ถ่ายเอกสาร", "ปริ้นด่วน"]);
    expect(columnItems(items, "default-rush", 1)).toHaveLength(1);
  });

  it("maps each tone to a distinct theme token", () => {
    const tokens = new Set(cols.map((c) => toneToken(c.tone)));
    expect(tokens.size).toBe(3);
    expect(toneToken("nope")).toBe("--svc-1");
    expect(resolveFeatureIcon("__missing__")).toBeTruthy();
  });
});

describe("shop feature columns — rendering", () => {
  it("renders three compact cards with headers, items and a view-all button", () => {
    const onPick = vi.fn();
    const onViewAll = vi.fn();
    render(
      <FeatureColumns
        columns={cols}
        items={items}
        autoEntries={{ popular: [{ id: "p1", title: "ป้ายไวนิล", price_text: "เริ่มต้น 150 บาท" }] }}
        onPick={onPick}
        onViewAll={onViewAll}
      />,
    );
    expect(screen.getByTestId("feature-columns")).toBeInTheDocument();
    for (const c of cols) expect(screen.getByTestId(`feature-column-${c.key}`)).toBeInTheDocument();
    expect(screen.getByText("บริการยอดนิยม")).toBeInTheDocument();
    expect(screen.getByText("ภายใน 30 นาที")).toBeInTheDocument();
    // auto entries fill columns without admin-pinned items
    expect(screen.getByText("ป้ายไวนิล")).toBeInTheDocument();
    // empty state for a column with neither pinned nor auto items
    expect(screen.getByTestId("feature-empty-foryou")).toBeInTheDocument();

    fireEvent.click(screen.getByText("ปริ้นด่วน"));
    expect(onPick).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("feature-viewall-rush"));
    expect(onViewAll).toHaveBeenCalledWith(expect.objectContaining({ key: "rush" }));
  });

  it("hides disabled columns and respects admin ordering", () => {
    const reordered = [
      { ...cols[1], sort_order: 0 },
      { ...cols[0], sort_order: 1 },
      { ...cols[2], is_active: false },
    ];
    render(<FeatureColumns columns={reordered} items={[]} onPick={() => {}} onViewAll={() => {}} />);
    expect(screen.queryByTestId("feature-column-foryou")).toBeNull();
    const rendered = screen.getAllByTestId(/^feature-column-/).map((el) => el.getAttribute("data-testid"));
    expect(rendered).toEqual(["feature-column-rush", "feature-column-popular"]);
  });

  it("renders nothing when every column is disabled", () => {
    const { container } = render(
      <FeatureColumns columns={cols.map((c) => ({ ...c, is_active: false }))} items={[]} onPick={() => {}} onViewAll={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("stays responsive: horizontal scroll on mobile, 3-up grid from sm", () => {
    render(<FeatureColumns columns={cols} items={items} onPick={() => {}} onViewAll={() => {}} />);
    const track = screen.getByTestId("feature-column-rush").parentElement!;
    expect(track.className).toContain("overflow-x-auto");
    expect(track.className).toContain("sm:grid-cols-3");
    expect(screen.getByTestId("feature-viewall-rush").className).toContain("min-h-11");
  });
});
