/**
 * คำสั่ง “อ่านอย่างเดียว” ในห้องแอดมิน LINE (สถานะระบบ / งานด่วน / คิววันนี้ / ค้นหา JOB-)
 *
 * ตั้งใจให้เปลี่ยนสถานะงานสำคัญไม่ได้ด้วยข้อความล้วน — ทุกคำสั่งที่นี่คืนข้อมูล
 * และลิงก์ไปยืนยันในเว็บที่ล็อกอินเท่านั้น
 */
export type AdminQuery =
  | { kind: "system_status" }
  | { kind: "urgent" }
  | { kind: "today" }
  | { kind: "find"; code: string }
  | null;

const norm = (t: string | null | undefined) => String(t ?? "").trim().replace(/\s+/g, " ");

/**
 * คำสั่งรันคิวในห้อง LINE ที่ผูกไว้แล้ว
 *  - "เช็คคิว" / "ดูคิว"        → แสดงคิวงานที่ค้าง
 *  - "สรุปงาน" / "ปิดจ๊อบ" / "เสร็จสิ้น" → ปิดงานที่กำลังทำ แล้วดึงคิวถัดไปขึ้นมา
 * อนุญาตเฉพาะห้อง/กลุ่มที่ผูกกับร้านแล้วเท่านั้น (เช็กที่ webhook)
 */
export type QueueChatCommand =
  | { kind: "queue_list" }
  | { kind: "queue_close" }
  | { kind: "queue_take" }
  | { kind: "intake_card" }
  | { kind: "menu" }
  | { kind: "current_job" }
  | { kind: "doc_job_order" }
  | { kind: "doc_receipt" }
  | null;

/**
 * แม็ปข้อความไทยเป็นคำสั่งคิว — จุดชนกันที่ตั้งใจแก้:
 *  - "รับงาน/งานใหม่/สั่งงาน/เปิดฟอร์ม" → intake_card (เปิดการ์ดรับงานใหม่ ตรงกับข้อความในเมนูบอท)
 *  - "รันงาน/รันคิว/เริ่มงาน/run" → queue_take (ดึงงานถัดไปเข้าคิวทำงาน)
 *  - "รีเฟรช" เพียงคำเดียว = สั่งแสดงการ์ด "งานปัจจุบัน" ใหม่ (current_job); "เมนู/ช่วยเหลือ" ยังคงเป็นเมนูช่วยเหลือ
 */
export function parseQueueChatCommand(text: string | null | undefined): QueueChatCommand {
  const t = norm(text);
  if (/^(เมนู|ช่วยเหลือ|help)$/i.test(t)) return { kind: "menu" };
  if (/^(รีเฟรช|ตอนนี้ทำอะไร|ทำอะไรอยู่|งานปัจจุบัน)$/.test(t)) return { kind: "current_job" };
  if (/^(รับงาน|งานใหม่|เปิดงานใหม่|สั่งงาน|ฟอร์มสั่งงาน|เปิดฟอร์ม|เปิดฟอร์มสั่งงาน)$/.test(t)) return { kind: "intake_card" };
  if (/^(ใบสั่งจ้าง)$/.test(t)) return { kind: "doc_job_order" };
  if (/^(ใบเสร็จ|ใบเสร็จรับเงิน)$/.test(t)) return { kind: "doc_receipt" };
  if (/^(เช็คคิว|เช็กคิว|ดูคิว|รีเฟรชคิว|อัพเดทคิว|อัปเดตคิว|คิว|คิวงาน)$/.test(t)) return { kind: "queue_list" };
  if (/^(สรุปงาน|ปิดจ๊อบ|ปิดจ็อบ|ปิดงาน|เสร็จสิ้น|จบงาน)$/.test(t)) return { kind: "queue_close" };
  if (/^(เริ่มงาน|รันคิว|รันงาน|run)$/i.test(t)) return { kind: "queue_take" };

  return null;
}

