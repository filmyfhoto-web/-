import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const refreshLineBinding = vi.fn(async () => ({ status: "linked" }));
let linked = true;

vi.mock("@/hooks/useLineBindingState", () => ({
  useLineBindingState: () => ({ status: linked ? "linked" : "unlinked", isLinked: linked }),
  refreshLineBinding: (...a: any[]) => refreshLineBinding(...(a as [])),
}));

const rpc = vi.fn(async () => ({ data: false, error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => rpc(...(a as [])) } }));

import CartLineBindDialog from "../CartLineBindDialog";

describe("CartLineBindDialog — never re-prompts a customer who already linked", () => {
  beforeEach(() => { vi.clearAllMocks(); linked = true; });

  it("shows the proceed action instead of the bind steps when already linked", async () => {
    render(
      <CartLineBindDialog
        open onOpenChange={() => {}} phone="0800000000"
        shopLineUrl="https://line.me/R/ti/p/@shop" policy="required" onProceed={() => {}}
      />,
    );
    expect(await screen.findByText(/ผูก LINE สำเร็จแล้ว/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /ดำเนินการสั่งซื้อต่อ/ })).toBeTruthy();
    expect(screen.queryByText(/กรุณาผูก LINE ก่อนสั่งซื้อ/)).toBeNull();
  });

  it("still asks an unlinked customer to bind", async () => {
    linked = false;
    render(
      <CartLineBindDialog
        open onOpenChange={() => {}} phone="0800000000"
        shopLineUrl="https://line.me/R/ti/p/@shop" policy="required" onProceed={() => {}}
      />,
    );
    expect(await screen.findByText(/กรุณาผูก LINE ก่อนสั่งซื้อ/)).toBeTruthy();
  });
});
