import { describe, it, expect } from "vitest";
import { orderEventKey } from "../_shared/orderEvents.ts";

const base = {
  event: "order_quoted" as const,
  refType: "order" as const,
  orderId: "11111111-1111-1111-1111-111111111111",
  recipient: "U0123456789abcdef0123456789abcdef",
  text: "hello",
  transition: "quoted",
  audience: "customer" as const,
};

const eq = (a: unknown, b: unknown) => expect(a).toEqual(b);
const neq = (a: unknown, b: unknown) => expect(a).not.toEqual(b);

describe("order event identity", () => {
  it('same logical event yields the same key regardless of text', () => {
  eq(orderEventKey(base), orderEventKey({ ...base, text: "different wording" }));
  });
  it('a different status transition is a different event', () => {
  neq(orderEventKey(base), orderEventKey({ ...base, transition: "ready" }));
  });
  it('each recipient gets its own row', () => {
  neq(orderEventKey(base), orderEventKey({ ...base, recipient: "Uffffffffffffffffffffffffffffffff" }));
  });
  it('orders in different tables never collide', () => {
  neq(orderEventKey(base), orderEventKey({ ...base, refType: "film_order" }));
  });
  it('keys stay within the column limit', () => {
  const k = orderEventKey({ ...base, orderId: "x".repeat(400) });
  eq(k.length <= 200, true);
  });
});