/**
 * แม็ป postback data ของปุ่มในการ์ด "งานปัจจุบัน" (nq:<action>[:jobId]) → QueueChatCommand
 * ใช้ dispatcher เดียวกับคำสั่งข้อความ เพื่อไม่ให้พฤติกรรมเพี้ยนกันระหว่างปุ่มกับพิมพ์เอง
 */
export function parseQueuePostback(data: string | null | undefined): { cmd: QueueChatCommand; jobId: string | null } | null {
  const raw = String(data ?? "");
  if (!raw.startsWith("nq:")) return null;
  const parts = raw.split(":");
  const action = parts[1] ?? "";
  const jobId = parts[2] ?? null;
  const map: Record<string, QueueChatCommand> = {
    queue_list: { kind: "queue_list" },
    queue_take: { kind: "queue_take" },
    queue_close: { kind: "queue_close" },
    refresh: { kind: "current_job" },
    doc_job_order: { kind: "doc_job_order" },
    doc_receipt: { kind: "doc_receipt" },
  };
  const cmd = map[action] ?? null;
  if (!cmd) return null;
  return { cmd, jobId };
}

/** ข้อความช่วยเหลือสั้น ๆ ที่ส่งคู่กับปุ่มลัด 4 ปุ่ม */
export function buildQueueMenuText(): string {
  return [
    "🤖 เมนูบอทรันงาน",
    "📋 เช็คคิว — ดูคิวงานล่าสุด",
    "🔄 รับงาน — เปิดฟอร์มรับงานใหม่",
    "✅ สรุปงาน — ปิดงานที่ทำอยู่ แล้วดึงคิวถัดไป",
    "↩️ รีเฟรช — แสดงเมนูนี้อีกครั้ง",
  ].join("\n");
}

/** เวลาไทยแบบสั้น ใช้ต่อท้ายรายงานทุกครั้ง เพื่อให้รู้ว่าอัปเดตล่าสุดเมื่อไหร่ */
export function thaiTime(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(dt) + " น.";
  } catch {
    return dt.toISOString();
  }
}

/** ข้อความปฏิเสธคำสั่งคิว แยกตามเหตุผลที่ฐานข้อมูลตอบกลับ */
export function queueDenyText(reason: string, controlRoomUrl: string): string {
  const map: Record<string, string> = {
    room_not_bound: "ห้องนี้ยังไม่ได้ผูกกับระบบคิวค่ะ พิมพ์ “เชื่อมกลุ่มรันคิว” ก่อนนะคะ",
    queue_disabled: "ห้องนี้ยังไม่ได้เปิดสิทธิ์ใช้คำสั่งคิวค่ะ เปิดได้ที่หน้าจัดการห้อง LINE",
    not_linked: "บัญชี LINE ของคุณยังไม่ได้ผูกกับสิทธิ์พนักงาน/แอดมินค่ะ ผูกก่อนที่หน้า /staff",
    not_authorized: "บัญชีนี้ไม่มีสิทธิ์สั่งงานคิวในห้องนี้ค่ะ ให้ผู้ดูแลเพิ่มสิทธิ์ให้ก่อนนะคะ",
  };
  return `🔒 ${map[reason] ?? "ใช้คำสั่งคิวในห้องนี้ไม่ได้ค่ะ"}\n${controlRoomUrl}`;
}

export type QueueJobBrief = {
  job_no?: string | null;
  queue_code?: string | null;
  title?: string | null;
  status?: string | null;
  customer_name?: string | null;
};

/** สรุปจำนวนคิวล่าสุด แสดงทุกครั้งที่บอทตอบ เพื่อให้เห็นผลลัพธ์ทันทีหลังกดปุ่ม */
export type QueueStats = {
  running: number;
  waiting: number;
  total: number;
  doneToday?: number;
};

/** นับสถิติจากรายการงานที่ยังไม่ปิด */
export function summarizeQueueStats(jobs: QueueJobBrief[], doneToday?: number): QueueStats {
  const running = jobs.filter((j) => j.status === "producing").length;
  return { running, waiting: jobs.length - running, total: jobs.length, doneToday };
}

