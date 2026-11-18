// Pure logic + Flex builders for the Thai "ห้องแอดมิน" (admin LINE group) flow.
//
// Nothing in this module talks to the network or the database — the webhook
// resolves state and calls `decideAdminGroupAction` to know what to do. That
// keeps every branch (group vs 1:1, admin vs member, already linked, …)
// unit-testable without a live LINE channel.

export type AdminGroupCommand = "connect" | "test" | "status" | "cancel";

/**
 * Two kinds of rooms:
 *  - admin_group : "แจ้งเตือนออเดอร์" (ลูกค้าทักมา / ออเดอร์เว็บแอป)
 *  - queue_group : "NATTA.Q" (รันคิวงาน)
 *  - doc_group   : "ออกเอกสาร" (ออกเลขใบสั่งจ้าง/ใบเสร็จ)
 *  - order_group : "กลุ่มแจ้งเตือนคำสั่งซื้อ" (เว็บแอปลูกค้า) — แจ้งเตือนอย่างเดียว
 *                  ไม่รับคำสั่งคิว และไม่เข้า AI intake
 */
export type AdminChannelType = "admin_group" | "queue_group" | "doc_group" | "order_group";

export const NOTIFY_KINDS = [
  "งานใหม่",
  "งานด่วน",
  "ใกล้กำหนด",
  "เลยกำหนด",
  "ติดปัญหา",
  "ร้านใหญ่ล่าช้า",
  "พร้อมส่งมอบ",
] as const;

const COMMAND_MAP: Record<string, AdminGroupCommand> = {
  "เชื่อมห้องแอดมิน": "connect",
  "ทดสอบแจ้งเตือน": "test",
  "สถานะห้องแอดมิน": "status",
  "ยกเลิกห้องแอดมิน": "cancel",
};

const QUEUE_COMMAND_MAP: Record<string, AdminGroupCommand> = {
  "เชื่อมกลุ่มรันคิว": "connect",
  "ทดสอบกลุ่มรันคิว": "test",
  "สถานะกลุ่มรันคิว": "status",
  "ยกเลิกกลุ่มรันคิว": "cancel",
};

const DOC_COMMAND_MAP: Record<string, AdminGroupCommand> = {
  "เชื่อมห้องเอกสาร": "connect",
  "ทดสอบห้องเอกสาร": "test",
  "สถานะห้องเอกสาร": "status",
  "ยกเลิกห้องเอกสาร": "cancel",
};

const ORDER_COMMAND_MAP: Record<string, AdminGroupCommand> = {
  "เชื่อมกลุ่มออเดอร์": "connect",
  "ทดสอบกลุ่มออเดอร์": "test",
  "สถานะกลุ่มออเดอร์": "status",
  "ยกเลิกกลุ่มออเดอร์": "cancel",
};

/** Exact (trimmed) Thai command match. Anything else is not a command. */
export function parseAdminGroupCommand(text: string | null | undefined): AdminGroupCommand | null {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  return COMMAND_MAP[t] ?? null;
}

/** Same parser, but also tells which room type the command targets. */
export function parseAdminGroupTarget(
  text: string | null | undefined,
): { command: AdminGroupCommand; channelType: AdminChannelType; raw: string } | null {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  if (COMMAND_MAP[t]) return { command: COMMAND_MAP[t], channelType: "admin_group", raw: t };
  if (QUEUE_COMMAND_MAP[t]) return { command: QUEUE_COMMAND_MAP[t], channelType: "queue_group", raw: t };
  if (DOC_COMMAND_MAP[t]) return { command: DOC_COMMAND_MAP[t], channelType: "doc_group", raw: t };
  if (ORDER_COMMAND_MAP[t]) return { command: ORDER_COMMAND_MAP[t], channelType: "order_group", raw: t };
  return null;
}

