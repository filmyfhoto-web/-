import { describe, it, expect, beforeEach } from "vitest";
import { REALTIME_LABEL_TH, __resetRealtimeState, getRealtimeState, setRealtimeState, subscribeRealtimeState } from "../realtimeStatus";

describe("realtime connection state", () => {
  beforeEach(() => __resetRealtimeState());

  it("starts as connecting and notifies subscribers on change", () => {
    expect(getRealtimeState()).toBe("connecting");
    const seen: string[] = [];
    const off = subscribeRealtimeState((s) => seen.push(s));
    setRealtimeState("online");
    setRealtimeState("online");
    setRealtimeState("syncing");
    off();
    setRealtimeState("offline");
    expect(seen).toEqual(["online", "syncing"]);
    expect(getRealtimeState()).toBe("offline");
  });

  it("has Thai labels for every state", () => {
    expect(Object.values(REALTIME_LABEL_TH)).toEqual(["กำลังเชื่อมต่อ", "ออนไลน์", "กำลังซิงก์", "ออฟไลน์"]);
  });
});
