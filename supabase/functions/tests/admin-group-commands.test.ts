import { it, expect } from "vitest";

const assertEquals = <T,>(a: T, b: T) => expect(a).toEqual(b);
import {
  parseAdminGroupCommand,
  decideAdminGroupAction,
  maskDestination,
  buildConnectedFlex,
  buildNotAdminFlex,
  buildCancelConfirmFlex,
  NOTIFY_KINDS,
} from "../_shared/adminGroupCommands.ts";

const noState = { existing: null, otherActive: null };

it("parses exact/trimmed Thai commands only", () => {
  assertEquals(parseAdminGroupCommand("เชื่อมห้องแอดมิน"), "connect");
  assertEquals(parseAdminGroupCommand("  เชื่อมห้องแอดมิน  "), "connect");
  assertEquals(parseAdminGroupCommand("ทดสอบแจ้งเตือน"), "test");
  assertEquals(parseAdminGroupCommand("สถานะห้องแอดมิน"), "status");
  assertEquals(parseAdminGroupCommand("ยกเลิกห้องแอดมิน"), "cancel");
  assertEquals(parseAdminGroupCommand("โปรดเชื่อมห้องแอดมินให้ที"), null);
  assertEquals(parseAdminGroupCommand(""), null);
});

it("group chat is required", () => {
  assertEquals(
    decideAdminGroupAction({ command: "connect", sourceType: "user", isAdmin: true, state: noState }).action,
    "reject_not_group",
  );
  assertEquals(
    decideAdminGroupAction({ command: "connect", sourceType: "room", isAdmin: true, state: noState }).action,
    "reject_not_group",
  );
});

it("only owner/admin may run commands", () => {
  for (const cmd of ["test", "status", "cancel"] as const) {
    assertEquals(
      decideAdminGroupAction({ command: cmd, sourceType: "group", isAdmin: false, state: noState }).action,
      "reject_not_admin",
    );
  }
});

it("first real group can connect without staff approval", () => {
  assertEquals(
    decideAdminGroupAction({ command: "connect", sourceType: "group", isAdmin: false, state: noState }),
    { action: "connect", replaces: null },
  );
  assertEquals(
    decideAdminGroupAction({
      command: "connect",
      sourceType: "group",
      isAdmin: false,
      state: { existing: null, otherActive: { id: "legacy-user", isGroup: false } },
    }),
    { action: "connect", replaces: "legacy-user" },
  );
});

it("an unapproved user cannot replace an active real group", () => {
  assertEquals(
    decideAdminGroupAction({
      command: "connect",
      sourceType: "group",
      isAdmin: false,
      state: { existing: null, otherActive: { id: "real-group", isGroup: true } },
    }).action,
    "reject_not_admin",
  );
});

it("connect creates once and never duplicates", () => {
  const first = decideAdminGroupAction({ command: "connect", sourceType: "group", isAdmin: true, state: noState });
  assertEquals(first, { action: "connect", replaces: null });
  const again = decideAdminGroupAction({
    command: "connect", sourceType: "group", isAdmin: true,
    state: { existing: { id: "c1", is_active: true }, otherActive: null },
  });
  assertEquals(again.action, "already_linked");
});

it("connecting a new room keeps other active groups (multi-room)", () => {
  const d = decideAdminGroupAction({
    command: "connect", sourceType: "group", isAdmin: true,
    state: { existing: null, otherActive: { id: "old", isGroup: true } },
  });
  assertEquals(d, { action: "connect", replaces: null });
});

it("connecting replaces only a legacy private destination", () => {
  const d = decideAdminGroupAction({
    command: "connect", sourceType: "group", isAdmin: true,
    state: { existing: null, otherActive: { id: "old", isGroup: false } },
  });
  assertEquals(d, { action: "connect", replaces: "old" });
});

it("re-activating a previously cancelled room", () => {
  const d = decideAdminGroupAction({
    command: "connect", sourceType: "group", isAdmin: true,
    state: { existing: { id: "c1", is_active: false }, otherActive: null },
  });
  assertEquals(d, { action: "reactivate", channelId: "c1", replaces: null });
});

it("test/cancel require an active link", () => {
  assertEquals(
    decideAdminGroupAction({ command: "test", sourceType: "group", isAdmin: true, state: noState }).action,
    "not_linked",
  );
  assertEquals(
    decideAdminGroupAction({ command: "cancel", sourceType: "group", isAdmin: true, state: noState }).action,
    "not_linked",
  );
  assertEquals(
    decideAdminGroupAction({
      command: "cancel", sourceType: "group", isAdmin: true,
      state: { existing: { id: "c1", is_active: true }, otherActive: null },
    }),
    { action: "cancel_confirm", channelId: "c1" },
  );
});

it("status never requires an active link", () => {
  assertEquals(
    decideAdminGroupAction({ command: "status", sourceType: "group", isAdmin: true, state: noState }),
    { action: "status", channelId: null, isActive: false },
  );
});

it("destination ids are always masked", () => {
  const masked = maskDestination("Cabcdef1234567890");
  assertEquals(masked.includes("abcdef1234"), false);
  assertEquals(masked, "Cabc••••7890");
  assertEquals(maskDestination(null), "-");
});

it("flex cards carry the required copy and buttons, no identifiers", () => {
  const flex = JSON.stringify(buildConnectedFlex("https://example.com/admin/line-settings"));
  assertEquals(flex.includes("เชื่อมห้องแอดมินสำเร็จ"), true);
  assertEquals(flex.includes("ห้องนี้จะได้รับแจ้งเตือนงานสำคัญจาก NATTAWORKS"), true);
  for (const k of NOTIFY_KINDS) assertEquals(flex.includes(k), true);
  assertEquals(flex.includes("ทดสอบแจ้งเตือน"), true);
  assertEquals(flex.includes("ตั้งค่าการแจ้งเตือน"), true);

  const notAdmin = JSON.stringify(buildNotAdminFlex("https://example.com/staff"));
  assertEquals(notAdmin.includes("ยังไม่ได้ยืนยันสิทธิ์แอดมิน"), true);

  const cancel = JSON.stringify(buildCancelConfirmFlex("c1"));
  assertEquals(cancel.includes("admin_group:cancel_confirm:c1"), true);
});