/** Never expose a full groupId — logs and UI only ever see the masked form. */
export function maskDestination(id: string | null | undefined): string {
  const s = String(id ?? "");
  if (!s) return "-";
  if (s.length <= 8) return `${s.slice(0, 2)}••••`;
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export type AdminGroupState = {
  /** null when this group has never been linked */
  existing: { id: string; is_active: boolean } | null;
  /** an active admin group of the same store that is a *different* room */
  otherActive: { id: string; isGroup: boolean } | null;
};

export type AdminGroupDecision =
  | { action: "ignore"; reason: string }
  | { action: "reject_not_group" }
  | { action: "reject_not_admin" }
  | { action: "already_linked" }
  | { action: "connect"; replaces: string | null }
  | { action: "reactivate"; channelId: string; replaces: string | null }
  | { action: "test"; channelId: string }
  | { action: "status"; channelId: string | null; isActive: boolean }
  | { action: "cancel_confirm"; channelId: string }
  | { action: "not_linked" };

export function decideAdminGroupAction(input: {
  command: AdminGroupCommand | null;
  sourceType: string | null | undefined;
  isAdmin: boolean;
  state: AdminGroupState;
}): AdminGroupDecision {
  const { command, sourceType, isAdmin, state } = input;
  if (!command) return { action: "ignore", reason: "not_a_command" };
  if (sourceType !== "group") return { action: "reject_not_group" };
  const active = state.existing?.is_active === true;
  switch (command) {
    case "connect":
      if (active) return { action: "already_linked" };
      // The first real LINE Group may bootstrap itself without a staff-account
      // approval. A legacy U… private destination can be replaced, but an
      // already-active C…/R… group cannot be taken over from another room.
      if (!isAdmin && state.otherActive?.isGroup) return { action: "reject_not_admin" };
      {
        // Multiple rooms per category are allowed now: only a legacy private
        // (U…) destination is ever replaced.
        const replaces =
          state.otherActive && !state.otherActive.isGroup ? state.otherActive.id : null;
        if (state.existing) {
          return { action: "reactivate", channelId: state.existing.id, replaces };
        }
        return { action: "connect", replaces };
      }
    case "test":
      if (!isAdmin) return { action: "reject_not_admin" };
      if (!active) return { action: "not_linked" };
      if (!state.existing) return { action: "not_linked" };
      return { action: "test", channelId: state.existing.id };
    case "status":
      if (!isAdmin) return { action: "reject_not_admin" };
      return { action: "status", channelId: state.existing?.id ?? null, isActive: active };
    case "cancel":
      if (!isAdmin) return { action: "reject_not_admin" };
      if (!active) return { action: "not_linked" };
      if (!state.existing) return { action: "not_linked" };
      return { action: "cancel_confirm", channelId: state.existing.id };
  }
}

/* ------------------------------- Flex cards ------------------------------ */

const PLUM = "#5B2A4E";
const CREAM = "#FFF8F0";

function kindChips() {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: NOTIFY_KINDS.map((k) => ({
      type: "text",
      text: `• ${k}`,
      size: "sm",
      color: "#4A4A4A",
      wrap: true,
    })),
  };
}

function shell(title: string, bodyContents: unknown[], footer?: unknown) {
  const bubble: Record<string, unknown> = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: PLUM,
      paddingAll: "16px",
      contents: [{ type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      backgroundColor: CREAM,
      contents: bodyContents,
    },
  };
  if (footer) bubble.footer = footer;
  return { type: "flex", altText: title, contents: bubble };
}

function button(label: string, action: Record<string, unknown>, style = "primary") {
  return { type: "button", style, height: "sm", color: style === "primary" ? PLUM : undefined, action };
}

export function buildConnectedFlex(settingsUrl: string) {
  return shell("เชื่อมห้องแอดมินสำเร็จ", [
    { type: "text", text: "ห้องนี้จะได้รับแจ้งเตือนงานสำคัญจาก NATTAWORKS", wrap: true, size: "sm" },
    { type: "separator" },
    { type: "text", text: "ประเภทแจ้งเตือน", weight: "bold", size: "sm", color: PLUM },
    kindChips(),
  ], {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      button("ทดสอบแจ้งเตือน", { type: "postback", label: "ทดสอบแจ้งเตือน", data: "admin_group:test", displayText: "ทดสอบแจ้งเตือน" }),
      button("ตั้งค่าการแจ้งเตือน", { type: "uri", label: "ตั้งค่าการแจ้งเตือน", uri: settingsUrl }, "secondary"),
    ],
  });
}