/** บรรทัดสรุปผลลัพธ์แบบข้อความ */
export function buildQueueStatsText(stats?: QueueStats | null): string | null {
  if (!stats) return null;
  const parts = [
    `🔄 กำลังทำ ${stats.running}`,
    `⏳ รอคิว ${stats.waiting}`,
    `📦 รวม ${stats.total}`,
  ];
  if (typeof stats.doneToday === "number") parts.push(`✅ ปิดวันนี้ ${stats.doneToday}`);
  return parts.join(" · ");
}

const jobLabel = (j: QueueJobBrief) => `${j.queue_code || j.job_no || "-"}: ${j.title || "(ไม่มีชื่องาน)"}`;

export function buildQueueListText(jobs: QueueJobBrief[], controlRoomUrl: string, stats?: QueueStats | null): string {
  const stamp = `🕒 ข้อมูล ณ ${thaiTime()}`;
  const summary = buildQueueStatsText(stats ?? summarizeQueueStats(jobs));
  if (!jobs.length) return `📋 ไม่มีคิวงานค้างอยู่ในระบบขณะนี้ค่ะ\n${summary}\n${stamp}`;
  const lines = jobs.map((j, i) => {
    const running = j.status === "producing";
    return `${i + 1}. [${running ? "🔄 กำลังทำ" : "⏳ รอคิว"}] ${jobLabel(j)}`;
  });
  return ["📋 รายการคิวงานปัจจุบัน:", ...lines, "", summary, stamp, controlRoomUrl]
    .filter(Boolean).join("\n");
}

/** รายงานเมื่อ “รับงาน/เริ่มงาน” — ต้องมีเลขงานและเวลาเสมอ */
export function buildQueueTakeText(
  job: QueueJobBrief | null,
  controlRoomUrl: string,
  actor?: string | null,
  stats?: QueueStats | null,
): string {
  const summary = buildQueueStatsText(stats);
  if (!job) {
    return [`📭 ไม่มีคิวงานรออยู่แล้วค่ะ`, summary, `🕒 ${thaiTime()}`, controlRoomUrl]
      .filter(Boolean).join("\n");
  }
  return [
    "🔄 เริ่มงานแล้ว (กำลังผลิต)",
    `📌 ${jobLabel(job)}`,
    actor ? `👤 โดย ${actor}` : null,
    summary,
    `🕒 ${thaiTime()}`,
    "",
    controlRoomUrl,
  ].filter(Boolean).join("\n");
}

export function buildQueueCloseText(
  closed: QueueJobBrief | null,
  next: QueueJobBrief | null,
  controlRoomUrl: string,
  actor?: string | null,
  stats?: QueueStats | null,
): string {
  const summary = buildQueueStatsText(stats);
  if (!closed) {
    return [`⚠️ ไม่พบงานที่กำลังดำเนินการอยู่ในขณะนี้ค่ะ`, summary, `🕒 ${thaiTime()}`]
      .filter(Boolean).join("\n");
  }
  const head = `✅ ปิดงาน ${jobLabel(closed)} เรียบร้อยค่ะ`;
  const who = actor ? `\n👤 โดย ${actor}` : "";
  const tail = next
    ? `\n\n🔔 ดึงคิวถัดไปขึ้นมาทำต่อ:\n📌 ${jobLabel(next)}`
    : "\n\n🎉 ตอนนี้ไม่มีคิวค้างในระบบแล้วค่ะ";
  return `${head}${who}${tail}\n\n${summary ? summary + "\n" : ""}🕒 ${thaiTime()}\n${controlRoomUrl}`;
}

export function parseAdminQuery(text: string | null | undefined): AdminQuery {
  const t = norm(text);
  if (/^สถานะระบบ$/.test(t)) return { kind: "system_status" };
  if (/^งานด่วน$/.test(t)) return { kind: "urgent" };
  if (/^คิววันนี้$/.test(t)) return { kind: "today" };
  const m = t.match(/^ค้นหา\s*((?:JOB|OR)-[A-Za-z0-9-]+)$/i);
  if (m) return { kind: "find", code: m[1].toUpperCase() };
  return null;
}

