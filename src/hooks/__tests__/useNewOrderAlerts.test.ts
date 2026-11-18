import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const handlers: Record<string, (p: any) => void> = {};

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (_evt: string, filter: any, cb: (p: any) => void) => {
      handlers[`${filter.table}:${filter.event}`] = cb;
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: vi.fn(),
      functions: { invoke: (name: string, opts: any) => invokeFn(name, opts) },
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0 }) }) }),
        }),
      }),
    },
  };
});

const toastSuccess = vi.fn();
const invokeFn = vi.fn((_name: string, _opts?: any) => Promise.resolve({ error: null }));
vi.mock("sonner", () => ({ toast: { success: (...a: any[]) => toastSuccess(...a) } }));
vi.mock("@/lib/orderActivity", () => ({ logOrderAction: vi.fn(() => Promise.resolve()) }));

import { useNewOrderAlerts, setOrderAlertSound, playOrderBeep } from "../useNewOrderAlerts";
import { writeOrderAlertPrefs } from "@/lib/orderAlertPrefs";

describe("useNewOrderAlerts", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    invokeFn.mockClear();
    localStorage.clear();
    setOrderAlertSound(true);
  });

  it("shows a toast and increments the counter on a new order", async () => {
    const onOrder = vi.fn();
    const { result } = renderHook(() => useNewOrderAlerts({ onOrder }));
    await waitFor(() => expect(handlers["orders:INSERT"]).toBeTruthy());
    act(() => {
      handlers["orders:INSERT"]({ new: { id: "o1", order_no: "SO-1", total: 120, guest_name: "ลูกค้า A" } });
    });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(onOrder).toHaveBeenCalledWith(expect.objectContaining({ order_no: "SO-1" }));
    expect(result.current.unread).toBe(1);
  });

  it("does not play a beep when the sound switch is off", () => {
    setOrderAlertSound(false);
    expect(playOrderBeep()).toBe(false);
  });

  it("skips the toast when the popup preference is off", async () => {
    writeOrderAlertPrefs({ toast: false });
    renderHook(() => useNewOrderAlerts({}));
    await waitFor(() => expect(handlers["orders:INSERT"]).toBeTruthy());
    act(() => { handlers["orders:INSERT"]({ new: { id: "o2", order_no: "SO-2" } }); });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("never sends LINE messages from the browser (delivery is server-side)", async () => {
    writeOrderAlertPrefs({ toast: true });
    renderHook(() => useNewOrderAlerts({}));
    await waitFor(() => expect(handlers["orders:INSERT"]).toBeTruthy());
    act(() => { handlers["orders:INSERT"]({ new: { id: "o3", order_no: "SO-3" } }); });
    expect(invokeFn).not.toHaveBeenCalled();
  });

  it("dedupes a replayed realtime INSERT (reconnect) into one alert", async () => {
    const onOrder = vi.fn();
    const { result } = renderHook(() => useNewOrderAlerts({ onOrder }));
    await waitFor(() => expect(handlers["orders:INSERT"]).toBeTruthy());
    act(() => { handlers["orders:INSERT"]({ new: { id: "dup1", order_no: "SO-9" } }); });
    act(() => { handlers["orders:INSERT"]({ new: { id: "dup1", order_no: "SO-9" } }); });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(result.current.unread).toBe(1);
  });
});
