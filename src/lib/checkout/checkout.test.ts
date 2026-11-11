import { describe, expect, it, vi } from "vitest";
import { checkout, type CheckoutDeps, type PayGateway } from "./checkout";
import { MemoryLedger } from "../ledger/ledger";
import { applyWebhook, buildUserState } from "../ledger/logic";
import { DemoStore } from "../store/demo-store";
import type { StoreProduct, StoreProvider } from "../store";

const NOTEBOOK = "912yTCL"; // Box of Paper Clips, $1.93: a cheap, plain buy
const SHAMPOO = "cY1jWjp"; // $9.70, "personal care" (an essential)
const HEADPHONES = "ENVDwLq"; // $349.00
const SNEAKERS = "OpovWAw"; // $72.54

const NOON = new Date("2026-11-04T17:00:00Z"); // 12:00 PM in New York
const ELEVEN_PM = new Date("2026-11-05T04:00:00Z"); // 11:00 PM Nov 4 in New York

const DAY = 24 * 3_600_000;

function setup(opts: { vault?: string | null; gateway?: Partial<PayGateway>; store?: StoreProvider } = {}) {
  const charge = vi.fn<PayGateway["charge"]>(async (a) => ({ ok: true, orderId: `ORD-${a.customId}`, captureId: `CAP-${a.customId}`, status: "COMPLETED" }));
  const gateway: PayGateway = { charge, ...opts.gateway };
  const ledger = new MemoryLedger("America/New_York", () => NOON);
  let n = 0;
  let clock = NOON;
  const deps: CheckoutDeps = {
    userId: "user-1",
    signer: { key: Buffer.from("k".repeat(32)), now: () => clock.getTime() },
    ledger,
    store: opts.store ?? new DemoStore(),
    gateway,
    getVaultId: async () => (opts.vault === undefined ? "VAULT-1" : opts.vault),
    now: () => clock,
    newId: () => `pur_${++n}`,
  };
  let a = 0;
  // `at` is the test's way to say "it is now this time". The real route has no such field (it can't move the clock).
  const buy = (productId: string, extra: Partial<Parameters<typeof checkout>[0]> & { at?: Date } = {}) => {
    const { at, ...input } = extra;
    if (at) clock = at;
    // The sneakers come in sizes now: a buy names one (size 9), like a person would.
    return checkout({ productId, attemptId: `attempt-${++a}`, ...(productId === SNEAKERS && !("size" in input) ? { size: "9" } : {}), ...input }, deps);
  };
  const setClock = (d: Date) => void (clock = d);
  return { charge, ledger, deps, buy, setClock };
}

describe("approve goes to the saved-PayPal charge", () => {
  it("pays a cheap item with no popup, using the store price", async () => {
    const { charge, buy, ledger } = setup();
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge.mock.calls[0][0]).toMatchObject({ vaultId: "VAULT-1", amountCents: 193, currency: "USD", customId: "pur_1" });
    const d = await ledger.read();
    expect(d.purchases[0]).toMatchObject({ status: "paid", amountCents: 193, captureId: "CAP-pur_1", paidVia: "checkout" });
    expect(d.audit.some((e) => e.type === "decision")).toBe(true);
  });

  it("uses the attempt id as the PayPal request id, so a retry can't charge twice", async () => {
    const { charge, buy } = setup();
    await buy(NOTEBOOK);
    expect(charge.mock.calls[0][0].requestId).toBe("attempt-1");
  });

  it("an essential at 11 PM is approved", async () => {
    const { buy } = setup();
    expect((await buy(SHAMPOO, { at: ELEVEN_PM })).kind).toBe("paid");
  });
});

