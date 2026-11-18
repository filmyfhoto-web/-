import { describe, expect, it, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MobileTableFit from "@/components/MobileTableFit";

const wait = () => new Promise((r) => setTimeout(r, 30));

describe("MobileTableFit card mode", () => {
  beforeAll(() => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
  });

  it("wraps a raw table, labels cells and adds an expand toggle", async () => {
    const host = document.createElement("div");
    host.innerHTML =
      "<table><thead><tr><th>ชื่อ</th><th>สถานะ</th><th>ยอด</th><th>วันที่</th><th>หมายเหตุ</th></tr></thead>" +
      "<tbody><tr><td>งาน A</td><td>รอ</td><td>100</td><td>1/8</td><td>-</td></tr></tbody></table>";
    document.body.appendChild(host);
    render(
      <MemoryRouter>
        <MobileTableFit />
      </MemoryRouter>,
    );
    await wait();
    const wrapper = document.querySelector("[data-table-scroll][data-mobile-cards]") as HTMLElement;
    expect(wrapper).toBeTruthy();
    const row = document.querySelector("tbody tr") as HTMLTableRowElement;
    expect(row.getAttribute("data-card-collapsible")).toBe("");
    expect(row.cells[3].getAttribute("data-label")).toBe("วันที่");
    const btn = row.querySelector("[data-card-toggle]") as HTMLButtonElement;
    expect(btn.textContent).toBe("ดูเพิ่มเติม");
    btn.click();
    expect(row.hasAttribute("data-card-open")).toBe(true);
    expect(btn.textContent).toBe("ย่อ");
  });
});

describe("MobileTableFit card mode details", () => {
  beforeAll(() => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
  });

  it("keeps empty-state rows plain, hides blank cells and labels footer totals", async () => {
    const host = document.createElement("div");
    host.innerHTML =
      "<table id='t2'><thead><tr><th>ชื่อ</th><th>สถานะ</th><th>ยอด</th><th>วันที่</th></tr></thead>" +
      "<tbody><tr><td colspan='4'>ไม่มีข้อมูล</td></tr>" +
      "<tr><td>งาน B</td><td>รอ</td><td>50</td><td> </td></tr></tbody>" +
      "<tfoot><tr><td>รวม</td><td></td><td>50</td><td></td></tr></tfoot></table>";
    document.body.appendChild(host);
    render(
      <MemoryRouter>
        <MobileTableFit />
      </MemoryRouter>,
    );
    await wait();
    const table = document.getElementById("t2") as HTMLTableElement;
    const rows = table.tBodies[0].rows;
    expect(rows[0].hasAttribute("data-card-full")).toBe(true);
    expect(rows[0].cells[0].hasAttribute("data-label")).toBe(false);
    expect(rows[1].cells[3].hasAttribute("data-card-empty")).toBe(true);
    expect(rows[1].hasAttribute("data-card-collapsible")).toBe(false);
    expect(table.tFoot!.rows[0].cells[2].getAttribute("data-label")).toBe("ยอด");
  });
});
