// Contract test: staff replies must go through the server-side outbox, not a
// direct LINE push. The module itself calls Deno.serve at import time, so the
// contract is asserted against the source.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../reply-send-line/index.ts"),
  "utf8",
);

describe("reply-send-line", () => {
  it("enqueues into notification_outbox instead of pushing directly", () => {
    expect(src).toContain("notification_outbox_enqueue");
    expect(src).not.toContain("https://api.line.me/v2/bot/message/push");
  });

  it("uses a client_request_id-derived idempotency key", () => {
    expect(src).toContain("p_client_request_id");
    expect(src).toMatch(/staff_reply:\$\{await retryKeyFrom\(clientRequestId\)\}/);
  });

  it("kicks the worker with the internal worker token, never a hardcoded key", () => {
    expect(src).toContain("internal_worker_tokens");
    expect(src).toContain("x-worker-token");
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it("reports the reply as queued, not delivered", () => {
    expect(src).toContain("queued: true");
    expect(src).toContain("เข้าคิวส่งผ่าน LINE OA แล้ว");
    expect(src).toContain('status: "queued"');
  });
});

describe("notify-dispatch config", () => {
  it("is registered in supabase/config.toml so cron can reach it", () => {
    const toml = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../config.toml"),
      "utf8",
    );
    expect(toml).toContain("[functions.notify-dispatch]");
  });
});
