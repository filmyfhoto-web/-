import { describe, it, expect, beforeEach } from "vitest";
import {
  readFriendCache, setCachedFriend, filterUncached, getCachedFriend, clearFriendCache,
  DEFAULT_FRIEND_TTL_MS,
} from "@/lib/friendCheckCache";

beforeEach(() => { sessionStorage.clear(); });

describe("friendCheckCache", () => {
  it("stores and reads entries", () => {
    setCachedFriend({ U1: { status: "confirmed", checked_at: new Date().toISOString(), reason: "ok" } });
    expect(getCachedFriend("U1")?.status).toBe("confirmed");
  });

  it("filterUncached returns only stale/missing ids", () => {
    const now = Date.now();
    setCachedFriend({
      U1: { status: "confirmed", checked_at: new Date(now).toISOString() },
      U2: { status: "unknown", checked_at: new Date(now - DEFAULT_FRIEND_TTL_MS - 1000).toISOString() },
    });
    const need = filterUncached(["U1", "U2", "U3"], DEFAULT_FRIEND_TTL_MS, now);
    expect(need.sort()).toEqual(["U2", "U3"]);
  });

  it("clearFriendCache removes ids", () => {
    setCachedFriend({ U1: { status: "confirmed", checked_at: new Date().toISOString() } });
    clearFriendCache(["U1"]);
    expect(readFriendCache().U1).toBeUndefined();
  });

  it("expired entries are treated as missing", () => {
    const old = new Date(Date.now() - DEFAULT_FRIEND_TTL_MS - 5000).toISOString();
    setCachedFriend({ U1: { status: "confirmed", checked_at: old } });
    expect(getCachedFriend("U1")).toBeNull();
  });
});
