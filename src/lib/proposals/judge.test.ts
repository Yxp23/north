import { describe, expect, it } from "vitest";
import { judgeProposals } from "./judge";
import { defaultLedgerData, buildUserState } from "../ledger/logic";
import { DemoStore } from "../store/demo-store";
import type { StoreProduct } from "../store";

const NOW = new Date("2026-11-06T17:00:00Z"); // noon in New York
const state = () => buildUserState(defaultLedgerData(NOW, "America/New_York"), NOW);
const product = (over: Partial<StoreProduct> = {}): StoreProduct => ({
  id: "earbuds", name: "Wireless Earbuds", category: "electronics", priceCents: 2400, currency: "USD", imageUrl: "/x.svg", tracked: false, ...over,
});
const store = (...p: StoreProduct[]) => new DemoStore(p);
const judge = (proposals: { productId: string; quantity: number; reason?: string }[], p: StoreProduct[] = [product()], opts: { flagged?: string[]; state?: ReturnType<typeof state>; at?: Date } = {}) =>
  judgeProposals(proposals.map((x) => ({ reason: "because", ...x })), { store: store(...p), state: opts.state ?? state(), flaggedSellers: opts.flagged ?? [], at: opts.at ?? NOW });

// A buy an agent suggested was NOT asked for by the user. The Guardian's hard wall refuses it, always.
describe("the Guardian judges what a tricked agent suggested", () => {
  it("refuses it, in the Guardian's own plain words", async () => {
    const [j] = await judge([{ productId: "earbuds", quantity: 3 }]);
    expect(j.result).toMatchObject({ decision: "refuse", code: "untrusted_agent", reason: "This buy was started by text in a listing, not by you. I won't pay for it." });
    expect(j.bought).toBe(false);
  });

  it("takes the price from the store, times the quantity, never from the model", async () => {
    const [j] = await judge([{ productId: "earbuds", quantity: 3 }]);
    expect(j.amountCents).toBe(7200);
    expect(j.productName).toBe("Wireless Earbuds");
  });

  it("refuses an essential, a tiny price, a late hour, a locked or gentle rule: nothing gets it past the wall", async () => {
    const odd: [string, StoreProduct[], Date][] = [
      ["a groceries item", [product({ category: "groceries", priceCents: 100 })], NOW],
      ["a medicine item", [product({ category: "medicine", priceCents: 500 })], NOW],
      ["a big buy", [product({ priceCents: 34900 })], NOW],
      ["11 PM", [product()], new Date("2026-11-07T04:00:00Z")],
      ["noon", [product({ priceCents: 1 })], NOW],
    ];
    for (const [name, p, at] of odd) {
      const [j] = await judge([{ productId: "earbuds", quantity: 1 }], p, { at });
      expect(j.result?.decision, name).toBe("refuse");
      expect(j.bought, name).toBe(false);
    }
  });

  it("refuses at every quantity, even ones the model should not ask for", async () => {
    for (const quantity of [1, 2, 3, 10, 11, 100, 0, -1, 2.5]) {
      const [j] = await judge([{ productId: "earbuds", quantity }]);
      expect(j.result?.decision, `quantity ${quantity}`).toBe("refuse");
    }
  });

  it("with plenty of money and no rules in the way, it is still refused", async () => {
    const data = defaultLedgerData(NOW, "America/New_York");
    data.rules.waitOverCents.value = null;
    data.rules.waitAfterHour.value = null;
    data.rules.waitOverCents.previous = null;
    data.rules.waitAfterHour.previous = null;
    const [j] = await judge([{ productId: "earbuds", quantity: 1 }], [product()], { state: buildUserState(data, NOW) });
    expect(j.result).toMatchObject({ decision: "refuse", code: "untrusted_agent" });
  });

  it("a flagged scam seller is refused for that reason first", async () => {
    const [j] = await judge([{ productId: "earbuds", quantity: 1 }], [product({ sellerDomain: "cheap-kicks-outlet.example" })], { flagged: ["cheap-kicks-outlet.example"] });
    expect(j.result).toMatchObject({ decision: "refuse", code: "scam_seller" });
  });

  it("a product that is not in the store: nothing to judge, nothing bought", async () => {
    const [j] = await judge([{ productId: "nope", quantity: 1 }]);
    expect(j.result).toBeNull();
    expect(j.bought).toBe(false);
    expect(j.plain).toBe("I couldn't find that product. Nothing was bought.");
  });

  it("judges each suggestion on its own", async () => {
    const js = await judge([{ productId: "earbuds", quantity: 1 }, { productId: "nope", quantity: 2 }, { productId: "earbuds", quantity: 5 }]);
    expect(js.map((j) => j.result?.code ?? null)).toEqual(["untrusted_agent", null, "untrusted_agent"]);
  });

  it("the plain sentence says nothing was bought", async () => {
    const [j] = await judge([{ productId: "earbuds", quantity: 3 }]);
    expect(j.plain).toBe("The helper suggested buying 3 of Wireless Earbuds. The Money Guardian said no: This buy was started by text in a listing, not by you. I won't pay for it. Nothing was bought.");
  });
});
