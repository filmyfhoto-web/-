import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HostRedirect from "@/components/HostRedirect";

const replaceMock = vi.fn();

function setHost(host: string) {
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      hostname: host,
      search: "",
      pathname: "/",
      replace: replaceMock,
    },
    writable: true,
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HostRedirect>
        <Routes>
          <Route path="/shop" element={<div>SHOP_PAGE</div>} />
          <Route path="/admin/dashboard" element={<div>ADMIN_PAGE</div>} />
          <Route path="/admin/products" element={<div>ADMIN_PRODUCTS</div>} />
          <Route path="/auth" element={<div>LOGIN_PAGE</div>} />
          <Route path="/cart" element={<div>CART_PAGE</div>} />
          <Route path="/pos" element={<div>POS_PAGE</div>} />
          <Route path="/domain-status" element={<div>DOMAIN_STATUS_PAGE</div>} />
        </Routes>
      </HostRedirect>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  try { window.localStorage.removeItem("__hostMode"); } catch { /* ignore */ }
  replaceMock.mockReset();
});

describe("HostRedirect route gating", () => {
  // The dedicated admin./staff. subdomains are not provisioned yet, so every
  // workspace path must keep rendering on the customer domain instead of
  // bouncing to a host that does not resolve.
  it("customer prod host serves /admin/* in place", () => {
    setHost("www.filmyynatta.com");
    renderAt("/admin/products");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText("ADMIN_PRODUCTS")).toBeInTheDocument();
  });
  it("customer prod apex serves /pos in place", () => {
    setHost("filmyynatta.com");
    renderAt("/pos");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText("POS_PAGE")).toBeInTheDocument();
  });
  it("admin prod host serves /shop in place", () => {
    setHost("admin.filmyynatta.com");
    renderAt("/shop");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText("SHOP_PAGE")).toBeInTheDocument();
  });
  it("admin.filmyynatta.com allows /admin/*", () => {
    setHost("admin.filmyynatta.com");
    renderAt("/admin/products");
    expect(screen.getByText("ADMIN_PRODUCTS")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
  it("preview host uses in-app fallback (no cross-origin replace)", () => {
    setHost("id-preview--abc.lovable.app");
    renderAt("/admin/products");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText("ADMIN_PRODUCTS")).toBeInTheDocument();
  });
  it("admin host allows /admin/*", () => {
    setHost("admin.filmyynatta.com");
    renderAt("/admin/products");
    expect(screen.getByText("ADMIN_PRODUCTS")).toBeInTheDocument();
  });
  it("admin host allows /auth login alias", () => {
    setHost("admin.filmyynatta.com");
    renderAt("/auth");
    expect(screen.getByText("LOGIN_PAGE")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
  it("injects noindex meta on admin host", () => {
    setHost("admin.filmyynatta.com");
    renderAt("/admin/dashboard");
    const meta = document.head.querySelector('meta#__admin-host-noindex') as HTMLMetaElement | null;
    expect(meta?.content).toBe("noindex,nofollow");
  });
  it("removes noindex meta on customer host", () => {
    setHost("www.filmyynatta.com");
    renderAt("/shop");
    const meta = document.head.querySelector('meta#__admin-host-noindex');
    expect(meta).toBeNull();
  });
  it("/domain-status renders on customer host without redirect", () => {
    setHost("www.filmyynatta.com");
    renderAt("/domain-status");
    expect(screen.getByText("DOMAIN_STATUS_PAGE")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
  it("/domain-status renders on admin host without redirect", () => {
    setHost("admin.filmyynatta.com");
    renderAt("/domain-status");
    expect(screen.getByText("DOMAIN_STATUS_PAGE")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});