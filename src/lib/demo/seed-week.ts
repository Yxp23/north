// Builds the judges' demo week by running North's REAL flows, never by writing rows:
//   reset to the starting week -> real checkouts through the real Guardian (a plain buy, a gentle wait then "Buy now", a firm save) ->
//   a real refund -> a real deal check (flags the scam seller) -> a real assistant request through the Agent Checkpoint -> a real Price Watcher run.
// Payments are practice payments (seed-gateway.ts): the same signed Guardian approvals are checked and spent, and the receipts say DEMO-ORDER.
// Every audit line is written (and chained) by the normal code, so `npm run audit:verify` passes afterwards.
// It is safe to run again and again: it always starts from the reset, so it never piles up. It refuses to run for anyone but the practice account.
// The two steps that need the AI (the scam checker and the Price Watcher's wording) are skipped, and said so, when no AI is wired in.
import { checkout, type CheckoutDeps, type CheckoutInput, type CheckoutOutcome } from "../checkout/checkout";
import { connectAgent } from "../checkpoint/keys";
import { requestPurchase, type CheckpointDeps } from "../checkpoint/service";
import type { ModelClient } from "../agents/loop";
import { runScamChecker } from "../agents/scam-checker/scam-checker";
import { applyDealVerdict } from "../dealcheck/apply";
import type { DealBackend } from "../dealcheck/backend";
import type { GuardianCrypto } from "../guardian/authorize";
import type { Ledger } from "../ledger/ledger";
import { localDate, summarize, weekStartDate } from "../ledger/logic";
import { refundPurchase } from "../refund/refund";
import type { StoreProduct, StoreProvider } from "../store";
import { runWatchCheck, type WatchBackend } from "../watcher/run";
import { demoAllowed } from "./mode";
import { createSeedGateway, createSeedRefundGateway } from "./seed-gateway";

export type SeedStepStatus = "done" | "skipped" | "failed";
export type SeedStep = { name: string; status: SeedStepStatus; note?: string };
export type SeedReport = { ok: boolean; steps: SeedStep[]; spentCents: number; leftCents: number };

export type SeedDeps = {
  userId: string;
  ledger: Ledger;
  store: StoreProvider;
  crypto: GuardianCrypto;
  now(): Date;
  newId(): string;
  /** For the two AI steps. Without it they are skipped. */
  ai?: { client: ModelClient; dealBackend: DealBackend; watchBackend: WatchBackend };
  /** Told as each step starts, for the "Start fresh" screen. */
  onStep?(label: string): void;
};

/** What the week is made of. Names are the demo shop's own (no brands). */
export const WEEK = {
  /** A plain buy, then a bigger one that waits (the gentle rule) and is bought with "Buy now". Together about $95. */
  paid: ["Cotton Crew Socks"],
  waitThenBuyNow: "Running Series Sneakers",
  /** Bought, then refunded. */
  refunded: "Canvas Tote Bag",
  /** Saved by the firm late-night rule: its timer starts now, so it is always in the future. */
  saved: "Stainless Steel Water Bottle",
  /** The assistant asks for this one. */
  assistantAsks: "Umbrella",
  scamAd: "Wool socks, 80% off today only, just $4! https://socks-clearance-outlet.shop/deal",
} as const;

const HOUR = 3_600_000;
const inFlight = new Map<string, Promise<SeedReport>>();

export function seedDemoWeek(deps: SeedDeps): Promise<SeedReport> {
  // Two seeds for the same person at once would fight over the same reset. The second just waits for the first and shares its answer.
  const running = inFlight.get(deps.userId);
  if (running) return running;
  const p = run(deps).finally(() => inFlight.delete(deps.userId));
  inFlight.set(deps.userId, p);
  return p;
}