/** คำสั่งที่พยายามเปลี่ยนสถานะงานผ่านข้อความ — ต้องปฏิเสธและให้ไปกดยืนยันในเว็บ */
export function isMutatingCommand(text: string | null | undefined): boolean {
  const t = norm(text);
  return /^(ปิดงาน|เสร็จแล้ว|ยกเลิกงาน|เปลี่ยนสถานะ|อนุมัติ|ส่งมอบแล้ว)(\s|$)/.test(t);
}

export const MUTATION_REFUSAL =
  "เพื่อความปลอดภัย การเปลี่ยนสถานะงานต้องกดยืนยันในเว็บที่ล็อกอินเท่านั้นค่ะ";

export function formatJobLine(j: {
  job_no?: string | null; title?: string | null; status?: string | null; due?: string | null;
}): string {
  return [j.job_no || "-", j.title || "", j.status || "", j.due || ""].filter(Boolean).join(" · ");
}

export function buildSystemStatusText(input: {
  channelConfigured: boolean;
  adminRoomActive: boolean;
  pendingNotifications: number;
  failedNotifications: number;
  openJobs: number;
  controlRoomUrl: string;
}): string {
  return [
    "📊 สถานะระบบ Film Shop",
    `• LINE channel: ${input.channelConfigured ? "ตั้งค่าแล้ว" : "ยังไม่ตั้งค่า"}`,
    `• ห้องแอดมิน: ${input.adminRoomActive ? "ใช้งานอยู่" : "ยังไม่เชื่อม"}`,
    `• แจ้งเตือนรอส่ง: ${input.pendingNotifications}`,
    `• แจ้งเตือนล้มเหลว: ${input.failedNotifications}`,
    `• งานค้างในคิว: ${input.openJobs}`,
    "",
    `ห้องควบคุมงาน: ${input.controlRoomUrl}`,
  ].join("\n");
}

/* ───────────────────────── Flex (การ์ดในกลุ่ม LINE) ─────────────────────────
 * การ์ดขนาดกะทัดรัด (bubble size = "kilo") โทนเขียวน้ำทะเล #0F766E
 * ทุกการ์ดมีเวลา + ปุ่มลัด รับงาน / สรุปงาน / รีเฟรช เพื่ออัปเดตคิวได้ทันที
 */
export const QUEUE_BRAND_COLOR = "#0F766E";
export const QUEUE_MAX_ROWS = 6;

const flexText = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "text", text, wrap: true, ...extra,
});

/** หนึ่งงาน = หนึ่งบรรทัด เพื่อให้การ์ดเล็กที่สุดแต่ยังอ่านครบ */
const jobBlock = (j: QueueJobBrief, headline: string) => {
  const detail = [j.title || null, j.customer_name ? `· ${j.customer_name}` : null]
    .filter(Boolean).join(" ");
  const rows: unknown[] = [flexText(headline, { weight: "bold", size: "xs", margin: "sm" })];
  if (detail) rows.push(flexText(detail, { size: "xxs", color: "#666666" }));
  return rows;
};

const queueFooter = () => ({
  type: "box",
  layout: "horizontal",
  spacing: "xs",
  paddingAll: "8px",
  contents: [
    {
      type: "button",
      action: { type: "message", label: "รับงาน", text: "รับงาน" },
      style: "primary",
      height: "sm",
      color: QUEUE_BRAND_COLOR,
    },
    {
      type: "button",
      action: { type: "message", label: "สรุปงาน", text: "สรุปงาน" },
      style: "secondary",
      height: "sm",
    },
    {
      type: "button",
      action: { type: "message", label: "รีเฟรช", text: "รีเฟรชคิว" },
      style: "link",
      height: "sm",
    },
  ],
});

