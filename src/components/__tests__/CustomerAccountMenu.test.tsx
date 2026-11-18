import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CustomerAccountMenu } from "@/components/layout/CustomerAccountMenu";
import { LineCustomerProvider, useLineCustomer, type LineCustomerProfile } from "@/contexts/LineCustomerContext";
import { useEffect } from "react";

const logoutMock = vi.fn();
vi.mock("@/lib/customerLogout", () => ({ logoutCustomer: (...a: unknown[]) => logoutMock(...a) }));

function Seed({ p, children }: { p: LineCustomerProfile | null; children: React.ReactNode }) {
  const { setProfile } = useLineCustomer();
  useEffect(() => { setProfile(p); }, [p, setProfile]);
  return <>{children}</>;
}

function renderMenu(p: LineCustomerProfile | null) {
  return render(
    <MemoryRouter>
      <LineCustomerProvider>
        <Seed p={p}>
          <CustomerAccountMenu />
        </Seed>
      </LineCustomerProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => { logoutMock.mockReset(); });

describe("CustomerAccountMenu", () => {
  it("renders nothing when no verified profile (never trusts storage)", () => {
    const { container } = renderMenu(null);
    expect(container.textContent || "").not.toContain("บัญชี");
  });

  it("shows display name + picture from verified profile (LIFF picture is display-only)", async () => {
    renderMenu({
      line_user_id: "U1",
      display_name: "สมชาย ทดสอบ",
      customer_id: null,
      customer_source: null,
      customer_name: null,
      phone: "0800000000",
      picture_url: "https://profile.line-scdn.net/x.jpg",
      verified_at: new Date().toISOString(),
    });
    const trigger = await screen.findByRole("button", { name: /บัญชีของ สมชาย ทดสอบ/i });
    const img = trigger.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://profile.line-scdn.net/x.jpg");
    expect(trigger.getAttribute("title")).toBe("สมชาย ทดสอบ");
  });

  it("falls back to initial avatar when picture is missing", async () => {
    renderMenu({
      line_user_id: "U2",
      display_name: "Alice",
      customer_id: null,
      customer_source: null,
      customer_name: null,
      phone: null,
      picture_url: null,
      verified_at: new Date().toISOString(),
    });
    const trigger = await screen.findByRole("button", { name: /บัญชีของ Alice/i });
    // Contains uppercase initial rather than an <img>
    expect(trigger.querySelector("img")).toBeNull();
    expect(trigger.textContent).toContain("A");
  });
});