export function buildAlreadyLinkedFlex(settingsUrl: string) {
  return shell("ห้องนี้เชื่อมไว้แล้ว", [
    { type: "text", text: "ห้องนี้ถูกตั้งเป็นห้องแอดมินอยู่แล้ว ระบบไม่ได้สร้างรายการซ้ำ", wrap: true, size: "sm" },
  ], {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      button("ทดสอบแจ้งเตือน", { type: "postback", label: "ทดสอบแจ้งเตือน", data: "admin_group:test", displayText: "ทดสอบแจ้งเตือน" }),
      button("ตั้งค่าการแจ้งเตือน", { type: "uri", label: "ตั้งค่าการแจ้งเตือน", uri: settingsUrl }, "secondary"),
    ],
  });
}

export function buildNotAdminFlex(linkUrl: string) {
  return shell("ยังไม่ได้ยืนยันสิทธิ์แอดมิน", [
    {
      type: "text",
      text: "เฉพาะเจ้าของร้านหรือแอดมินที่ผูกบัญชี LINE แล้วเท่านั้นที่เชื่อมห้องนี้ได้",
      wrap: true,
      size: "sm",
    },
  ], {
    type: "box",
    layout: "vertical",
    contents: [button("ผูกบัญชีแอดมิน", { type: "uri", label: "ผูกบัญชีแอดมิน", uri: linkUrl })],
  });
}

export function buildTestFlex() {
  return shell("ทดสอบแจ้งเตือน", [
    { type: "text", text: "นี่คือข้อความทดสอบจาก NATTAWORKS ห้องนี้พร้อมรับแจ้งเตือนงานแล้ว", wrap: true, size: "sm" },
    { type: "separator" },
    kindChips(),
  ]);
}

export function buildStatusFlex(opts: { linked: boolean; isActive: boolean; linkedAt?: string | null }) {
  const line = !opts.linked
    ? "ห้องนี้ยังไม่ได้เชื่อมกับระบบแจ้งเตือน"
    : opts.isActive
      ? "เชื่อมแล้ว และกำลังรับแจ้งเตือนอยู่"
      : "เคยเชื่อมไว้ แต่ตอนนี้ปิดรับแจ้งเตือนอยู่";
  const body: unknown[] = [{ type: "text", text: line, wrap: true, size: "sm" }];
  if (opts.linked && opts.linkedAt) {
    body.push({ type: "text", text: `เชื่อมเมื่อ ${opts.linkedAt}`, size: "xs", color: "#777777" });
  }
  return shell("สถานะห้องแอดมิน", body);
}

export function buildCancelConfirmFlex(channelId: string) {
  return shell("ยืนยันยกเลิกห้องแอดมิน", [
    { type: "text", text: "ห้องนี้จะหยุดรับแจ้งเตือนงานทั้งหมด ยืนยันหรือไม่", wrap: true, size: "sm" },
  ], {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      button("ยืนยันยกเลิก", { type: "postback", label: "ยืนยันยกเลิก", data: `admin_group:cancel_confirm:${channelId}`, displayText: "ยืนยันยกเลิกห้องแอดมิน" }),
      button("ไม่ยกเลิก", { type: "postback", label: "ไม่ยกเลิก", data: "admin_group:cancel_abort", displayText: "ไม่ยกเลิก" }, "secondary"),
    ],
  });
}

export function buildTextMessage(text: string) {
  return { type: "text", text };
}

/* --------------------- ผูกห้องกับร้าน + คำสั่งช่วยเหลือ -------------------- */

