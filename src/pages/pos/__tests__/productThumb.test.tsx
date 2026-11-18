import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductThumb, { productInitials } from "../ProductThumb";

describe("ProductThumb", () => {
  it("derives readable initials", () => {
    expect(productInitials("ปากกา ลูกลื่น")).toBe("ปล");
    expect(productInitials("Notebook")).toBe("NO");
    expect(productInitials("")).toBe("");
  });

  it("renders any existing URL shape unchanged (legacy URL / storage URL)", () => {
    const urls = [
      "https://legacy.example.com/a.jpg",
      "https://x.supabase.co/storage/v1/object/public/product-images/a.png",
    ];
    for (const u of urls) {
      const v = render(<ProductThumb src={u} name="A" testId="t" />);
      expect((screen.getByTestId("t-img") as HTMLImageElement).getAttribute("src")).toBe(u);
      v.unmount();
    }
  });

  it("uses the placeholder instead of a broken image when loading fails", () => {
    render(<ProductThumb src="https://bad/x.jpg" name="ยางลบ" testId="t" />);
    fireEvent.error(screen.getByTestId("t-img"));
    expect(screen.queryByTestId("t-img")).toBeNull();
    expect(screen.getByTestId("t").getAttribute("data-placeholder")).toBe("1");
  });

  it("keeps a fixed square ratio and object-cover so images never distort", () => {
    render(<ProductThumb src="https://x/a.jpg" name="A" testId="t" />);
    expect(screen.getByTestId("t").className).toContain("aspect-square");
    expect(screen.getByTestId("t-img").className).toContain("object-cover");
  });
});