async function run(deps: SeedDeps): Promise<SeedReport> {
  if (!demoAllowed(deps.userId)) throw new Error("The demo week can only be built for the practice account.");
  const steps: SeedStep[] = [];
  const say = (label: string) => deps.onStep?.(label);
  const step = async (name: string, work: () => Promise<string | void>) => {
    say(name);
    try {
      const note = await work();
      steps.push({ name, status: "done", ...(note ? { note } : {}) });
    } catch (e) {
      steps.push({ name, status: "failed", note: e instanceof Error ? e.message.slice(0, 160) : "That step did not work." });
    }
  };
  const skip = (name: string, note: string) => void steps.push({ name, status: "skipped", note });

  const real = deps.now();
  const tz = (await deps.ledger.read()).timeZone;
  const weekStart = weekStartDate(real, tz);
  /** `hours` ago, but never before this week began (so every buy counts toward this week). */
  const ago = (hours: number): Date => {
    const t = new Date(real.getTime() - hours * HOUR);
    return localDate(t, tz) >= weekStart ? t : real;
  };

  const products = await deps.store.listProducts();
  const find = (name: string): StoreProduct | undefined => products.find((p) => p.name === name);

  const buy = (clock: () => Date) => (input: CheckoutInput, onStep?: CheckoutDeps["onStep"]): Promise<CheckoutOutcome> =>
    checkout(input, {
      userId: deps.userId,
      signer: { key: deps.crypto.key, now: deps.crypto.now },
      ledger: deps.ledger,
      store: deps.store,
      gateway: createSeedGateway(deps.crypto),
      getVaultId: async () => "DEMO-VAULT",
      now: clock,
      newId: () => `pur_${deps.newId()}`,
      onStep,
    });
  // The demo tool "pretend it is noon" keeps the late-night rule out of the way for the daytime buys, exactly as it does in the app.
  const NOON = 12;
  const NIGHT = 23;

  await step("Starting the week fresh", async () => {
    await deps.ledger.reset(); // the saved PayPal stays, exactly as the app's own "Start over" keeps it
  });

  await step("Buying a pair of socks", async () => {
    for (const name of WEEK.paid) {
      const p = find(name);
      if (!p) throw new Error(`${name} is not in the shop.`);
      const o = await buy(() => ago(30))({ productId: p.id, attemptId: `seed-${p.id}`, pretendHour: NOON, seenCents: p.priceCents });
      if (o.kind !== "paid") throw new Error(`${name}: expected a paid buy, got ${o.kind}.`);
    }
  });

  await step("A bigger buy: the Guardian says wait, then Buy now", async () => {
    const p = find(WEEK.waitThenBuyNow);
    if (!p) throw new Error(`${WEEK.waitThenBuyNow} is not in the shop.`);
    const first = await buy(() => ago(6))({ productId: p.id, attemptId: `seed-${p.id}-ask`, pretendHour: NOON, seenCents: p.priceCents });
    if (first.kind !== "wait") throw new Error(`Expected "Wait, or buy now?", got ${first.kind}.`);
    const second = await buy(() => ago(6))({ productId: p.id, attemptId: `seed-${p.id}-now`, overrideWait: true, pretendHour: NOON, seenCents: p.priceCents });
    if (second.kind !== "paid") throw new Error(`Expected Buy now to pay, got ${second.kind}.`);
  });

  await step("A buy that is then refunded", async () => {
    const p = find(WEEK.refunded);
    if (!p) throw new Error(`${WEEK.refunded} is not in the shop.`);
    const o = await buy(() => ago(3))({ productId: p.id, attemptId: `seed-${p.id}`, pretendHour: NOON, seenCents: p.priceCents });
    if (o.kind !== "paid") throw new Error(`Expected a paid buy, got ${o.kind}.`);
    const r = await refundPurchase(o.purchase.id, {
      userId: deps.userId, signer: { key: deps.crypto.key, now: deps.crypto.now }, ledger: deps.ledger, gateway: createSeedRefundGateway(deps.crypto),
      now: () => ago(2), newId: deps.newId,
    });
    if (r.kind !== "refunded") throw new Error(`Expected a refund, got ${r.kind}.`);
  });

  await step("A late-night buy: saved for later, with its timer running", async () => {
    const p = find(WEEK.saved);
    if (!p) throw new Error(`${WEEK.saved} is not in the shop.`);
    // The real time, so the wait always ends in the future.
    const o = await buy(deps.now)({ productId: p.id, attemptId: `seed-${p.id}`, pretendHour: NIGHT, seenCents: p.priceCents });
    if (o.kind !== "waitlisted") throw new Error(`Expected "saved for later", got ${o.kind}.`);
  });

  await step("An assistant asks to buy something", async () => {
    const p = find(WEEK.assistantAsks);
    if (!p) throw new Error(`${WEEK.assistantAsks} is not in the shop.`);
    const connected = await deps.ledger.update((d) => connectAgent(d, "My assistant", real, deps.newId, deps.userId));
    if (!connected.ok) throw new Error(connected.message);
    const cp: CheckpointDeps = { ledger: deps.ledger, store: deps.store, checkout: buy(deps.now), now: deps.now, newId: deps.newId };
    const answer = await requestPurchase(cp, connected.agent, { product: p.id, quantity: 1, reason: "You asked me to find an umbrella for the rainy days.", triggeredBy: "user_request", requestKey: `seed-${p.id}` });
    if (answer.decision === "refuse") throw new Error(`The checkpoint refused the request: ${answer.reason}`);
  });

  if (deps.ai) {
    const ai = deps.ai;
    await step("A deal check catches a scam", async () => {
      say("Reading the ad…");
      const { payload, steps: s } = await runScamChecker({ client: ai.client, backend: ai.dealBackend, ad: { text: WEEK.scamAd } });
      const flagged = await applyDealVerdict(deps.ledger, payload, s.length, deps.now());
      return payload.kind === "verdict" ? `The checker said: ${payload.verdict.kind}.${flagged === "yes" ? " The seller is flagged." : ""}` : "The checker could not decide.";
    });
    await step("The Price Watcher finds a price drop", async () => {
      const r = await runWatchCheck({ ledger: deps.ledger, backend: ai.watchBackend, client: ai.client, now: deps.now, newId: () => `notice_${deps.newId()}`, pretendDropPercent: 20 });
      return `${r.notices.length} piece${r.notices.length === 1 ? "" : "s"} of price news.`;
    });
  } else {
    skip("A deal check catches a scam", "No AI is wired in here.");
    skip("The Price Watcher finds a price drop", "No AI is wired in here.");
  }

  const s = summarize(await deps.ledger.read(), deps.now());
  return { ok: steps.every((x) => x.status !== "failed"), steps, spentCents: s.spentThisWeekCents, leftCents: s.leftCents };
}
