import { describe, expect, it, vi } from "vitest";
import { MemoryLedger } from "../ledger/ledger";
import type { WaitingItem } from "../ledger/types";
import { startWatch } from "./state";
import { runWatchCheck, type WatchBackend } from "./run";
import type { StepEvent } from "../agents/loop";
import { reply, scripted, text, toolUse } from "../../../test/fake-model";

const NOW = new Date("2026-11-07T15:00:00Z");
const waiting = (id: string, amountCents = 34_900): WaitingItem => ({
  id: `wait_${id}`, productId: id, name: `Headphones ${id}`, category: "electronics", imageUrl: "https://i/x.jpg", amountCents, currency: "USD",
  createdAt: "2026-11-05T10:00:00.000Z", remindAt: "2026-11-06T10:00:00.000Z", waitHours: 24, rules: ["late_night"], status: "waiting",
});
const say = (...d: unknown[]) => reply([toolUse("submit_decisions", { decisions: d })]);
const tell = (item: string, message = "The {name} you waited on is {drop} cheaper now. Still want it?", kind = "drop") => ({ item, notify: true, kind, message });

function setup(over: { prices?: Record<string, number | null>; backend?: Partial<WatchBackend> } = {}) {
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  const prices = over.prices ?? {};
  const backend: WatchBackend = {
    read: vi.fn(async (id: string) => ({ available: prices[id] !== null, priceCents: prices[id] === undefined ? 34_900 : prices[id], history: null })),
    history: vi.fn(async () => null),
    ...over.backend,
  };
  let n = 0;
  const run = async (replies: Parameters<typeof scripted>[0] = [say()], extra: { pretendDropPercent?: number } = {}) => {
    const m = scripted(replies);
    const steps: StepEvent[] = [];
    const result = await runWatchCheck({ ledger, backend, client: m.client, now: () => NOW, newId: () => `notice_${++n}`, onStep: (s) => steps.push(s), ...extra });
    return { result, m, steps };
  };
  return { ledger, backend, run, prices };
}

