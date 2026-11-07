// Plain words for what happened to a payment, and whether North's record and PayPal's agree. Pure code: the words are ours.
import type { OrderFacts } from "../paypal-toolkit/parse";
import type { PurchaseFact } from "./types";

export type PlainStatus = "Paid" | "Refunded" | "Partly refunded" | "Waiting" | "Did not go through" | "Not paid yet" | "Not sure";

export function oursInWords(status: PurchaseFact["status"]): PlainStatus {
  return { paid: "Paid", refunded: "Refunded", pending: "Waiting", failed: "Did not go through" }[status] as PlainStatus;
}

export function paypalInWords(o: OrderFacts): PlainStatus {
  switch (o.paymentStatus) {
    case "COMPLETED": return "Paid";
    case "REFUNDED": return "Refunded";
    case "PARTIALLY_REFUNDED": return "Partly refunded";
    case "PENDING": return "Waiting";
    case "DECLINED": case "FAILED": case "VOIDED": return "Did not go through";
    case undefined: break;
    default: return "Not sure";
  }
  // No payment on the order: the order's own status tells the story.
  if (o.status === "COMPLETED") return "Paid";
  if (o.status === "VOIDED") return "Did not go through";
  return "Not paid yet";
}

export function compareRecords(ours: Pick<PurchaseFact, "status" | "amountCents">, order: OrderFacts): { agrees: boolean; note: string } {
  const theirs = paypalInWords(order);
  if (order.amountCents !== ours.amountCents) return { agrees: false, note: "PayPal shows a different amount than North. Please ask your helper." };
  if (theirs !== oursInWords(ours.status)) return { agrees: false, note: `PayPal says ${theirs}. North says ${oursInWords(ours.status)}. It may take a minute to catch up.` };
  return { agrees: true, note: "PayPal and North agree." };
}
