import { it, expect } from "vitest";

const assertEquals = <T,>(a: T, b: T) => expect(a).toEqual(b);
import { createHmac } from "node:crypto";
import { matchChannelBySignature, type LineChannel } from "../_shared/lineChannels.ts";

const channels: LineChannel[] = [
  { id: "default", label: "shop1", secret: "s3cret-one", token: "t1" },
  { id: "shop2", label: "shop2", secret: "s3cret-two", token: "t2" },
];

const body = JSON.stringify({
  destination: "Uxxxx",
  events: [{ type: "message", source: { type: "group", groupId: "C1", userId: "U1" }, message: { type: "text", text: "เชื่อมห้องแอดมิน" } }],
});

function sign(secret: string, raw: string) {
  return createHmac("sha256", secret).update(raw).digest("base64");
}

it("valid signature resolves the signing channel", () => {
  assertEquals(matchChannelBySignature(channels, body, sign("s3cret-two", body))?.id, "shop2");
});

it("invalid / missing / tampered signatures are rejected", () => {
  assertEquals(matchChannelBySignature(channels, body, sign("wrong", body)), null);
  assertEquals(matchChannelBySignature(channels, body, null), null);
  assertEquals(matchChannelBySignature(channels, body, "not-base64!!"), null);
  assertEquals(matchChannelBySignature(channels, body + " ", sign("s3cret-one", body)), null);
});