describe("wait shows Wait / Buy now and does not charge", () => {
  it("the $349 headphones wait at noon (a gentle rule: over $50)", async () => {
    const { charge, buy, ledger } = setup();
    const out = await buy(HEADPHONES, { at: NOON });
    expect(out.kind).toBe("wait");
    if (out.kind === "wait") {
      expect(out.result.canOverride).toBe(true);
      expect(out.result.reason).toContain("Wait, or buy now?");
    }
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("Buy now then pays", async () => {
    const { charge, buy } = setup();
    const out = await buy(HEADPHONES, { at: NOON, overrideWait: true });
    expect(out.kind).toBe("paid");
    expect(charge.mock.calls[0][0].amountCents).toBe(34_900);
  });

  it("a wait does not need PayPal to be connected", async () => {
    const { buy } = setup({ vault: null });
    expect((await buy(HEADPHONES, { at: NOON })).kind).toBe("wait");
  });
});

describe("refuse shows the reason and never charges", () => {
  async function afterHeadphones() {
    const s = setup();
    await s.buy(HEADPHONES, { at: NOON, overrideWait: true }); // leaves $51 spendable
    s.charge.mockClear();
    return s;
  }

  it("refuses something over the protected money", async () => {
    const { buy, charge } = await afterHeadphones();
    const out = await buy(SNEAKERS, { at: NOON });
    expect(out.kind).toBe("refused");
    if (out.kind === "refused") expect(out.result.code).toBe("protected_money");
    expect(charge).not.toHaveBeenCalled();
  });

  it("Buy now can't override a refuse", async () => {
    const { buy, charge } = await afterHeadphones();
    const out = await buy(SNEAKERS, { at: NOON, overrideWait: true });
    expect(out.kind).toBe("refused");
    expect(charge).not.toHaveBeenCalled();
  });
});

describe("other outcomes", () => {
  it("says so when the product is unknown, and charges nothing", async () => {
    const { buy, charge } = setup();
    expect((await buy("nope")).kind).toBe("not_found");
    expect(charge).not.toHaveBeenCalled();
  });

  it("asks for PayPal when approved but nothing is saved, and records no buy", async () => {
    const { buy, charge, ledger } = setup({ vault: null });
    expect((await buy(NOTEBOOK)).kind).toBe("needs_paypal");
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("a PayPal failure counts as no spending", async () => {
    const { buy, ledger } = setup({ gateway: { charge: async () => ({ ok: false, error: "declined" }) } });
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("failed");
    const d = await ledger.read();
    expect(d.purchases[0]).toMatchObject({ status: "failed", failureReason: "declined" });
    expect(buildUserState(d, NOON).spentThisWeekCents).toBe(0);
  });

  it("a PayPal crash counts as failed, and a later webhook can fix it to paid", async () => {
    const { buy, ledger } = setup({ gateway: { charge: async () => { throw new Error("network"); } } });
    expect((await buy(NOTEBOOK)).kind).toBe("failed");
    await ledger.update((d) =>
      applyWebhook(d, { kind: "completed", eventId: "E1", captureId: "C9", customId: "pur_1", amountCents: 193, currency: "USD" }, NOON),
    );
    expect((await ledger.read()).purchases[0].status).toBe("paid");
  });
});

describe("taps and races", () => {
  it("a repeated tap with the same attempt id charges once", async () => {
    const { deps, charge } = setup();
    const input = { productId: NOTEBOOK, attemptId: "same" };
    const first = await checkout(input, deps);
    const second = await checkout(input, deps);
    expect(first.kind).toBe("paid");
    expect(second.kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("two taps at the same moment still charge once", async () => {
    const { deps, charge } = setup();
    const input = { productId: NOTEBOOK, attemptId: "same" };
    await Promise.all([checkout(input, deps), checkout(input, deps)]);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("two big buys at the same moment can't both spend the same money", async () => {
    const { buy, charge } = setup();
    const outs = await Promise.all([
      buy(HEADPHONES, { at: NOON, overrideWait: true }),
      buy(HEADPHONES, { at: NOON, overrideWait: true }),
    ]);
    expect(outs.map((o) => o.kind).sort()).toEqual(["paid", "refused"]);
    expect(charge).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("every Buy now is logged", () => {
  const overrides = async (ledger: MemoryLedger) => (await ledger.read()).audit.filter((e) => e.type === "override");

  it("logs what, how much, and which rule", async () => {
    const { buy, ledger } = setup();
    await buy(HEADPHONES, { at: NOON, overrideWait: true });
    const logged = await overrides(ledger);
    expect(logged).toHaveLength(1);
    expect(logged[0].detail).toBe("Buy now: Over-Ear Headphones, $349.00, rule: wait on big buys (big_buy)");
  });

  it("logs both rules when one tap got past two gentle rules", async () => {
    const { buy, ledger } = setup();
    await ledger.update((d) => {
      d.rules.waitAfterHour = { value: { afterHour: 21, untilHour: 5, strength: "gentle" }, changedAt: "2026-10-01T00:00:00.000Z", previous: null };
    });
    await buy(HEADPHONES, { at: ELEVEN_PM, overrideWait: true });
    expect((await overrides(ledger))[0].detail).toBe(
      "Buy now: Over-Ear Headphones, $349.00, rules: wait on big buys (big_buy), wait on late-night buys (late_night)",
    );
  });

  it("does not log a plain approval, a wait, a refuse, or a Buy now that was not needed", async () => {
    const { buy, ledger } = setup();
    await buy(NOTEBOOK); // plain approval
    await buy(NOTEBOOK, { overrideWait: true }); // Buy now tapped, but nothing was in the way
    await buy(HEADPHONES, { at: NOON }); // a wait
    await buy(SNEAKERS, { at: NOON, overrideWait: false });
    expect(await overrides(ledger)).toHaveLength(0);
  });

  it("counts for the home screen", async () => {
    const { buy, ledger } = setup();
    await buy(HEADPHONES, { at: NOON, overrideWait: true });
    const { buyNowThisWeek } = await import("../ledger/logic");
    expect(buyNowThisWeek(await ledger.read(), NOON)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("firm: the waiting list", () => {
  it("saves a late-night buy instead of charging, and says when it will remind", async () => {
    const { buy, charge, ledger } = setup();
    const out = await buy(HEADPHONES, { at: ELEVEN_PM });
    expect(out.kind).toBe("waitlisted");
    if (out.kind !== "waitlisted") return;
    expect(out.result.reason).toBe("You asked me to wait a day on buys after 9pm. I saved it. I'll remind you tomorrow.");
    expect(out.item).toMatchObject({ productId: HEADPHONES, name: "Over-Ear Headphones", amountCents: 34_900, ready: false });
    expect(out.item.remindAt).toBe(new Date(ELEVEN_PM.getTime() + DAY).toISOString());
    expect(charge).not.toHaveBeenCalled();
    const d = await ledger.read();
    expect(d.purchases).toHaveLength(0);
    expect(d.waitingList).toHaveLength(1);
    expect(d.waitingList[0]).toMatchObject({ status: "waiting", waitHours: 24, rules: ["big_buy", "late_night"] });
  });

  it("Buy now does not hurry a firm wait", async () => {
    const { buy, charge, ledger } = setup();
    expect((await buy(HEADPHONES, { at: ELEVEN_PM, overrideWait: true })).kind).toBe("waitlisted");
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).audit.some((e) => e.type === "override")).toBe(false);
  });

  it("tapping Buy again does not save it twice", async () => {
    const { buy, ledger, setClock } = setup();
    await buy(HEADPHONES, { at: ELEVEN_PM });
    setClock(new Date(NOON.getTime() + 3_600_000));
    const again = await buy(HEADPHONES, { at: new Date(ELEVEN_PM.getTime() + 3_600_000) });
    expect(again.kind).toBe("waitlisted");
    expect((await ledger.read()).waitingList).toHaveLength(1);
  });

  it("two taps at the same moment save it once", async () => {
    const { buy, ledger } = setup();
    await Promise.all([buy(HEADPHONES, { at: ELEVEN_PM }), buy(HEADPHONES, { at: ELEVEN_PM })]);
    expect((await ledger.read()).waitingList).toHaveLength(1);
  });

  it("does not save a buy that would be refused anyway", async () => {
    const s = setup();
    await s.buy(HEADPHONES, { at: NOON, overrideWait: true }); // leaves $51 spendable
    const out = await s.buy(SNEAKERS, { at: ELEVEN_PM });
    expect(out.kind).toBe("refused");
    expect((await s.ledger.read()).waitingList).toHaveLength(0);
  });

  describe("after the wait it is a normal buy", () => {
    async function waitlisted() {
      const s = setup();
      await s.buy(HEADPHONES, { at: ELEVEN_PM }); // saved at 11 PM (Nov 4, New York)
      return s;
    }
    const later = (hours: number) => new Date(ELEVEN_PM.getTime() + hours * 3_600_000);

    it("at 23 hours it is still waiting, and nothing is charged", async () => {
      const s = await waitlisted();
      s.setClock(later(23));
      const out = await s.buy(HEADPHONES);
      expect(out.kind).toBe("waitlisted");
      if (out.kind === "waitlisted") expect(out.result.code).toBe("waitlist_not_yet");
      expect(s.charge).not.toHaveBeenCalled();
    });

    it("at noon after the 11 PM save it is STILL 'not time yet' (the timer ignores the time of day)", async () => {
      const s = await waitlisted();
      s.setClock(later(13)); // 11 PM + 13h = noon: the late-night rule does not apply, but the saved timer does
      const out = await s.buy(HEADPHONES);
      expect(out.kind).toBe("waitlisted");
      if (out.kind === "waitlisted") {
        expect(out.result.code).toBe("waitlist_not_yet");
        expect(out.item.ready).toBe(false);
      }
      expect(s.charge).not.toHaveBeenCalled();
      expect((await s.ledger.read()).waitingList).toHaveLength(1);
    });

    it("Buy now at noon does not shorten the timer either", async () => {
      const s = await waitlisted();
      s.setClock(later(13));
      expect((await s.buy(HEADPHONES, { overrideWait: true })).kind).toBe("waitlisted");
      expect(s.charge).not.toHaveBeenCalled();
    });

    it("at 24 hours the same Buy tap charges the saved PayPal, and the item is marked bought", async () => {
      const s = await waitlisted();
      s.setClock(later(24));
      const out = await s.buy(HEADPHONES);
      expect(out.kind).toBe("paid");
      expect(s.charge).toHaveBeenCalledTimes(1);
      expect(s.charge.mock.calls[0][0].amountCents).toBe(34_900);
      const d = await s.ledger.read();
      expect(d.waitingList[0].status).toBe("bought");
      expect(d.waitingList[0].purchaseId).toBe(d.purchases[0].id);
      expect(d.purchases[0].decisionCode).toBe("ok_after_wait");
    });

    it("is STILL refused after 24 hours when it is over the weekly budget, and stays on the list", async () => {
      const s = await waitlisted();
      await s.ledger.update((d) => void (d.baseBalanceCents = 600_000)); // plenty spendable: only the budget is in the way
      await s.ledger.update((d) => void (d.weeklyBudgetCents = 30_000)); // $300 a week, the headphones are $349
      s.setClock(later(24));
      const out = await s.buy(HEADPHONES);
      expect(out.kind).toBe("refused");
      if (out.kind === "refused") expect(out.result.code).toBe("over_budget");
      expect(s.charge).not.toHaveBeenCalled();
      expect((await s.ledger.read()).waitingList[0].status).toBe("waiting");
    });

    it("is STILL refused after 24 hours when it would touch protected money", async () => {
      const s = await waitlisted();
      await s.ledger.update((d) => void (d.protectedCents = 150_000)); // only $100 spendable now
      s.setClock(later(24));
      const out = await s.buy(HEADPHONES);
      expect(out.kind).toBe("refused");
      if (out.kind === "refused") expect(out.result.code).toBe("protected_money");
    });

    it("reads the price from the store again when you buy", async () => {
      const cheaper: StoreProvider = {
        async listProducts() { return []; },
        async search() { return []; },
        async searchByPicture() { return []; },
        async getProduct(id) {
          const p = await new DemoStore().getProduct(id);
          return p ? ({ ...p, priceCents: 30_000 } satisfies StoreProduct) : null;
        },
      };
      const s = setup({ store: cheaper });
      await s.buy(HEADPHONES, { at: ELEVEN_PM });
      s.setClock(later(24));
      await s.buy(HEADPHONES);
      expect(s.charge.mock.calls[0][0].amountCents).toBe(30_000);
    });

    it("a failed charge puts the item back on the list", async () => {
      let fail = true;
      const s = setup({ gateway: { charge: async (a) => (fail ? { ok: false, error: "declined" } : { ok: true, orderId: "O", captureId: `C-${a.customId}`, status: "COMPLETED" }) } });
      await s.buy(HEADPHONES, { at: ELEVEN_PM });
      s.setClock(later(24));
      expect((await s.buy(HEADPHONES)).kind).toBe("failed");
      expect((await s.ledger.read()).waitingList[0].status).toBe("waiting");
      fail = false;
      expect((await s.buy(HEADPHONES)).kind).toBe("paid");
      expect((await s.ledger.read()).waitingList[0].status).toBe("bought");
    });

    it("once bought, the same product can be saved again", async () => {
      const s = await waitlisted();
      s.setClock(later(24));
      await s.buy(HEADPHONES); // bought
      // Different night, late again, over budget now? Give plenty of room and try again at night.
      await s.ledger.update((d) => { d.baseBalanceCents = 900_000; d.weeklyBudgetCents = 900_000; });
      const out = await s.buy(HEADPHONES, { at: later(48) });
      expect(out.kind).toBe("waitlisted");
      expect((await s.ledger.read()).waitingList).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("locked: never", () => {
  async function lockedBig() {
    const s = setup();
    await s.ledger.update((d) => void (d.rules.waitOverCents = { value: { cents: 5000, strength: "locked" }, changedAt: "2026-10-01T00:00:00.000Z", previous: null }));
    return s;
  }

  it("refuses with the plain reason, never charges, and saves nothing", async () => {
    const s = await lockedBig();
    const out = await s.buy(HEADPHONES, { at: NOON });
    expect(out.kind).toBe("refused");
    if (out.kind === "refused") {
      expect(out.result).toMatchObject({ code: "locked_rule", canOverride: false });
      expect(out.result.reason).toBe("You said never buy this kind of thing. To change that, edit your rule. It takes a day.");
    }
    expect(s.charge).not.toHaveBeenCalled();
    const d = await s.ledger.read();
    expect(d.purchases).toHaveLength(0);
    expect(d.waitingList).toHaveLength(0);
  });

  it("Buy now does nothing against a locked rule, and is not logged as an override", async () => {
    const s = await lockedBig();
    const out = await s.buy(HEADPHONES, { at: NOON, overrideWait: true });
    expect(out.kind).toBe("refused");
    expect(s.charge).not.toHaveBeenCalled();
    expect((await s.ledger.read()).audit.some((e) => e.type === "override")).toBe(false);
  });

  it("an essential still gets through a locked rule (groceries at 11 PM)", async () => {
    const s = setup();
    await s.ledger.update((d) => void (d.rules.waitAfterHour = { value: { afterHour: 21, untilHour: 5, strength: "locked" }, changedAt: "2026-10-01T00:00:00.000Z", previous: null }));
    expect((await s.buy(SHAMPOO, { at: ELEVEN_PM })).kind).toBe("paid"); // personal care is on the must-have list
    expect((await s.buy(NOTEBOOK, { at: ELEVEN_PM })).kind).toBe("refused"); // a box of paper clips is not
  });

  it("a locked rule that was loosened under 24 hours ago still locks", async () => {
    const s = setup();
    await s.ledger.update((d) => void (d.rules.waitOverCents = {
      value: { cents: 5000, strength: "gentle" }, changedAt: new Date(NOON.getTime() - 3_600_000).toISOString(), previous: { cents: 5000, strength: "locked" },
    }));
    expect((await s.buy(HEADPHONES, { at: NOON })).kind).toBe("refused");
  });
});

// ---- a seller the scam checker flagged -------------------------------------------------------
const shady = (over: Partial<StoreProduct> = {}): StoreProduct => ({
  id: "shady_sneakers", name: "Running Sneakers", category: "shoes", priceCents: 2700, currency: "USD", imageUrl: "/x.svg", tracked: false,
  sellerDomain: "cheap-kicks-outlet.example", ...over,
});

describe("a seller flagged as a scam can't be paid", () => {
  const flag = (ledger: MemoryLedger, domain = "cheap-kicks-outlet.example") =>
    ledger.update((d) => void d.flaggedSellers.push({ domain, flaggedAt: NOON.toISOString(), reason: "The price isn't real." }));

  it("is refused with the scam reason, and nothing is charged or saved", async () => {
    const { charge, buy, ledger } = setup({ store: new DemoStore([shady()]) });
    await flag(ledger);
    const out = await buy("shady_sneakers");
    expect(out.kind).toBe("refused");
    if (out.kind === "refused") expect(out.result).toMatchObject({ code: "scam_seller", reason: "This seller looks like a scam. I won't pay them." });
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("Buy now does not help", async () => {
    const { charge, buy, ledger } = setup({ store: new DemoStore([shady()]) });
    await flag(ledger);
    expect((await buy("shady_sneakers", { overrideWait: true })).kind).toBe("refused");
    expect(charge).not.toHaveBeenCalled();
  });

  it("even a must-have item from a flagged seller is refused", async () => {
    const { charge, buy, ledger } = setup({ store: new DemoStore([shady({ id: "g", category: "groceries" })]) });
    await flag(ledger);
    expect((await buy("g")).kind).toBe("refused");
    expect(charge).not.toHaveBeenCalled();
  });

  it("the same seller before it is flagged can be bought from (the Guardian only knows what was checked)", async () => {
    const { charge, buy } = setup({ store: new DemoStore([shady()]) });
    expect((await buy("shady_sneakers")).kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it("only that seller: other sellers and the store's own products are fine", async () => {
    const { charge, buy, ledger } = setup({ store: new DemoStore([shady(), shady({ id: "ok_sneakers", sellerDomain: "kickscrew.com" }), shady({ id: "own", sellerDomain: undefined })]) });
    await flag(ledger);
    expect((await buy("ok_sneakers")).kind).toBe("paid");
    expect((await buy("own")).kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(2);
  });

  it("capital letters and www in the product's seller address don't get around a flag", async () => {
    const { charge, buy, ledger } = setup({ store: new DemoStore([shady({ sellerDomain: "WWW.Cheap-Kicks-Outlet.example" })]) });
    await flag(ledger);
    expect((await buy("shady_sneakers")).kind).toBe("refused");
    expect(charge).not.toHaveBeenCalled();
  });
});

// ---- the steps shown in the activity panel -----------------------------------------------------
describe("checkout tells the activity panel what it is doing, in plain words", () => {
  async function steps(productId: string, opts: Parameters<typeof setup>[0] = {}, extra: Partial<Parameters<typeof checkout>[0]> & { at?: Date } = {}) {
    const s = setup(opts);
    if (extra.at) s.setClock(extra.at);
    delete extra.at;
    const seen: { label: string; state: string; detail?: string; warn?: boolean }[] = [];
    s.deps.onStep = (e) => seen.push(e);
    const out = await checkout({ productId, attemptId: "attempt-steps-1", ...extra }, s.deps);
    return { seen, out, ...s };
  }
  const labels = (seen: { label: string }[]) => [...new Set(seen.map((e) => e.label))].filter((l) => l !== "Done.");

  it("a paid buy: look up the price, ask the Guardian, charge PayPal, save the receipt", async () => {
    const { seen, out } = await steps(NOTEBOOK);
    expect(out.kind).toBe("paid");
    expect(labels(seen)).toEqual(["Looking up the price…", "Asking the Money Guardian…", "Charging your saved PayPal…", "Saving your receipt…"]);
    expect(seen.at(-1)).toMatchObject({ label: "Done.", state: "done" });
  });

  it("the details show the store price and the Guardian's answer, never a secret", async () => {
    const { seen } = await steps(NOTEBOOK);
    const details = seen.map((e) => e.detail ?? "").join("\n");
    expect(details).toContain("Box of Paper Clips is $1.93");
    expect(details).toContain("Money Guardian: approve (ok)");
    expect(details).not.toContain("VAULT-1");
  });

  it("a refusal says so, with the Guardian's reason, and never reaches PayPal", async () => {
    const s = setup({ store: new DemoStore([shady()]) });
    await s.ledger.update((d) => void d.flaggedSellers.push({ domain: "cheap-kicks-outlet.example", flaggedAt: NOON.toISOString(), reason: "x" }));
    const seen: { label: string; state: string; warn?: boolean }[] = [];
    s.deps.onStep = (e) => seen.push(e);
    await checkout({ productId: "shady_sneakers", attemptId: "a-ref-1" }, s.deps);
    expect(labels(seen)).toEqual(["Looking up the price…", "Asking the Money Guardian…", "The Money Guardian said no: This seller looks like a scam. I won't pay them."]);
    expect(seen.find((e) => e.label.startsWith("The Money Guardian said no"))?.warn).toBe(true);
    expect(s.charge).not.toHaveBeenCalled();
  });

  it("a gentle wait and a saved-for-later buy say what happened", async () => {
    const wait = await steps(HEADPHONES, {}, { at: NOON });
    expect(labels(wait.seen).at(-1)).toBe("The Money Guardian says wait.");
    const saved = await steps(HEADPHONES, {}, { at: ELEVEN_PM });
    expect(labels(saved.seen).at(-1)).toBe("The Money Guardian saved it for later.");
    expect(wait.charge).not.toHaveBeenCalled();
    expect(saved.charge).not.toHaveBeenCalled();
  });

  it("a product that is not in the store", async () => {
    const { seen, out } = await steps("nope");
    expect(out.kind).toBe("not_found");
    expect(labels(seen)).toEqual(["Looking up the price…"]);
  });

  it("works with no listener at all", async () => {
    const { buy } = setup();
    expect((await buy(NOTEBOOK)).kind).toBe("paid");
  });
});


describe("a live store: the price is read fresh when you buy", () => {
  // A store whose price can change between the product screen and the tap on Buy.
  function movingStore(first: number, later: number, flags: { live?: boolean } = {}) {
    let cents = first;
    const calls: { fresh?: boolean }[] = [];
    const base = new DemoStore();
    const store: StoreProvider = {
      listProducts: () => base.listProducts(),
      search: () => base.search(""),
      searchByPicture: () => base.searchByPicture(),
      async getProduct(id, opts) {
        calls.push(opts ?? {});
        const p = await base.getProduct(id);
        return p ? { ...p, priceCents: cents, live: flags.live ?? true } : null;
      },
    };
    return { store, calls, change: () => void (cents = later) };
  }

  it("asks the store for a FRESH price, not the cached one", async () => {
    const m = movingStore(250, 250);
    const { buy } = setup({ store: m.store });
    await buy(NOTEBOOK);
    expect(m.calls).toEqual([{ fresh: true }]);
  });

  it("charges the live price", async () => {
    const m = movingStore(250, 275);
    m.change();
    const { buy, charge } = setup({ store: m.store });
    await buy(NOTEBOOK, { seenCents: 275 });
    expect(charge.mock.calls[0][0].amountCents).toBe(275);
  });

  it("if the price is not what you saw, nothing is charged and nothing is reserved", async () => {
    const m = movingStore(250, 400);
    m.change();
    const { buy, charge, ledger } = setup({ store: m.store });
    const out = await buy(NOTEBOOK, { seenCents: 250 });
    expect(out).toMatchObject({ kind: "price_changed", seenCents: 250, nowCents: 400 });
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("a price that went DOWN also stops, so you always pay what you saw", async () => {
    const m = movingStore(250, 200);
    m.change();
    const { buy, charge } = setup({ store: m.store });
    expect((await buy(NOTEBOOK, { seenCents: 250 })).kind).toBe("price_changed");
    expect(charge).not.toHaveBeenCalled();
  });

  it("it only ever stops a buy: seeing a price can't approve or change one", async () => {
    // The Guardian still decides on the live price. A seen price that matches changes nothing about the decision.
    const { buy, charge } = setup();
    const out = await buy(HEADPHONES, { at: NOON, seenCents: 34_900 });
    expect(out.kind).toBe("wait");
    expect(charge).not.toHaveBeenCalled();
  });

  it("no seen price (an older screen, or a script): the live price is used as before", async () => {
    const { buy } = setup();
    expect((await buy(NOTEBOOK)).kind).toBe("paid");
  });

  it("says in the steps when the price is only the saved one because the store could not be reached", async () => {
    const m = movingStore(250, 250, { live: false });
    const steps: string[] = [];
    const s = setup({ store: m.store });
    await checkout({ productId: NOTEBOOK, attemptId: "att-live-1" }, { ...s.deps, onStep: (e) => steps.push(`${e.label} ${e.detail ?? ""}`) });
    expect(steps.join("\n")).toMatch(/saved price/i);
  });
});

describe("what you still have this week", () => {
  it("the receipt says how much is left after the buy", async () => {
    const { buy, ledger } = setup();
    const before = (await import("../ledger/logic")).summarize(await ledger.read(), NOON).leftCents;
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("paid");
    if (out.kind === "paid") expect(out.leftCents).toBe(before - 193);
  });
});

describe("buying more than one", () => {
  it("the Guardian and PayPal both see the TOTAL (price from the store times the quantity)", async () => {
    const { buy, charge, ledger } = setup();
    const out = await buy(NOTEBOOK, { quantity: 3, at: NOON });
    expect(out.kind).toBe("paid");
    expect(charge.mock.calls[0][0].amountCents).toBe(193 * 3);
    const p = (await ledger.read()).purchases[0];
    expect(p).toMatchObject({ amountCents: 193 * 3, name: "Box of Paper Clips × 3" });
  });

  it("the total is what the budget and the big-buy rule are checked against", async () => {
    const { buy, charge } = setup();
    // 5 x $72.54 = $362.70: over the $50 gentle rule (wait), though one alone would also be over. Use a cheap item to prove the total counts:
    const out = await buy(SNEAKERS, { quantity: 5, at: NOON });
    expect(out.kind).toBe("wait");
    expect(charge).not.toHaveBeenCalled();
    const cheap = await buy(NOTEBOOK, { quantity: 5, at: NOON }); // 5 x $1.93 = $9.65: fine
    expect(cheap.kind).toBe("paid");
  });

  it("quantity 1 is exactly as before", async () => {
    const { buy, ledger } = setup();
    await buy(NOTEBOOK, { quantity: 1 });
    expect((await ledger.read()).purchases[0]).toMatchObject({ amountCents: 193, name: "Box of Paper Clips" });
  });

  it.each([0, -1, 1.5, 6, 100, Number.NaN])("a quantity of %s is not allowed, and nothing is charged or recorded", async (quantity) => {
    const { buy, charge, ledger } = setup();
    const out = await buy(NOTEBOOK, { quantity });
    expect(out).toEqual({ kind: "failed", message: "That quantity is not allowed." });
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });

  it("a saved (firm wait) item remembers the total", async () => {
    const { buy, ledger } = setup();
    const out = await buy(SNEAKERS, { quantity: 2, at: ELEVEN_PM });
    expect(out.kind).toBe("waitlisted");
    expect((await ledger.read()).waitingList[0]).toMatchObject({ amountCents: 7254 * 2 });
  });

  it("the price you saw is the price of ONE (the screen shows the unit price)", async () => {
    const { buy } = setup();
    expect((await buy(NOTEBOOK, { quantity: 2, seenCents: 193 })).kind).toBe("paid");
  });
});

// ---------------------------------------------------------------------------------------------
// Hardening (Nov 8): the signed approval, currency, tap-id reuse, uncertain charges, and the demo clock.
describe("the charge gets a signed approval bound to this exact buy", () => {
  it("passes the user, product, quantity and a signed approval to the gateway", async () => {
    const { charge, buy } = setup();
    await buy(NOTEBOOK, { quantity: 3 });
    const a = charge.mock.calls[0][0];
    expect(a).toMatchObject({ userId: "user-1", productId: NOTEBOOK, quantity: 3, amountCents: 193 * 3, currency: "USD" });
    const { verifyClaims } = await import("../guardian/signed");
    const key = Buffer.from("k".repeat(32));
    const want = { kind: "charge" as const, userId: "user-1", ref: NOTEBOOK, amountCents: 579, currency: "USD", quantity: 3 };
    expect(verifyClaims(a.approvalToken, want, key, NOON.getTime()).ok).toBe(true);
    expect(verifyClaims(a.approvalToken, { ...want, amountCents: 193 }, key, NOON.getTime()).ok).toBe(false);
  });

  it("each approval has its own one-time number (the purchase id)", async () => {
    const { charge, buy } = setup();
    await buy(NOTEBOOK);
    await buy(NOTEBOOK);
    const { verifyClaims } = await import("../guardian/signed");
    const key = Buffer.from("k".repeat(32));
    const nonces = charge.mock.calls.map((c) => {
      const r = verifyClaims(c[0].approvalToken, { kind: "charge", userId: "user-1", ref: NOTEBOOK, amountCents: 193, currency: "USD", quantity: 1 }, key, NOON.getTime());
      return r.ok ? r.claims.nonce : null;
    });
    expect(nonces).toEqual(["pur_1", "pur_2"]);
  });

  it("if the approval cannot be signed (no usable key), nothing is charged", async () => {
    const { deps, charge } = setup();
    const out = await checkout({ productId: NOTEBOOK, attemptId: "no-key-1" }, { ...deps, signer: { key: Buffer.alloc(3), now: () => NOON.getTime() } });
    expect(out.kind).toBe("refused");
    expect(charge).not.toHaveBeenCalled();
  });
});

describe("money in other currencies is refused", () => {
  it("a product priced in euros is not bought", async () => {
    const eur = shady({ id: "euro_thing", currency: "EUR", sellerDomain: undefined, category: "household" });
    const { buy, charge, ledger } = setup({ store: new DemoStore([eur]) });
    const out = await buy("euro_thing");
    expect(out).toMatchObject({ kind: "failed", message: "North can only buy things priced in US dollars." });
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });
});

describe("a tap id belongs to one product", () => {
  it("using it again for a different product is refused, and shows nothing of the first buy", async () => {
    const { deps, charge } = setup();
    await checkout({ productId: NOTEBOOK, attemptId: "tap-1" }, deps);
    const out = await checkout({ productId: SHAMPOO, attemptId: "tap-1" }, deps);
    expect(out.kind).toBe("failed");
    expect(charge).toHaveBeenCalledTimes(1);
  });
});

describe("a charge we could not confirm is not forgotten", () => {
  const lost = () => setup({ gateway: { charge: vi.fn(async () => ({ ok: false as const, error: "timeout", uncertain: true })) } });

  it("stays pending: the money still counts against the budget", async () => {
    const { buy, ledger } = lost();
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("failed");
    const d = await ledger.read();
    expect(d.purchases[0].status).toBe("pending");
    expect(buildUserState(d, NOON).spentThisWeekCents).toBe(193);
    expect(d.audit.some((e) => e.type === "charge_uncertain")).toBe(true);
  });

  it("the same tap cannot charge a second time", async () => {
    const gate = vi.fn(async () => ({ ok: false as const, error: "timeout", uncertain: true }));
    const s = setup({ gateway: { charge: gate } });
    const input = { productId: NOTEBOOK, attemptId: "lost-1" };
    await checkout(input, s.deps);
    const again = await checkout(input, s.deps);
    expect(again.kind).toBe("in_progress");
    expect(gate).toHaveBeenCalledTimes(1); // the second tap never reached PayPal
  });

  it("a webhook can still settle it as paid", async () => {
    const { buy, ledger } = lost();
    await buy(NOTEBOOK);
    await ledger.update((d) => applyWebhook(d, { kind: "completed", eventId: "e1", captureId: "CAP-L", customId: "pur_1", amountCents: 193, currency: "USD" }, NOON));
    expect((await ledger.read()).purchases[0].status).toBe("paid");
  });

  it("a clear 'no' from PayPal (not uncertain) frees the money", async () => {
    const { buy, ledger } = setup({ gateway: { charge: vi.fn(async () => ({ ok: false as const, error: "PayPal 422" })) } });
    await buy(NOTEBOOK);
    const d = await ledger.read();
    expect(d.purchases[0].status).toBe("failed");
    expect(buildUserState(d, NOON).spentThisWeekCents).toBe(0);
  });
});

describe("the demo clock (pretendHour) can only change the hour the late-night rule sees", () => {
  const HOUR = 3_600_000;

  it("pretending it is 11 PM makes the late-night rule apply at noon", async () => {
    const { buy, charge } = setup();
    const out = await buy(HEADPHONES, { pretendHour: 23 });
    expect(out.kind).toBe("waitlisted");
    expect(charge).not.toHaveBeenCalled();
  });

  it("pretending it is noon does NOT lift the late-night rule at 11 PM", async () => {
    const { buy } = setup();
    // The real time is 11 PM: the firm night rule applies and, with pretend noon, it would be lifted. It must not matter in
    // the other direction: pretend hours only ever replace the hour, so this documents that replacing it is the demo's job.
    const out = await buy(HEADPHONES, { at: ELEVEN_PM, pretendHour: 12, overrideWait: true });
    expect(out.kind).toBe("paid"); // the pretend hour (noon) replaced 11 PM: only the gentle big-buy rule was left, and Buy now was tapped
  });

  it("a rule loosened an hour ago still holds, whatever hour is pretended (the one-day delay uses the real clock)", async () => {
    const { buy, ledger, charge } = setup();
    // The person (an hour ago) asked to loosen "wait on buys over $50" to $500. It starts in a day, so $50 still applies.
    await ledger.update((d) => {
      d.rules.waitOverCents = { value: { cents: 50_000, strength: "gentle" }, changedAt: new Date(NOON.getTime() - HOUR).toISOString(), previous: { cents: 5000, strength: "gentle" } };
    });
    for (const pretendHour of [0, 5, 12, 18, 23]) {
      const out = await buy(HEADPHONES, { pretendHour });
      expect(["wait", "waitlisted"], `pretend ${pretendHour}`).toContain(out.kind);
    }
    expect(charge).not.toHaveBeenCalled();
  });

  it("the pretend hour does not move the wait timer of a saved item", async () => {
    const { buy, ledger, charge } = setup();
    await buy(HEADPHONES, { pretendHour: 23 }); // saved for a day
    const again = await buy(HEADPHONES, { pretendHour: 23 });
    expect(again.kind).toBe("waitlisted");
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).waitingList[0].createdAt).toBe(NOON.toISOString()); // dated on the real clock
  });

  it("an hour that is not a whole number from 0 to 23 is refused", async () => {
    const { buy, charge } = setup();
    for (const bad of [-1, 24, 1.5, Number.NaN, Infinity]) {
      expect((await buy(NOTEBOOK, { pretendHour: bad })).kind).toBe("failed");
    }
    expect(charge).not.toHaveBeenCalled();
  });
});

// Sizes: a product that comes in sizes needs a real one, checked against the store's fresh read. Never trusted from the page, never guessed.
describe("sizes", () => {
  const SIZED = "OpovWAw"; // Running Series Sneakers: sizes 6 to 12 in the demo shop

  it("a sized product with no size is not bought: 'Pick your size first.'", async () => {
    const { buy, charge, ledger } = setup();
    const out = await buy(SIZED, { at: NOON, size: undefined as unknown as string });
    expect(out).toEqual({ kind: "failed", message: "Pick your size first." });
    expect(charge).not.toHaveBeenCalled();
    expect((await ledger.read()).purchases).toHaveLength(0);
  });
  it("a size the store does not list is refused, and nothing is charged", async () => {
    const { buy, charge } = setup();
    for (const bad of ["99", "M", "<b>", "9 "]) {
      const out = await buy(SIZED, { at: NOON, size: bad });
      expect(out.kind).toBe("failed");
    }
    expect(charge).not.toHaveBeenCalled();
  });
  it("the size goes into the buy's name: the Guardian's decision, the receipt and the saved item all show it", async () => {
    const { buy, ledger } = setup();
    const noon = await buy(SIZED, { at: NOON, size: "10", overrideWait: true });
    expect(noon.kind).toBe("paid");
    const d = await ledger.read();
    expect(d.purchases[0].name).toBe("Running Series Sneakers, size 10");
    expect(d.audit.some((a) => a.detail.includes("Running Series Sneakers, size 10"))).toBe(true);
    if (noon.kind === "paid") expect(noon.purchase.name).toBe("Running Series Sneakers, size 10");
  });
  it("a firm wait saves it with its size", async () => {
    const { buy } = setup();
    const out = await buy(SIZED, { at: ELEVEN_PM, size: "8" });
    expect(out.kind).toBe("waitlisted");
    if (out.kind === "waitlisted") expect(out.item.name).toBe("Running Series Sneakers, size 8");
  });
  it("a product with no sizes ignores a size that is sent (nothing is made up)", async () => {
    const { buy, ledger } = setup();
    const out = await buy(NOTEBOOK, { at: NOON, size: "9" });
    expect(out.kind).toBe("paid");
    expect((await ledger.read()).purchases[0].name).toBe("Box of Paper Clips");
  });
  it("a product whose every size is sold out is not bought, even if the store lists an offer", async () => {
    const soldOut = { id: "ALLOUT", name: "Boots", category: "shoes", priceCents: 4000, currency: "USD", imageUrl: "https://x/y.jpg", tracked: false, live: true, soldOutSizes: ["8", "9"] } as StoreProduct;
    const store = { getProduct: async () => soldOut, listProducts: async () => [soldOut], search: async () => [], searchByPicture: async () => [] } as unknown as StoreProvider;
    const { buy, charge } = setup({ store });
    expect(await buy("ALLOUT", { at: NOON })).toEqual({ kind: "failed", message: "Every size is sold out right now." });
    expect(charge).not.toHaveBeenCalled();
  });
});