/** `ผูกร้าน ร้านการพิมพ์` / `ตั้งร้าน shop2` → ชื่อร้านที่ผู้ใช้พิมพ์ */
export function parseSetStoreCommand(text: string | null | undefined): string | null {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  const m = t.match(/^(?:ผูกร้าน|ตั้งร้าน|เปลี่ยนร้าน)\s+(.+)$/);
  return m ? m[1].trim() : null;
}

/** `ร้านนี้` / `รายชื่อร้าน` */
export function parseStoreInfoCommand(
  text: string | null | undefined,
): "current" | "list" | null {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  if (
    t === "ร้านนี้" ||
    t === "ห้องนี้ร้านไหน" ||
    t === "สถานะร้าน" ||
    t === "ห้องนี้ผูกร้านอะไร" ||
    t === "ผังห้อง"
  ) return "current";
  if (t === "รายชื่อร้าน" || t === "ร้านทั้งหมด") return "list";
  return null;
}

/** `ยืนยันผูกร้าน` — ยืนยันการเปลี่ยนร้านที่ผูกไว้เดิม */
export function isConfirmStoreCommand(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  return t === "ยืนยันผูกร้าน" || t === "ยืนยันเปลี่ยนร้าน";
}

export function isHelpCommand(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return t === "ช่วยเหลือ" || t === "คำสั่ง" || t === "help" || t === "เมนูคำสั่ง";
}

export type StoreOption = { id: string; display_name?: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");

/** จับคู่ร้านจากคำที่พิมพ์: ตรง id, ตรงชื่อ, หรือชื่อมีคำนั้นอยู่ (ต้องได้ผลเดียว) */
export function matchStore(
  query: string,
  stores: StoreOption[],
): { ok: true; store: StoreOption } | { ok: false; reason: "not_found" | "ambiguous" } {
  const q = norm(query);
  if (!q) return { ok: false, reason: "not_found" };
  const exact = stores.filter((s) => norm(s.id) === q || norm(s.display_name ?? "") === q);
  if (exact.length === 1) return { ok: true, store: exact[0] };
  const partial = stores.filter(
    (s) => norm(s.display_name ?? "").includes(q) || norm(s.id).includes(q),
  );
  if (partial.length === 1) return { ok: true, store: partial[0] };
  if (partial.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: false, reason: "not_found" };
}

export function storeLabelOf(s: StoreOption): string {
  return (s.display_name || "").trim() || s.id;
}

/** เวลาไทยแบบสั้น เช่น 12 ส.ค. 2569 23:15 น. */
export function formatThaiTime(iso: string | null | undefined): string {
  if (!iso) return "ไม่ทราบเวลา";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ไม่ทราบเวลา";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(d) + " น.";
  } catch {
    return d.toISOString();
  }
}

export const ROOM_TYPE_LABELS: Record<string, string> = {
  admin_group: "ห้องแจ้งเตือนแอดมิน",
  doc_group: "ห้องเอกสาร",
  queue_group: "กลุ่มรันคิว",
  order_group: "กลุ่มแจ้งเตือนคำสั่งซื้อ",
};

export type RoomBinding = {
  channel_type: string;
  storeLabel: string;
  isActive: boolean;
  updatedAt?: string | null;
};

/** ข้อความแสดงว่าห้องนี้ผูกกับร้านอะไร พร้อมเวลาอัปเดตล่าสุด */
export function buildRoomBindingText(rooms: RoomBinding[]): string {
  if (!rooms.length) {
    return "ห้องนี้ยังไม่ได้ผูกกับร้านใด\nพิมพ์ ช่วยเหลือ เพื่อดูคำสั่งเชื่อมห้อง";
  }
  const lines = rooms.map((r) => {
    const label = ROOM_TYPE_LABELS[r.channel_type] || r.channel_type;
    return [
      `• ${label} → ${r.storeLabel}${r.isActive ? "" : " (ปิดใช้งาน)"}`,
      `   อัปเดตล่าสุด ${formatThaiTime(r.updatedAt)}`,
    ].join("\n");
  });
  return ["ห้องนี้ผูกกับร้าน", ...lines].join("\n");
}

