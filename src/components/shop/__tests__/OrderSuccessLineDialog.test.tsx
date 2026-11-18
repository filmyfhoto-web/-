import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let status = "linked";
vi.mock("@/hooks/useLineBindingState", () => ({
  useLineBindingState: () => ({ status, isLinked: status === "linked" }),
}));

vi.mock("../LineBindActions", () => ({
  default: () => <div data-testid="line-bind-actions" />,
}));

import OrderSuccessLineDialog from "../OrderSuccessLineDialog";

const renderDialog = () =>
  render(
    <MemoryRouter>
      <OrderSuccessLineDialog open onOpenChange={() => {}} orderNo="OR-2601-0001" linkToken="tok123" />
    </MemoryRouter>,
  );

describe("OrderSuccessLineDialog — binding state is the single source of truth", () => {
  beforeEach(() => { vi.clearAllMocks(); status = "linked"; });

  it("linked: shows the order number and a status button, and NO bind prompt", async () => {
    renderDialog();
    expect((await screen.findByTestId("order-no")).textContent).toBe("OR-2601-0001");
    expect(screen.getByRole("button", { name: /ดูสถานะออเดอร์/ })).toBeTruthy();
    expect(screen.queryByTestId("line-bind-actions")).toBeNull();
    expect(screen.queryByText(/เปิด LINE ผูกอัตโนมัติ/)).toBeNull();
  });

  it("unlinked: shows exactly one bind CTA", async () => {
    status = "unlinked";
    renderDialog();
    expect(await screen.findByTestId("line-bind-actions")).toBeTruthy();
    expect(screen.getAllByTestId("line-bind-actions")).toHaveLength(1);
  });

  it("loading: shows neither the bind prompt nor a flash of it", async () => {
    status = "loading";
    renderDialog();
    expect(await screen.findByText(/กำลังตรวจสอบสถานะ LINE/)).toBeTruthy();
    expect(screen.queryByTestId("line-bind-actions")).toBeNull();
  });

  it("error: never nags — the bind step stays hidden", async () => {
    status = "error";
    renderDialog();
    expect(await screen.findByTestId("order-no")).toBeTruthy();
    expect(screen.queryByTestId("line-bind-actions")).toBeNull();
  });
});
