import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import GuestEntry from "../GuestEntry";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const rpcMock = vi.fn();
const invokeMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("@/contexts/GuestContext", () => ({
  useGuest: () => ({ session: null, setSession: vi.fn(), resolveOrg: vi.fn() }),
  newGuestId: () => "guest-test",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/SeoHead", () => ({ default: () => null }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/s"]}>
      <Routes>
        <Route path="/s" element={<GuestEntry />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GuestEntry candidate flow", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    rpcMock.mockReset();
    invokeMock.mockClear();
  });

  it("auto-redirects to /s/:slug when single match is returned", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: "r1", matched_slug: "alpha", matched_name: "โรงเรียน ก", candidates: [{ id: "a", slug: "alpha", name: "โรงเรียน ก" }] },
      error: null,
    });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/บ้านสบกอน/), { target: { value: "โรงเรียน ก" } });
    fireEvent.click(screen.getByRole("button", { name: /ขอลิงก์โรงเรียน/ }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/s/alpha", { replace: true }));
  });

  it("renders candidate list when multiple matches and confirms choice", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        id: "r2", matched_slug: null, matched_name: null,
        candidates: [
          { id: "a", slug: "huayfong", name: "โรงเรียนบ้านห้วยฟอง" },
          { id: "b", slug: "huayluang", name: "โรงเรียนบ้านห้วยหลวง" },
        ],
      },
      error: null,
    });
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // confirm_link_request
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/บ้านสบกอน/), { target: { value: "บ้านห้วย" } });
    fireEvent.click(screen.getByRole("button", { name: /ขอลิงก์โรงเรียน/ }));
    const btn = await screen.findByTestId("candidate-huayluang");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith("confirm_link_request", { p_id: "r2", p_slug: "huayluang" });
      expect(navigateMock).toHaveBeenCalledWith("/s/huayluang", { replace: true });
    });
  });

  it("shows queued confirmation and stays on /s when no candidates", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: "r3", matched_slug: null, matched_name: null, candidates: [] },
      error: null,
    });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/บ้านสบกอน/), { target: { value: "ไม่มีในระบบ" } });
    fireEvent.click(screen.getByRole("button", { name: /ขอลิงก์โรงเรียน/ }));
    await screen.findByText(/ส่งคำขอเรียบร้อย/);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});