/** แถบสรุปผลลัพธ์บนสุดของการ์ด — เห็นจำนวนคิวล่าสุดทันทีหลังกดปุ่ม */
const statsRow = (stats?: QueueStats | null) => {
  const text = buildQueueStatsText(stats);
  if (!text) return [];
  return [{
    type: "box",
    layout: "vertical",
    backgroundColor: "#F0FDFA",
    cornerRadius: "6px",
    paddingAll: "6px",
    margin: "none",
    contents: [flexText(text, { size: "xxs", color: QUEUE_BRAND_COLOR, weight: "bold" })],
  }];
};

function queueBubble(title: string, bodyRows: unknown[], controlRoomUrl: string, stats?: QueueStats | null) {
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      contents: [flexText(title, { weight: "bold", color: "#ffffff", size: "sm" })],
      backgroundColor: QUEUE_BRAND_COLOR,
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "none",
      paddingAll: "10px",
      contents: [
        ...statsRow(stats),
        ...bodyRows,
        flexText(`📅 ${thaiTime()}`, { size: "xxs", color: "#999999", margin: "md" }),
        {
          type: "button",
          action: { type: "uri", label: "เปิดห้องควบคุมงาน", uri: controlRoomUrl },
          style: "link",
          height: "sm",
        },
      ],
    },
    footer: queueFooter(),
  };
}

/** ปุ่มลัดใต้ช่องพิมพ์ (Quick Reply) — 4 ปุ่มมาตรฐานตามที่ตกลงไว้ */
export const QUEUE_QUICK_REPLY_ITEMS = [
  { label: "📋 เช็คคิว", text: "เช็คคิว" },
  { label: "🔄 รับงาน", text: "รับงาน" },
  { label: "✅ สรุปงาน", text: "สรุปงาน" },
  { label: "↩️ รีเฟรช", text: "รีเฟรช" },
];

export const queueQuickReply = () => ({
  items: QUEUE_QUICK_REPLY_ITEMS.map((i) => ({
    type: "action",
    action: { type: "message", label: i.label, text: i.text },
  })),
});

/** แนบปุ่มลัดเข้ากับข้อความใด ๆ ที่บอทตอบในกลุ่มรันคิว */
export function withQueueQuickReply<T extends Record<string, unknown>>(msg: T): T {
  return { ...msg, quickReply: queueQuickReply() };
}

/** การ์ด "เช็คคิว" */
export function buildQueueListFlex(jobs: QueueJobBrief[], controlRoomUrl: string, stats?: QueueStats | null) {
  const shown = jobs.slice(0, QUEUE_MAX_ROWS);
  const s = stats ?? summarizeQueueStats(jobs);
  const rows = shown.length
    ? shown.flatMap((j, i) => jobBlock(
        j,
        `${i + 1}. [${j.status === "producing" ? "🔄 กำลังทำ" : "⏳ รอคิว"}] ${j.queue_code || j.job_no || "-"}`,
      ))
    : [flexText("ไม่มีคิวงานค้างอยู่ค่ะ", { size: "xs" })];
  if (jobs.length > shown.length) {
    rows.push(flexText(`+ อีก ${jobs.length - shown.length} งาน`, { size: "xxs", color: "#999999" }));
  }
  return withQueueQuickReply({
    type: "flex",
    altText: buildQueueListText(jobs, controlRoomUrl, s),
    contents: queueBubble("📋 คิวงานล่าสุด", rows, controlRoomUrl, s),
  });
}

/** การ์ด "รับงาน/เริ่มงาน" */
export function buildQueueTakeFlex(
  job: QueueJobBrief | null,
  controlRoomUrl: string,
  actor?: string | null,
  stats?: QueueStats | null,
) {
  const rows = job
    ? [
        ...jobBlock(job, `🔄 เริ่มงานแล้ว: ${job.queue_code || job.job_no || "-"}`),
        ...(actor ? [flexText(`👤 โดย ${actor}`, { size: "sm", color: "#555555" })] : []),
      ]
    : [flexText("📭 ไม่มีคิวงานรออยู่แล้วค่ะ", { size: "sm" })];
  return withQueueQuickReply({
    type: "flex",
    altText: buildQueueTakeText(job, controlRoomUrl, actor, stats),
    contents: queueBubble("🔄 เริ่มงาน (กำลังผลิต)", rows, controlRoomUrl, stats),
  });
}

