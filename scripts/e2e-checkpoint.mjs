// End-to-end checkpoint against a RUNNING app and the PayPal sandbox. Real sandbox charges and refunds.
//   BASE_URL=http://localhost:3100 node scripts/e2e-checkpoint.mjs
// Needs: PayPal already connected (saved), DEMO_MODE on, and a webhook registered (scripts/webhook.mjs)
// pointing at this app, so we can watch PayPal's webhooks arrive. Reads .data/north-ledger.json.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const NOTEBOOK = "Qez8uoD", HEADPHONES = "ENVDwLq", SNEAKERS = "OpovWAw";

let failures = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const ledger = () => JSON.parse(readFileSync(".data/north-ledger.json", "utf8"));
const buy = (productId, extra = {}) => post("/api/checkout", { productId, attemptId: `e2e-${randomUUID()}`, ...extra });
async function waitFor(fn, seconds) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < seconds) {
    const v = fn();
    if (v) return { ok: true, seconds: Math.round((Date.now() - t0) / 100) / 10, value: v };
    await sleep(1000);
  }
  return { ok: false, seconds };
}

console.log(`Checkpoint against ${BASE}\n`);
await post("/api/demo/reset");

// 1. Cheap item approves and charges the saved PayPal with no popup.
let r = await buy(NOTEBOOK);
check(r.json?.kind === "paid", "Notebook ($2.50) is approved and paid with no popup", `kind=${r.json?.kind}`);
let nb = ledger().purchases.find((p) => p.productId === NOTEBOOK);
check(nb?.status === "paid" && !!nb?.captureId, "Ledger shows it paid with a PayPal capture id", `capture=${nb?.captureId}`);

// 2. The webhook for that payment arrives and is verified.
let w = await waitFor(() => ledger().purchases.find((p) => p.id === nb?.id)?.webhookConfirmedAt, 60);
check(w.ok, "PayPal's 'payment completed' webhook arrived and passed the signature check", w.ok ? `after ${w.seconds}s` : "no webhook within 60s");

// 3. $349 headphones at 11 PM wait. Nothing is charged.
const before = ledger().purchases.length;
r = await buy(HEADPHONES, { pretendHour: 23 });
check(r.json?.kind === "wait" && r.json?.result?.canOverride === true, "Headphones ($349) at 11 PM wait", r.json?.result?.reason);
check(ledger().purchases.length === before, "Nothing was charged or recorded for the wait");

// 4. Buy now pays.
r = await buy(HEADPHONES, { pretendHour: 23, overrideWait: true });
check(r.json?.kind === "paid", "Buy now pays the $349 headphones", `kind=${r.json?.kind}`);
const hp = ledger().purchases.find((p) => p.productId === HEADPHONES && p.status !== "failed");

// 5. Over the protected money: refused, and Buy now can't change it.
r = await buy(SNEAKERS, { pretendHour: 12 });
check(r.json?.kind === "refused" && r.json?.result?.code === "protected_money", "Sneakers ($72.54) are refused: protected money", r.json?.result?.reason);
r = await buy(SNEAKERS, { pretendHour: 12, overrideWait: true });
check(r.json?.kind === "refused", "Buy now can't override a refuse");

// 6. A fake webhook is rejected.
r = await post("/api/paypal/webhook", { id: "WH-FAKE", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R", links: [{ rel: "up", href: "x/captures/" + hp?.captureId }] } });
check(r.status === 401, "A forged webhook is rejected (401)", `HTTP ${r.status}`);
check(ledger().purchases.find((p) => p.id === hp?.id)?.status !== "refunded", "…and changed nothing");

// 7. Refunds update the screen by webhook. (Also cleans up the sandbox.)
for (const [label, p] of [["notebook", nb], ["headphones", hp]]) {
  const cap = ledger().purchases.find((x) => x.id === p?.id)?.captureId;
  const rr = await post("/api/paypal/refund", { captureId: cap });
  check(rr.status === 200, `Refund requested for the ${label}`, rr.json?.refundStatus ?? JSON.stringify(rr.json).slice(0, 120));
  const wr = await waitFor(() => ledger().purchases.find((x) => x.id === p?.id)?.status === "refunded", 60);
  check(wr.ok, `…and the ${label} shows "refunded" by webhook`, wr.ok ? `after ${wr.seconds}s` : "no webhook within 60s");
}
const s = await (await fetch(BASE + "/api/summary")).json();
check(s.leftCents === 40000 && s.spentThisWeekCents === 0, "Home screen is back to $400.00 left", `left=${s.leftCents} spent=${s.spentThisWeekCents}`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