describe("checking the prices of what the user is waiting on", () => {
  it("with nothing to watch there is nothing to do, and no AI call", async () => {
    const { run } = setup();
    const { result, m, steps } = await run();
    expect(result).toMatchObject({ checked: 0, notices: [] });
    expect(m.calls()).toBe(0);
    expect(steps.map((s) => s.label)).toContain("You are not waiting on anything yet.");
  });

  it("watches everything on the waiting list, tells the user about a real drop, and remembers it", async () => {
    const { ledger, run } = setup({ prices: { H: 28_900 } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const { result } = await run([say(tell("w1"))]);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ id: "notice_1", productId: "H", kind: "drop", priceCents: 28_900, message: "The Headphones H you waited on is $60.00 cheaper now. Still want it?", dismissed: false });
    const d = await ledger.read();
    expect(d.priceWatch.notices).toHaveLength(1);
    expect(d.priceWatch.watches[0]).toMatchObject({ productId: "H", lastCents: 28_900, lastNoticeKey: "drop:28900", lastCheckedAt: NOW.toISOString() });
    expect(d.audit.some((a) => a.type === "price_watch")).toBe(true);
  });

  it("the same news is not told twice, and costs no AI call the second time", async () => {
    const { ledger, run } = setup({ prices: { H: 28_900 } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    await run([say(tell("w1"))]);
    const { result, m } = await run([say(tell("w1"))]);
    expect(result.notices).toEqual([]);
    expect(m.calls()).toBe(0);
    expect((await ledger.read()).priceWatch.notices).toHaveLength(1);
  });

  it("no change: no news, no AI call, but the check is recorded", async () => {
    const { ledger, run } = setup();
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const { result, m } = await run();
    expect(result).toMatchObject({ checked: 1, notices: [] });
    expect(m.calls()).toBe(0);
    expect((await ledger.read()).priceWatch.watches[0].lastCheckedAt).toBe(NOW.toISOString());
  });

  it("sold out is told once, and back in stock later", async () => {
    const { ledger, run, prices } = setup({ prices: { H: null } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const soldOut = await run([say(tell("w1", "The {name} you waited on is sold out right now.", "sold_out"))]);
    expect(soldOut.result.notices[0]).toMatchObject({ kind: "sold_out" });
    expect((await run()).result.notices).toEqual([]); // still sold out: nothing new
    prices.H = 34_900;
    const back = await run([say(tell("w1", "The {name} is back at {price}. Still want it?", "back_in_stock"))]);
    expect(back.result.notices[0]).toMatchObject({ kind: "back_in_stock", message: "The Headphones H is back at $349.00. Still want it?" });
  });

  it("items the user chose to wait on are watched too", async () => {
    const { ledger, run } = setup({ prices: { A: 20_000 } });
    await ledger.update((d) => void startWatch(d, { id: "A", name: "Thing A", imageUrl: "https://i/x.jpg", priceCents: 25_000 }, NOW));
    const { result } = await run([say(tell("w1"))]);
    expect(result.notices[0]).toMatchObject({ productId: "A", message: "The Thing A you waited on is $50.00 cheaper now. Still want it?" });
  });

  it("an item that was bought is no longer watched", async () => {
    const { ledger, run, backend } = setup({ prices: { H: 28_900 } });
    await ledger.update((d) => {
      d.waitingList.push(waiting("H"));
      d.purchases.push({ id: "pur_1", attemptId: "a1", productId: "H", name: "n", category: "c", imageUrl: "https://i/x.jpg", amountCents: 100, currency: "USD", status: "paid", createdAt: "2026-11-07T12:00:00.000Z", overrodeWait: false, decisionCode: "ok" });
      d.waitingList[0].status = "bought";
    });
    const { result } = await run();
    expect(result.checked).toBe(0);
    expect(backend.read).not.toHaveBeenCalled();
  });

  it("when the AI can't finish, nothing is marked as seen, so the news is not lost", async () => {
    const { ledger, run, prices } = setup({ prices: { H: null } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const failed = await run([reply([text("hm")], "end_turn")]);
    expect(failed.result.error).toBeTruthy();
    expect(failed.result.notices).toEqual([]);
    expect((await ledger.read()).priceWatch.watches[0]).toMatchObject({ lastAvailable: true }); // not recorded as gone
    prices.H = null;
    const again = await run([say(tell("w1", "The {name} you waited on is sold out right now.", "sold_out"))]);
    expect(again.result.notices).toHaveLength(1);
  });

  it("a quiet decision is remembered at that price, so it is not asked again until the price moves", async () => {
    const { ledger, run, prices } = setup({ prices: { H: 34_000 } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    await run([say({ item: "w1", notify: false, why: "Small" })]);
    expect((await run([say(tell("w1"))])).m.calls()).toBe(0);
    prices.H = 28_900;
    expect((await run([say(tell("w1"))])).result.notices).toHaveLength(1);
  });

  it("an item the store can't read right now is skipped, and the others are still checked", async () => {
    const { ledger, run } = setup({
      backend: { read: vi.fn(async (id: string) => { if (id === "BAD") throw new Error("down"); return { available: true, priceCents: 28_900, history: null }; }) },
    });
    await ledger.update((d) => { d.waitingList.push(waiting("BAD"), waiting("OK")); });
    const { result } = await run([say(tell("w1"))]);
    expect(result.checked).toBe(1);
    expect(result.notices.map((n) => n.productId)).toEqual(["OK"]);
  });

  it("checks at most 10 items in one go", async () => {
    const { ledger, run, backend } = setup();
    await ledger.update((d) => { for (let i = 0; i < 14; i++) d.waitingList.push(waiting(`P${i}`)); });
    await run();
    expect(backend.read).toHaveBeenCalledTimes(10);
  });
});

describe("Channel3 price tracking", () => {
  it("asks Channel3 to track an item the first time it is seen, and not again", async () => {
    const track = vi.fn(async () => undefined);
    const { ledger, run } = setup({ backend: { track } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const { steps } = await run();
    expect(track).toHaveBeenCalledWith("H");
    expect(steps.some((s) => /track the price of Headphones H/.test(s.label))).toBe(true);
    await run();
    expect(track).toHaveBeenCalledTimes(1);
  });
  it("a tracking failure doesn't stop the price check", async () => {
    const { ledger, run } = setup({ backend: { track: vi.fn(async () => { throw new Error("nope"); }) } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    expect((await run()).result.checked).toBe(1);
  });
});

describe("the activity panel", () => {
  it("shows each price check, with the price from the store, in plain words", async () => {
    const { ledger, run } = setup({ prices: { H: 28_900 } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const { steps } = await run([say(tell("w1"))]);
    const done = steps.find((s) => s.state === "done" && s.label === "Checking the price of Headphones H…");
    expect(done?.detail).toMatch(/\$289/);
    expect(steps.at(-1)).toMatchObject({ label: "Done.", state: "done" });
  });
  it("sold out is said plainly", async () => {
    const { ledger, run } = setup({ prices: { H: null } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const { steps } = await run([say(tell("w1", "{name} is sold out.", "sold_out"))]);
    expect(steps.find((s) => s.label === "Checking the price of Headphones H…" && s.state === "done")?.detail).toMatch(/sold out/i);
  });
});

describe("the demo's pretend price drop", () => {
  it("lowers the prices it reads by that percent, says so in the panel, and the news is about the pretend price", async () => {
    const { ledger, run } = setup({ prices: { H: 34_900 } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    const { result, steps } = await run([say(tell("w1"))], { pretendDropPercent: 20 });
    expect(steps.some((s) => s.warn && /Pretend test/.test(s.label))).toBe(true);
    expect(result.notices[0].priceCents).toBe(27_920);
  });

  it("a pretend price is not remembered as the real last price", async () => {
    const { ledger, run } = setup({ prices: { H: 34_900 } });
    await ledger.update((d) => void d.waitingList.push(waiting("H")));
    await run([say(tell("w1"))], { pretendDropPercent: 20 });
    const w = (await ledger.read()).priceWatch.watches[0];
    expect(w.lastCents).toBe(34_900);
    expect(w.lastCheckedAt).toBeUndefined();
  });
});
