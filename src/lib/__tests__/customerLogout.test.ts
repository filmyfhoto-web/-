import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub window.location.replace so we can assert the navigation target
// without leaving jsdom.
const replaceMock = vi.fn();
beforeEach(() => {
  replaceMock.mockReset();
  // @ts-expect-error jsdom allows re-assigning location subfields
  window.location = { ...window.location, replace: replaceMock };
  sessionStorage.clear();
  localStorage.clear();
});

describe("logoutCustomer", () => {
  it("wipes LINE proof, friend hints, guest snapshot, and cart, then replaces to /shop", async () => {
    sessionStorage.setItem("line_id_token", "abc");
    sessionStorage.setItem("line_binding", JSON.stringify({ line_user_id: "U" }));
    sessionStorage.setItem("line_friendship_hint", JSON.stringify({ is_friend: true, checked_at: "x" }));
    sessionStorage.setItem("liff_profile", JSON.stringify({ pictureUrl: "https://x" }));
    localStorage.setItem("guest_session_v1", "{}");
    localStorage.setItem("cart_v1", "[{}]");
    localStorage.setItem("cart_note_v1", "note");

    const { logoutCustomer } = await import("@/lib/customerLogout");
    logoutCustomer();

    expect(sessionStorage.getItem("line_id_token")).toBeNull();
    expect(sessionStorage.getItem("line_binding")).toBeNull();
    expect(sessionStorage.getItem("line_friendship_hint")).toBeNull();
    expect(sessionStorage.getItem("liff_profile")).toBeNull();
    expect(localStorage.getItem("guest_session_v1")).toBeNull();
    expect(localStorage.getItem("cart_v1")).toBeNull();
    expect(localStorage.getItem("cart_note_v1")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith("/shop");
  });
});