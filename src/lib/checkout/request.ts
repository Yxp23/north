// What the browser may tell checkout, and nothing more. The web page sends WHAT it wants (a product), WHICH tap this is, what
// the person tapped, and (only to STOP a buy) the price it showed. It cannot send a price, a quantity, a currency, a time, an
// approval, or a user. Anything else in the body is ignored. (The assistant checkpoint, not the browser, is the only caller
// that sets a quantity.)
import type { CheckoutInput } from "./checkout";

export type ParsedCheckout = { ok: true; input: CheckoutInput } | { ok: false };

export function parseCheckoutBody(body: unknown, opts: { demoOn: boolean }): ParsedCheckout {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const b = body as Record<string, unknown>;
  if (typeof b.productId !== "string" || b.productId.length === 0 || b.productId.length > 80) return { ok: false };
  if (typeof b.attemptId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(b.attemptId)) return { ok: false };
  // The demo clock: "pretend it is 11 PM". Only when demo tools are on, and it only changes the hour the late-night rule sees.
  const pretendHour = opts.demoOn && typeof b.pretendHour === "number" && Number.isInteger(b.pretendHour) && b.pretendHour >= 0 && b.pretendHour <= 23 ? b.pretendHour : undefined;
  // The price the person saw. It can only STOP a buy whose live price is different; it never sets a price.
  const seenCents = typeof b.seenCents === "number" && Number.isSafeInteger(b.seenCents) && b.seenCents > 0 ? b.seenCents : undefined;
  return { ok: true, input: { productId: b.productId, attemptId: b.attemptId, overrideWait: b.overrideWait === true, pretendHour, seenCents } };
}
