import { describe, expect, it, vi } from "vitest";
import { checkout, type CheckoutDeps, type PayGateway } from "./checkout";
import { MemoryLedger } from "../ledger/ledger";
import { applyWebhook, buildUserState } from "../ledger/logic";
import { DemoStore } from "../store/demo-store";
import type { StoreProduct, StoreProvider } from "../store";

const NOTEBOOK = "Qez8uoD"; // $2.50
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
    ledger,
    store: opts.store ?? new DemoStore(),
    gateway,
    getVaultId: async () => (opts.vault === undefined ? "VAULT-1" : opts.vault),
    now: () => clock,
    newId: () => `pur_${++n}`,
  };
  let a = 0;
  const buy = (productId: string, extra: Partial<Parameters<typeof checkout>[0]> = {}) =>
    checkout({ productId, attemptId: `attempt-${++a}`, ...extra }, deps);
  const setClock = (d: Date) => void (clock = d);
  return { charge, ledger, deps, buy, setClock };
}

describe("approve goes to the saved-PayPal charge", () => {
  it("pays a cheap item with no popup, using the store price", async () => {
    const { charge, buy, ledger } = setup();
    const out = await buy(NOTEBOOK);
    expect(out.kind).toBe("paid");
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge.mock.calls[0][0]).toMatchObject({ vaultId: "VAULT-1", amountCents: 250, currency: "USD", customId: "pur_1" });
    const d = await ledger.read();
    expect(d.purchases[0]).toMatchObject({ status: "paid", amountCents: 250, captureId: "CAP-pur_1", paidVia: "checkout" });
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
      applyWebhook(d, { kind: "completed", eventId: "E1", captureId: "C9", customId: "pur_1" }, NOON),
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
    expect((await s.buy(NOTEBOOK, { at: ELEVEN_PM })).kind).toBe("refused"); // a notebook is not
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
  async function steps(productId: string, opts: Parameters<typeof setup>[0] = {}, extra: Partial<Parameters<typeof checkout>[0]> = {}) {
    const s = setup(opts);
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
    expect(details).toContain("Plain Notebook A5 is $2.50");
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
    if (out.kind === "paid") expect(out.leftCents).toBe(before - 250);
  });
});
