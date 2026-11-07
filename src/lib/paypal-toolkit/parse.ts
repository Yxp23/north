// What the PayPal Agent Toolkit gives back (text), turned into plain facts. Pure, so it is tested without PayPal.
// Money becomes whole cents here, once, from PayPal's own numbers. Nothing a model wrote goes through here.

export type OrderFacts = {
  orderId: string;
  /** PayPal's order status, like COMPLETED. */
  status: string;
  amountCents: number;
  currency: string;
  /** Our purchase id, which we put on the order when we made it. */
  customId?: string;
  /** What happened to the payment itself: COMPLETED, REFUNDED, PENDING… Missing when nothing was paid yet. */
  paymentStatus?: string;
  paidAt?: string;
};
export type TransactionFacts = { id: string; amountCents: number; currency: string; status: string; at?: string; direction: "in" | "out"; subject?: string };
export type Failure = { ok: false; reason: "not_found" | "no_permission" | "unavailable" };

/** "1.93" -> 193. Null for anything that is not a plain positive money amount. */
export function cents(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.trim().replace(/,/g, "").match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function parseJson(text: string): Json | null {
  try {
    return obj(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The toolkit reports its own errors as { ok: false, status, ... }. */
function failureOf(j: Json | null): Failure | null {
  if (!j) return { ok: false, reason: "unavailable" };
  if (j.ok === false) {
    if (j.status === 404) return { ok: false, reason: "not_found" };
    if (j.status === 401 || j.status === 403) return { ok: false, reason: "no_permission" };
    return { ok: false, reason: "unavailable" };
  }
  return null;
}

export function parseOrder(text: string): { ok: true; order: OrderFacts } | Failure {
  const j = parseJson(text);
  const failed = failureOf(j);
  if (failed) return failed;
  const unit = obj((Array.isArray(j!.purchase_units) ? j!.purchase_units : [])[0]);
  const amount = obj(unit?.amount);
  const amountCents = cents(amount?.value);
  const orderId = str(j!.id);
  const status = str(j!.status);
  if (!unit || !orderId || !status || amountCents === null) return { ok: false, reason: "unavailable" };
  const capture = obj((Array.isArray(obj(unit.payments)?.captures) ? (obj(unit.payments)!.captures as unknown[]) : [])[0]);
  return {
    ok: true,
    order: {
      orderId, status, amountCents, currency: str(amount?.currency_code) ?? "USD",
      customId: str(unit.custom_id), paymentStatus: str(capture?.status), paidAt: str(capture?.create_time),
    },
  };
}

export function parseTransactions(text: string): { ok: true; transactions: TransactionFacts[] } | Failure {
  const j = parseJson(text);
  const failed = failureOf(j);
  if (failed) return failed;
  const rows = Array.isArray(j!.transaction_details) ? (j!.transaction_details as unknown[]) : null;
  if (!rows) return { ok: false, reason: "unavailable" };
  const out: TransactionFacts[] = [];
  for (const r of rows) {
    const info = obj(obj(r)?.transaction_info);
    const amt = obj(info?.transaction_amount);
    const raw = str(amt?.value);
    const c = cents(raw?.replace(/^-/, ""));
    const id = str(info?.transaction_id);
    if (!info || !id || c === null) continue; // a broken row is skipped, not guessed
    out.push({ id, amountCents: c, currency: str(amt?.currency_code) ?? "USD", status: str(info.transaction_status) ?? "?", at: str(info.transaction_initiation_date), direction: raw?.startsWith("-") ? "out" : "in", subject: str(info.transaction_subject) });
  }
  out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return { ok: true, transactions: out };
}
