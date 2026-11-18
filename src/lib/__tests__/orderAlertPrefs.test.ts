import { describe, it, expect, beforeEach } from "vitest";
import {
  readOrderAlertPrefs,
  writeOrderAlertPrefs,
  purgeLegacyOrderAlertPrefs,
  DEFAULT_ORDER_ALERT_PREFS,
} from "@/lib/orderAlertPrefs";
import { orderActionLabel, summarizeDetail } from "@/lib/orderActivity";

describe("orderAlertPrefs", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(readOrderAlertPrefs()).toEqual(DEFAULT_ORDER_ALERT_PREFS);
  });

  it("round-trips values", () => {
    writeOrderAlertPrefs({ toast: false, sound: false });
    expect(readOrderAlertPrefs()).toEqual({ toast: false, sound: false });
  });

  it("exposes no client-side LINE resend preference (delivery is server-side)", () => {
    expect(Object.keys(DEFAULT_ORDER_ALERT_PREFS).sort()).toEqual(["sound", "toast"]);
  });

  it("purges settings left by the removed browser-side resend scheduler", () => {
    localStorage.setItem("admin.orderAlerts.autoResend", "on");
    localStorage.setItem("admin.orderAlerts.autoResendMax", "3");
    localStorage.setItem("admin.orderAlerts.autoResendIntervalSec", "15");
    purgeLegacyOrderAlertPrefs();
    expect(localStorage.getItem("admin.orderAlerts.autoResend")).toBeNull();
    expect(localStorage.getItem("admin.orderAlerts.autoResendMax")).toBeNull();
    expect(localStorage.getItem("admin.orderAlerts.autoResendIntervalSec")).toBeNull();
  });

  it("shares the legacy sound key with the alerts page toggle", () => {
    writeOrderAlertPrefs({ sound: false });
    expect(localStorage.getItem("admin.orderAlerts.sound")).toBe("off");
  });
});

describe("download audit labels", () => {
  it("labels the export actions in Thai", () => {
    expect(orderActionLabel("order_export_csv")).toBe("ดาวน์โหลด CSV");
    expect(orderActionLabel("order_export_xlsx")).toBe("ดาวน์โหลด Excel");
    expect(orderActionLabel("order_pdf_download")).toBe("ดาวน์โหลดใบสั่งงาน (PDF)");
  });

  it("summarizes filename, row count and auto flag", () => {
    expect(summarizeDetail({ filename: "order-SO-1.csv", rows: 3 })).toContain("ไฟล์: order-SO-1.csv");
    expect(summarizeDetail({ result: "ok", auto: true })).toContain("อัตโนมัติ");
  });
});