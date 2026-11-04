// End-to-end checkpoint against a RUNNING app and the PayPal sandbox. Real sandbox charges and refunds.
//   BASE_URL=http://localhost:3100 node scripts/e2e-checkpoint.mjs
// Needs: PayPal already connected (saved), DEMO_MODE on, and a webhook registered (scripts/webhook.mjs)
// pointing at this app, so we can watch PayPal's webhooks arrive. Easiest: scripts/e2e-with-tunnel.sh.
// Reads purchases from the app's own /api/demo/ledger, so it works with any ledger backend.
//
// Two kinds of checks:
//  - App checks must all pass. They don't depend on PayPal sending webhooks.
//  - PayPal webhook checks are reported separately. PayPal's sandbox sometimes never creates an event
//    (seen in testing: its own event log had no entry), so a missing event is a WARN, not a failure.
//    But at least one real, signature-verified webhook must arrive, or the run fails.
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
let cache = null;
const refresh = async () => (cache = await (await fetch(BASE + "/api/demo/ledger", { cache: "no-store" })).json());
const ledger = () => cache;
const buy = (productId, extra = {}) => post("/api/checkout", { productId, attemptId: `e2e-${randomUUID()}`, ...extra });
async function waitFor(fn, seconds) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < seconds) {
    await refresh();
    const v = fn();
    if (v) return { ok: true, seconds: Math.round((Date.now() - t0) / 100) / 10, value: v };
    await sleep(1000);
  }
  return { ok: false, seconds };
}

console.log(`Checkpoint against ${BASE}\n`);
await post("/api/demo/reset");
await refresh();
check((await (await fetch(BASE + "/api/summary")).json()).paypalSaved === true, "PayPal is connected (saved, no popup needed)");

// 1. Cheap item approves and charges the saved PayPal with no popup.
let r = await buy(NOTEBOOK);
check(r.json?.kind === "paid", "Notebook ($2.50) is approved and paid with no popup", `kind=${r.json?.kind}`);
await refresh();
let nb = ledger().purchases.find((p) => p.productId === NOTEBOOK);
check(nb?.status === "paid" && !!nb?.captureId, "Ledger shows it paid with a PayPal capture id", `capture=${nb?.captureId}`);

// 3. $349 headphones at 11 PM wait. Nothing is charged.
await refresh();
const before = ledger().purchases.length;
r = await buy(HEADPHONES, { pretendHour: 23 });
check(r.json?.kind === "wait" && r.json?.result?.canOverride === true, "Headphones ($349) at 11 PM wait", r.json?.result?.reason);
await refresh();
check(ledger().purchases.length === before, "Nothing was charged or recorded for the wait");

// 4. Buy now pays.
r = await buy(HEADPHONES, { pretendHour: 23, overrideWait: true });
check(r.json?.kind === "paid", "Buy now pays the $349 headphones", `kind=${r.json?.kind}`);
await refresh();
const hp = ledger().purchases.find((p) => p.productId === HEADPHONES && p.status !== "failed");

// 5. Over the protected money: refused, and Buy now can't change it.
r = await buy(SNEAKERS, { pretendHour: 12 });
check(r.json?.kind === "refused" && r.json?.result?.code === "protected_money", "Sneakers ($72.54) are refused: protected money", r.json?.result?.reason);
r = await buy(SNEAKERS, { pretendHour: 12, overrideWait: true });
check(r.json?.kind === "refused", "Buy now can't override a refuse");

// 6. A fake webhook is rejected.
r = await post("/api/paypal/webhook", { id: "WH-FAKE", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R", links: [{ rel: "up", href: "x/captures/" + hp?.captureId }] } });
check(r.status === 401, "A forged webhook is rejected (401)", `HTTP ${r.status}`);
await refresh();
check(ledger().purchases.find((p) => p.id === hp?.id)?.status !== "refunded", "…and changed nothing");

// 7. Refunds update the screen right away. (Also cleans up the sandbox.)
for (const [label, p] of [["notebook", nb], ["headphones", hp]]) {
  const rr = await post("/api/refund", { purchaseId: p?.id });
  check(rr.json?.kind === "refunded" || rr.json?.kind === "pending", `Refund requested for the ${label}`, rr.json?.kind);
  await refresh();
  check(ledger().purchases.find((x) => x.id === p?.id)?.status === "refunded", `…and the ${label} shows "refunded" on screen right away`);
}
// A second refund says "already refunded" (CAPTURE_FULLY_REFUNDED is treated as success).
r = await post("/api/refund", { purchaseId: nb?.id });
check(r.json?.kind === "already_refunded", "Refunding the notebook again says 'already refunded'", r.json?.kind);
await refresh();
check(!JSON.stringify(ledger()).includes("vault"), "The demo ledger view never shows the saved PayPal token");

const s = await (await fetch(BASE + "/api/summary")).json();
check(s.leftCents === 40000 && s.spentThisWeekCents === 0, "Home screen is back to $400.00 left", `left=${s.leftCents} spent=${s.spentThisWeekCents}`);

// 8. PayPal's webhooks (reported separately, see the note at the top).
console.log("\nWaiting up to 90s for PayPal's webhooks...");
const expected = [
  ["completed", "notebook", nb?.id], ["completed", "headphones", hp?.id],
  ["refunded", "notebook", nb?.id], ["refunded", "headphones", hp?.id],
];
const seen = (kind, id) => ledger().audit.some((e) => e.type === `webhook_${kind}` && e.detail.startsWith(id));
await waitFor(() => expected.every(([k, , id]) => seen(k, id)), 90);
await refresh();
let arrived = 0;
for (const [kind, label, id] of expected) {
  const ok = seen(kind, id);
  if (ok) arrived++;
  console.log(`${ok ? "PASS" : "WARN"}  PayPal's '${kind}' webhook for the ${label} arrived and was verified${ok ? "" : "  — not delivered (PayPal sandbox)"}`);
}
check(arrived >= 1, `At least one real PayPal webhook arrived and passed the signature check`, `${arrived} of ${expected.length} delivered`);

console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll app checks passed. PayPal webhooks delivered: ${arrived} of ${expected.length}.`);
process.exit(failures ? 1 : 0);