/** การ์ด "สรุปงาน/ปิดจ๊อบ" */
export function buildQueueCloseFlex(
  closed: QueueJobBrief | null,
  next: QueueJobBrief | null,
  controlRoomUrl: string,
  actor?: string | null,
  stats?: QueueStats | null,
) {
  const rows = closed
    ? [
        ...jobBlock(closed, `✅ ปิดงาน ${closed.queue_code || closed.job_no || "-"} เรียบร้อย`),
        ...(actor ? [flexText(`👤 โดย ${actor}`, { size: "sm", color: "#555555" })] : []),
        ...(next
          ? jobBlock(next, `🔔 คิวถัดไป: ${next.queue_code || next.job_no || "-"}`)
          : [flexText("🎉 ตอนนี้ไม่มีคิวค้างในระบบแล้วค่ะ", { size: "sm", margin: "md" })]),
      ]
    : [flexText("⚠️ ไม่พบงานที่กำลังดำเนินการอยู่ในขณะนี้ค่ะ", { size: "sm" })];
  return withQueueQuickReply({
    type: "flex",
    altText: buildQueueCloseText(closed, next, controlRoomUrl, actor, stats),
    contents: queueBubble("✅ สรุปงาน", rows, controlRoomUrl, stats),
  });
}

/* ───────────────────────── การ์ด "งานปัจจุบัน · NATTA.Q" ─────────────────────────
 * การ์ดเดียวจบ ครบทุกปุ่มที่ต้องใช้ระหว่างวัน — ใช้ postback (nq:<action>:<jobId>)
 * แทนปุ่มข้อความ เพื่อให้กดซ้ำได้โดยไม่พิมพ์ และผูกกับ jobId ตรง ๆ
 */
export type CurrentJobBrief = QueueJobBrief & {
  id?: string | null;
  due?: string | null;
  assignee?: string | null;
  amount_due?: number | null;
};

const CURRENT_JOB_ACTIONS: { label: string; action: string }[] = [
  { label: "📋 เช็คคิว", action: "queue_list" },
  { label: "🔄 รับงาน", action: "queue_take" },
  { label: "✅ สรุปงาน", action: "queue_close" },
  { label: "↩️ รีเฟรช", action: "refresh" },
  { label: "📄 ใบสั่งจ้าง", action: "doc_job_order" },
  { label: "🧾 ใบเสร็จรับเงิน", action: "doc_receipt" },
];

/** ปุ่มลัด 6 ปุ่มของการ์ด "งานปัจจุบัน" — ใช้ postback data แบบเดียวกับปุ่มในบับเบิล */
export function currentJobQuickReply(jobId?: string | null) {
  return {
    items: CURRENT_JOB_ACTIONS.map((a) => ({
      type: "action",
      action: { type: "postback", label: a.label, data: `nq:${a.action}${jobId ? `:${jobId}` : ""}`, displayText: a.label },
    })),
  };
}

const money = (n?: number | null) =>
  typeof n === "number" && Number.isFinite(n) ? `฿${n.toLocaleString("th-TH")}` : "-";

/**
 * แปลง postback `nq:<action>[:jobId]` เป็น "ข้อความคำสั่งไทย" ที่ระบบเดิมรองรับอยู่แล้ว
 * เพื่อให้ปุ่มในการ์ดกับการพิมพ์เองเดินผ่าน dispatcher ตัวเดียวกันเป๊ะ ๆ (พฤติกรรมไม่แตกกัน)
 */
export const QUEUE_POSTBACK_TEXT: Record<string, string> = {
  queue_list: "เช็คคิว",
  queue_take: "รับงาน",
  queue_close: "สรุปงาน",
  refresh: "รีเฟรช",
  doc_job_order: "ใบสั่งจ้าง",
  doc_receipt: "ใบเสร็จรับเงิน",
};

