import { describe, it, expect } from "vitest";
import {
  emptyQueueItem, queueItemArea, queueItemUnitPrice, queueItemAutoTotal,
  queueItemSizeLabel, queueItemTotal,
} from "@/film-shop/lib/queueIntake";

const item = (p: Partial<ReturnType<typeof emptyQueueItem>>) => ({ ...emptyQueueItem(), ...p });

describe("คิดราคาแบบ กว้าง × ยาว × ราคา/ตร.ม.", () => {
  it("คำนวณพื้นที่จากหน่วยเซนติเมตร", () => {
    expect(queueItemArea(item({ width: 150, height: 100, sizeUnit: "cm" }))).toBe(1.5);
  });

  it("คำนวณพื้นที่จากหน่วยเมตร", () => {
    expect(queueItemArea(item({ width: 1.5, height: 2, sizeUnit: "m" }))).toBe(3);
  });

  it("ราคาต่อหน่วย = พื้นที่ × ราคา/ตร.ม.", () => {
    const it1 = item({ width: 150, height: 100, sizeUnit: "cm", pricePerSqm: 200 });
    expect(queueItemUnitPrice(it1)).toBe(300);
  });

  it("รวมเงินอัตโนมัติ = จำนวน × ราคาต่อหน่วย − ส่วนลด", () => {
    const it1 = item({ width: 150, height: 100, sizeUnit: "cm", pricePerSqm: 200, quantity: 2, discount: 50 });
    expect(queueItemAutoTotal(it1)).toBe(550);
  });

  it("ไม่กรอกขนาด → ใช้ราคาต่อหน่วยเดิม", () => {
    const it1 = item({ quantity: 3, unitPrice: 20 });
    expect(queueItemUnitPrice(it1)).toBe(20);
    expect(queueItemAutoTotal(it1)).toBe(60);
  });

  it("แก้ยอดรวมเองได้ทับค่าอัตโนมัติ", () => {
    const it1 = item({ width: 1, height: 1, pricePerSqm: 100, manualTotal: 88.5 });
    expect(queueItemTotal(it1)).toBe(88.5);
  });

  it("ป้ายขนาดอ่านง่าย", () => {
    expect(queueItemSizeLabel(item({ width: 150, height: 100, sizeUnit: "cm" }))).toBe("150×100 ซม. (1.5 ตร.ม.)");
    expect(queueItemSizeLabel(item({}))).toBe("");
  });
});
