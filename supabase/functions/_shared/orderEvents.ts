// Central contract for EVERY order-related notification.
//
// Any flow that creates an order, moves its status, quotes a price, asks the
// customer for more info, marks it ready, cancels it or replies to the
// customer must call `notifyOrderEvent`. It is the only sanctioned producer
// for order traffic: it builds a deterministic idempotency key so a retry, a
// double-click, a webhook replay or two concurrent code paths collapse into a
// single outbox row, and delivery itself is left to `notify-dispatch`.

import { enqueueNotification, kickDispatch } from "./notifyOutbox.ts";

/** Tables that own an order in this system. Also used as `ref_type`. */
export type OrderRefType = "order" | "film_order" | "guest_order" | "document";

/** The closed set of order events the app may notify about. */
export const ORDER_EVENTS = [
  "order_created",
  "order_quoted",
  "order_price_confirmed",
  "order_info_requested",
  "order_ready",
  "order_completed",
  "order_cancelled",
  "order_status_changed",
  "order_reply",
] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

export type OrderNotifyInput = {
  event: OrderEvent;
  refType: OrderRefType;
  orderId: string | null;
  recipient: string | null;
  text: string;
  /** The status/version this event represents — part of the identity. */
  transition?: string | null;
  audience?: "admin" | "customer";
  channel?: string;
  createdBy?: string | null;
  clientRequestId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * event + ref_type + order id + recipient + channel + transition.
 * Same logical event ⇒ same key ⇒ one row, forever.
 */
export function orderEventKey(e: OrderNotifyInput): string {
  return [
    "oe",
    e.refType,
    e.orderId || "none",
    e.event,
    e.transition || "",
    e.audience || "",
    e.channel || "line",
    e.recipient || "none",
  ].join(":").slice(0, 200);
}

export async function notifyOrderEvent(admin: unknown, e: OrderNotifyInput) {
  const res = await enqueueNotification(admin, {
    event_type: e.event,
    ref_type: e.refType,
    ref_id: e.orderId,
    recipient: e.recipient,
    text: e.text,
    audience: e.audience,
    channel: e.channel || "line",
    created_by: e.createdBy ?? null,
    client_request_id: e.clientRequestId ?? null,
    meta: e.meta,
    // enqueueNotification derives its own key; force ours so the transition is
    // part of the identity.
    idempotency_key: orderEventKey(e),
  });
  return res;
}

export { kickDispatch };
