import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DomainStatus from "@/pages/DomainStatus";
import { ADMIN_HOST_PRIMARY, STAFF_HOST_PRIMARY } from "@/lib/hostMode";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("")));
  Object.defineProperty(window, "location", {
    value: { ...window.location, hostname: "www.filmyynatta.com" },
    writable: true,
  });
});

describe("DomainStatus page", () => {
  it("renders every check and passes reachability checks when fetch resolves", async () => {
    render(<DomainStatus />);
    expect(screen.getByText("สถานะการเชื่อมโดเมน")).toBeInTheDocument();
    expect(screen.getByText(/1\. Host ปัจจุบัน/)).toBeInTheDocument();
    expect(screen.getByText(/2\. โดเมนปัจจุบันใช้งานได้ครบทุกส่วน/)).toBeInTheDocument();
    expect(screen.getByText(/Environment/)).toBeInTheDocument();
    expect(screen.getByText(`เสริม: ${ADMIN_HOST_PRIMARY}`)).toBeInTheDocument();
    expect(screen.getByText(`เสริม: ${STAFF_HOST_PRIMARY}`)).toBeInTheDocument();

    await waitFor(() => {
      const passed = screen.getAllByText("ผ่าน");
      expect(passed.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("marks admin reachability as failed when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    render(<DomainStatus />);
    await waitFor(() => {
      expect(screen.getAllByText("ล้มเหลว").length).toBeGreaterThan(0);
    });
  });

  it("shows the manual redirect test links", () => {
    render(<DomainStatus />);
    expect(screen.getByText("ลิงก์ทดสอบด้วยตาเปล่า")).toBeInTheDocument();
    expect(screen.getByText(/ลิงก์เจ้าของ\/แอดมิน/)).toBeInTheDocument();
  });

  it("shows the optional DNS record table with copy buttons", () => {
    render(<DomainStatus />);
    expect(screen.getByText(/เรคคอร์ด DNS \(ตัวเลือกเสริม/)).toBeInTheDocument();
    expect(screen.getAllByText("185.158.133.1").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole("button", { name: /คัดลอกค่า/ }).length).toBeGreaterThanOrEqual(4);
  });

  it("marks the optional admin/staff subdomains as ไม่จำเป็น when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    render(<DomainStatus />);
    await waitFor(() => {
      expect(screen.getAllByText("ไม่จำเป็น").length).toBeGreaterThanOrEqual(2);
    });
  });
});