/** การ์ดยืนยันเมื่อจะเปลี่ยนร้านที่ผูกไว้เดิม */
export function buildStoreOverwriteConfirmFlex(opts: {
  fromLabel: string;
  toLabel: string;
  storeId: string;
}) {
  return shell("ยืนยันเปลี่ยนร้านของห้องนี้", [
    {
      type: "text",
      text: `ห้องนี้ผูกกับ “${opts.fromLabel}” อยู่แล้ว ต้องการเปลี่ยนเป็น “${opts.toLabel}” หรือไม่`,
      wrap: true,
      size: "sm",
    },
    {
      type: "text",
      text: "เอกสารและแจ้งเตือนที่ออกจากห้องนี้จะใช้ข้อมูลของร้านใหม่ทันที",
      wrap: true,
      size: "xs",
      color: "#777777",
    },
  ], {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      button("ยืนยันเปลี่ยนร้าน", {
        type: "postback",
        label: "ยืนยันเปลี่ยนร้าน",
        data: `store_map:confirm:${opts.storeId}`,
        displayText: "ยืนยันผูกร้าน",
      }),
      button("ไม่เปลี่ยน", {
        type: "postback",
        label: "ไม่เปลี่ยน",
        data: "store_map:abort",
        displayText: "ไม่เปลี่ยน",
      }, "secondary"),
    ],
  });
}

export function buildStoreListText(stores: StoreOption[]): string {
  if (!stores.length) return "ยังไม่มีร้านในระบบ";
  return ["ร้านทั้งหมด", ...stores.map((s) => `• ${storeLabelOf(s)} (${s.id})`)].join("\n");
}

/** ข้อความช่วยเหลือแบบสั้น อ่านจบในแชท */
export function buildHelpText(): string {
  return [
    "คำสั่งที่ใช้ได้ในกลุ่มนี้ (พิมพ์ตามตัวอย่างได้เลย)",
    "",
    "ห้องเอกสาร",
    "• เชื่อมห้องเอกสาร — เช่น: เชื่อมห้องเอกสาร",
    "• ทดสอบห้องเอกสาร — เช่น: ทดสอบห้องเอกสาร",
    "• สถานะห้องเอกสาร — เช่น: สถานะห้องเอกสาร",
    "• ยกเลิกห้องเอกสาร — เช่น: ยกเลิกห้องเอกสาร",
    "",
    "ห้องแจ้งเตือนแอดมิน",
    "• เชื่อมห้องแอดมิน — เช่น: เชื่อมห้องแอดมิน",
    "• ทดสอบแจ้งเตือน — เช่น: ทดสอบแจ้งเตือน",
    "• สถานะห้องแอดมิน — เช่น: สถานะห้องแอดมิน",
    "• ยกเลิกห้องแอดมิน — เช่น: ยกเลิกห้องแอดมิน",
    "",
    "กลุ่มรันคิว",
    "• เชื่อมกลุ่มรันคิว — เช่น: เชื่อมกลุ่มรันคิว",
    "• ทดสอบกลุ่มรันคิว — เช่น: ทดสอบกลุ่มรันคิว",
    "• สถานะกลุ่มรันคิว — เช่น: สถานะกลุ่มรันคิว",
    "• ยกเลิกกลุ่มรันคิว — เช่น: ยกเลิกกลุ่มรันคิว",
    "",
    "ผูกห้องกับร้าน",
    "• ผูกร้าน <ชื่อร้าน> — เช่น: ผูกร้าน ร้านการพิมพ์",
    "• สถานะร้าน — เช่น: สถานะร้าน (ดูร้านที่ผูก + เวลาอัปเดตล่าสุด)",
    "• รายชื่อร้าน — เช่น: รายชื่อร้าน",
    "• ยืนยันผูกร้าน — เช่น: ยืนยันผูกร้าน (ใช้เมื่อระบบถามยืนยันการเปลี่ยนร้าน)",
    "",
    "พิมพ์ ช่วยเหลือ เพื่อดูรายการนี้อีกครั้ง",
  ].join("\n");
}