export function postbackToQueueText(data: string | null | undefined): { text: string; jobId: string | null } | null {
  const raw = String(data ?? "");
  if (!raw.startsWith("nq:")) return null;
  const parts = raw.split(":");
  const text = QUEUE_POSTBACK_TEXT[parts[1] ?? ""];
  if (!text) return null;
  return { text, jobId: parts[2] || null };
}

/** รวมยอดรายการงานจริง (ใช้ตอน "สรุปงาน" เพื่อไม่ให้คิดเงินคนละสูตรกับเอกสาร) */
export function sumItemTotals(items: Array<{ total?: number | string | null }> | null | undefined): number {
  return (items ?? []).reduce((s, it) => s + (Number(it?.total) || 0), 0);
}

/** การ์ด "งานปัจจุบัน · NATTA.Q" — บับเบิลเดียว ครบทุกฟิลด์ที่ต้องใช้ + ปุ่ม 6 ช่อง (2 แถว x 3) */
export function buildCurrentJobFlex(
  job: CurrentJobBrief | null,
  opts: { controlRoomUrl: string; stats?: QueueStats | null } = { controlRoomUrl: "" },
) {
  const controlRoomUrl = opts.controlRoomUrl;
  const jobId = job?.id ?? null;
  const rows = job
    ? [
        flexText(`เลขงาน: ${job.queue_code || job.job_no || "-"}`, { weight: "bold", size: "sm" }),
        flexText(`ลูกค้า: ${job.customer_name || "-"}`, { size: "xs", color: "#374151" }),
        flexText(`รายการ: ${job.title || "-"}`, { size: "xs", color: "#374151", wrap: true }),
        flexText(`สถานะ: ${job.status === "producing" ? "🔄 กำลังทำ" : "⏳ รอคิว"}`, { size: "xs", color: "#374151" }),
        flexText(`กำหนดรับ: ${job.due || "-"}`, { size: "xs", color: "#374151" }),
        flexText(`ผู้รับงาน: ${job.assignee || "ยังไม่มีผู้รับ"}`, { size: "xs", color: "#374151" }),
        flexText(`ยอดโดยประมาณ: ${money(job.amount_due)}`, { size: "xs", color: "#374151" }),
      ]
    : [flexText("📭 ไม่มีงานที่กำลังทำอยู่ในขณะนี้ค่ะ", { size: "sm" })];

  const buttonRow = (items: typeof CURRENT_JOB_ACTIONS) => ({
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    contents: items.map((a) => ({
      type: "button",
      style: "secondary",
      height: "sm",
      action: { type: "postback", label: a.label, data: `nq:${a.action}${jobId ? `:${jobId}` : ""}`, displayText: a.label },
    })),
  });

  const contents = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "10px",
      backgroundColor: QUEUE_BRAND_COLOR,
      contents: [flexText("งานปัจจุบัน · NATTA.Q", { weight: "bold", color: "#ffffff", size: "sm" })],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "10px",
      contents: [
        ...statsRow(opts.stats),
        ...rows,
        flexText(`📅 ${thaiTime()}`, { size: "xxs", color: "#999999", margin: "md" }),
        {
          type: "button",
          action: { type: "uri", label: "เปิดห้องควบคุมงาน", uri: controlRoomUrl },
          style: "link",
          height: "sm",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "8px",
      contents: [
        buttonRow(CURRENT_JOB_ACTIONS.slice(0, 3)),
        buttonRow(CURRENT_JOB_ACTIONS.slice(3, 6)),
      ],
    },
  };

  const altText = job
    ? `งานปัจจุบัน · ${job.queue_code || job.job_no || "-"} · ${job.customer_name || "-"}`
    : "งานปัจจุบัน · ไม่มีงานที่กำลังทำอยู่";

  return {
    type: "flex",
    altText,
    contents,
    quickReply: currentJobQuickReply(jobId),
  };
}
