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
const NOTEBOOK = "912yTCL", HEADPHONES = "ENVDwLq", SNEAKERS = "OpovWAw"; // NOTEBOOK is now the box of paper clips (the old notebook went out of stock)

// Prices come from the live store, so they can move a little. Read them instead of hard-coding them.
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const prices = Object.fromEntries(((await (await fetch(BASE + "/api/products")).json()).products ?? []).map((p) => [p.id, p.priceCents]));
const SNEAKERS_PRICE = money(prices[SNEAKERS]);

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

// 1. Cheap item approves and charges the saved PayPal with no popup. (Pretend it is noon, so the
//    real time of day can't matter: the demo rules wait on buys after 9 PM.)
let r = await buy(NOTEBOOK, { pretendHour: 12 });
check(r.json?.kind === "paid", `Paper clips (${money(prices[NOTEBOOK])}) are approved and paid with no popup`, `kind=${r.json?.kind}`);
await refresh();
let nb = ledger().purchases.find((p) => p.productId === NOTEBOOK);
check(nb?.status === "paid" && !!nb?.captureId, "Ledger shows it paid with a PayPal capture id", `capture=${nb?.captureId}`);

// 2. FIRM rule (after 9 PM): $349 headphones at 11 PM are saved for later. No Buy now. Nothing is charged.
const before = ledger().purchases.length;
r = await buy(HEADPHONES, { pretendHour: 23 });
check(r.json?.kind === "waitlisted" && r.json?.result?.canOverride === false, "Headphones at 11 PM (firm rule): saved for later, no Buy now", r.json?.result?.reason);
r = await buy(HEADPHONES, { pretendHour: 23, overrideWait: true });
check(r.json?.kind === "waitlisted", "Buy now does not hurry a firm wait", `kind=${r.json?.kind}`);
await refresh();
check(ledger().purchases.length === before, "Nothing was charged or recorded for the waiting-list buys");
check(ledger().waitingList.filter((w) => w.status === "waiting").length === 1, "Exactly one item is on the waiting list (not saved twice)");
check(!ledger().audit.some((e) => e.type === "override"), "A firm wait is not logged as a Buy now");

// 3. A saved item keeps its OWN timer: at noon after the 11 PM save it is still "not time yet".
r = await buy(HEADPHONES, { pretendHour: 12 });
check(r.json?.kind === "waitlisted" && r.json?.result?.code === "waitlist_not_yet", "Saved headphones at noon: still 'not time yet' (the timer ignores the time of day)", r.json?.result?.reason);
r = await buy(HEADPHONES, { pretendHour: 12, overrideWait: true });
check(r.json?.kind === "waitlisted", "Buy now does not shorten the timer", `kind=${r.json?.kind}`);

// 4. GENTLE rule (over $50): the sneakers ($72.54) at noon get "Wait, or buy now?", and Buy now pays.
r = await buy(SNEAKERS, { pretendHour: 12 });
check(r.json?.kind === "wait" && r.json?.result?.canOverride === true, `Sneakers (${SNEAKERS_PRICE}) at noon (gentle rule): Wait, or buy now?`, r.json?.result?.reason);
r = await buy(SNEAKERS, { pretendHour: 12, overrideWait: true });
check(r.json?.kind === "paid", "Buy now pays the sneakers", `kind=${r.json?.kind}`);
await refresh();
const sn = ledger().purchases.find((p) => p.productId === SNEAKERS && p.status !== "failed");
const ov = ledger().audit.filter((e) => e.type === "override");
check(ov.length === 1 && ov[0].detail.includes(SNEAKERS_PRICE) && ov[0].detail.includes("big_buy"), "That Buy now was logged: what, how much, which rule", ov[0]?.detail);
check((await (await fetch(BASE + "/api/summary")).json()).buyNowThisWeek === 1, "The home screen data says: Buy now chosen 1 time this week");
check(ledger().waitingList.filter((w) => w.status === "waiting").length === 1, "The saved headphones are still on the waiting list");

// 5. Over the protected money: refused, and Buy now can't change it. ($400 spendable - the clips - the sneakers is
//    less than the $349 headphones. Walls come first, even for a saved item.)
r = await buy(HEADPHONES, { pretendHour: 12 });
check(r.json?.kind === "refused" && r.json?.result?.code === "protected_money", `Headphones (${money(prices[HEADPHONES])}) are now refused: protected money`, r.json?.result?.reason);
r = await buy(HEADPHONES, { pretendHour: 12, overrideWait: true });
check(r.json?.kind === "refused", "Buy now can't override a refuse");

// 6. A fake webhook is rejected.
r = await post("/api/paypal/webhook", { id: "WH-FAKE", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R", links: [{ rel: "up", href: "x/captures/" + sn?.captureId }] } });
check(r.status === 401, "A forged webhook is rejected (401)", `HTTP ${r.status}`);
await refresh();
check(ledger().purchases.find((p) => p.id === sn?.id)?.status !== "refunded", "…and changed nothing");

// 7. Refunds update the screen right away. (Also cleans up the sandbox.)
for (const [label, p] of [["notebook", nb], ["sneakers", sn]]) {
  const rr = await post("/api/refund", { purchaseId: p?.id });
  check(rr.json?.kind === "refunded" || rr.json?.kind === "pending", `Refund requested for the ${label}`, rr.json?.kind);
  await refresh();
  check(ledger().purchases.find((x) => x.id === p?.id)?.status === "refunded", `…and the ${label} shows "refunded" on screen right away`);
}
// A second refund says "already refunded" (CAPTURE_FULLY_REFUNDED is treated as success).
r = await post("/api/refund", { purchaseId: nb?.id });
check(r.json?.kind === "already_refunded", "Refunding the paper clips again says 'already refunded'", r.json?.kind);
await refresh();
check(!JSON.stringify(ledger()).includes("vault"), "The demo ledger view never shows the saved PayPal token");

const s = await (await fetch(BASE + "/api/summary")).json();
check(s.leftCents === 40000 && s.spentThisWeekCents === 0, "Home screen is back to $400.00 left", `left=${s.leftCents} spent=${s.spentThisWeekCents}`);

// 8. PayPal's webhooks (reported separately, see the note at the top).
console.log("\nWaiting up to 90s for PayPal's webhooks...");
const expected = [
  ["completed", "notebook", nb?.id], ["completed", "sneakers", sn?.id],
  ["refunded", "notebook", nb?.id], ["refunded", "sneakers", sn?.id],
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
