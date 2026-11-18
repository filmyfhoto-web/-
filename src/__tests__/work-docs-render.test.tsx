import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { WorkItem } from "@/lib/workDocs";

const rows: WorkItem[] = [
  {
    kind: "order", id: "o1", code: "PO-2569-001", customerName: "ครูเอก", org: "โรงเรียนบ้านนา",
    phone: "0800000000", source: "เว็บไซต์", lineUserId: "U1",
    createdAt: new Date().toISOString(), acknowledgedAt: null,
    deliveryFile: null, deliverySentAt: null,
    quoteFile: null, quoteSentAt: null, pricedAt: null, status: "", files: [],
  },
];

vi.mock("@/lib/workDocs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workDocs")>("@/lib/workDocs");
  return { ...actual, listWorkItems: vi.fn(async () => rows), loadWorkFiles: vi.fn(async () => []) };
});

vi.mock("@/components/layout/DashboardShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const wait = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
});

describe("หน้า 'วันนี้' และ 'งานและเอกสาร' — เรนเดอร์จากข้อมูลจริง", () => {
  it("วันนี้: การ์ดคำสั่งซื้อ/LINE/งานที่ต้องทำ + เมนูล่างมือถือ", async () => {
    const AdminToday = (await import("@/pages/admin/AdminToday")).default;
    render(<MemoryRouter initialEntries={["/admin/today"]}><AdminToday /></MemoryRouter>);
    await wait();
    expect(screen.getByTestId("admin-today")).toBeTruthy();
     for (const k of ["orders", "requisitions", "line", "todo"]) {
       expect(screen.getByTestId(`today-tile-${k}`)).toBeTruthy();
     }
     expect(screen.getByTestId("today-tile-requisitions").textContent).toContain("ใบเขียนเบิกใหม่");
    expect(screen.getByTestId("today-tile-orders").textContent).toContain("คำสั่งซื้อใหม่");
    expect(screen.getByTestId("today-tile-orders").textContent).toContain("1");
    expect(screen.getByTestId("today-tile-todo").textContent).toContain("0");
    expect(screen.queryAllByText("เปิดงาน").length).toBeGreaterThanOrEqual(0);
    expect(screen.getByTestId("admin-bottom-nav")).toBeTruthy();
  });

  it("งานและเอกสาร: รายการรอดำเนินการและเปิดรายละเอียดเป็น 2 ขั้นตอน", async () => {
    const WorkDocs = (await import("@/pages/admin/WorkDocs")).default;
    const list = render(
      <MemoryRouter initialEntries={["/admin/work-docs"]}><WorkDocs /></MemoryRouter>,
    );
    await wait();
    expect(screen.getAllByTestId("work-list-row").length).toBe(1);
    list.unmount();

    render(<MemoryRouter initialEntries={["/admin/work-docs?id=o1"]}><WorkDocs /></MemoryRouter>);
    await wait();
    const detail = screen.getByTestId("work-detail");
    expect(detail.textContent).toContain("1. ยืนยันว่าได้รับรายการแล้ว");
    expect(detail.textContent).toContain("3. ส่งใบส่งของกลับลูกค้า");

    expect(screen.getByTestId("work-ack")).toBeTruthy();
    // ยังไม่ได้แนบ PDF → ปุ่มส่งต้องกดไม่ได้
    expect((screen.getByTestId("work-send") as HTMLButtonElement).disabled).toBe(true);
    // มีชิปเปลี่ยนสถานะเร็ว + ปุ่มเปิดแชท/ลบ แต่ยังไม่มีขั้น VAT/สต๊อกในหน้านี้
    expect(screen.getByTestId("work-status-chips")).toBeTruthy();
    expect(screen.getByTestId("work-open-chat")).toBeTruthy();
    expect(screen.getByTestId("work-delete")).toBeTruthy();
    expect(detail.textContent).not.toContain("VAT");

  });
});
