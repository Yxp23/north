import { describe, expect, it } from "vitest";
import { TEST_USER_ID } from "../../../test/user";
import { subkey } from "../guardian/secret";
import { MemoryNonceStore } from "../guardian/nonces";
import { verifyChain } from "../ledger/audit-chain";
import { MemoryLedger } from "../ledger/ledger";
import { summarize } from "../ledger/logic";
import { DemoStore } from "../store/demo-store";
import { seedDemoWeek, WEEK, type SeedDeps } from "./seed-week";

// The demo week is built by the real flows. These tests run them against the in-memory ledger and the demo shop (no AI, no network).
const NOW = new Date("2026-11-11T17:00:00Z"); // a Wednesday, noon in New York
const crypto = () => ({ key: subkey("approval"), nonces: new MemoryNonceStore(), now: () => NOW.getTime() });

function deps(extra: Partial<SeedDeps> = {}): SeedDeps & { ledger: MemoryLedger } {
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  let n = 0;
  return { userId: TEST_USER_ID, ledger, store: new DemoStore(), crypto: crypto(), now: () => NOW, newId: () => `id${++n}`, ...extra } as SeedDeps & { ledger: MemoryLedger };
}

describe("the demo week", () => {
  it("builds a believable week through the real flows", async () => {
    const d = deps();
    const report = await seedDemoWeek(d);
    expect(report.steps.filter((s) => s.status === "failed")).toEqual([]);
    const data = await d.ledger.read();
    const s = summarize(data, NOW);

    // about $95 spent of $400, so there is plenty left for the demo flows (the headphones, the shoes)
    expect(s.spentThisWeekCents).toBeGreaterThan(9000);
    expect(s.spentThisWeekCents).toBeLessThan(10000);
    expect(s.leftCents).toBeGreaterThan(30000);

    // receipts: two paid and one refunded; the PayPal receipt says DEMO
    expect(data.purchases.filter((p) => p.status === "paid")).toHaveLength(2);
    expect(data.purchases.filter((p) => p.status === "refunded")).toHaveLength(1);
    for (const p of data.purchases) expect(p.paypalOrderId).toMatch(/^DEMO-ORDER-/);

    // one buy was "Buy now" on a gentle wait, and it is in the audit log
    expect(s.buyNowThisWeek).toBe(1);
    expect(data.audit.some((a) => a.type === "override")).toBe(true);

    // one saved item whose timer is running (in the future), and not the headphones (the video saves those live)
    expect(s.waitingList).toHaveLength(1);
    expect(s.waitingList[0].name).toBe(WEEK.saved);
    expect(s.waitingList[0].ready).toBe(false);
    expect(new Date(s.waitingList[0].remindAt).getTime()).toBeGreaterThan(NOW.getTime());
    expect(data.waitingList.some((w) => w.productId === "ENVDwLq")).toBe(false);

    // one assistant asked, and is waiting for the person's yes
    expect(s.assistantAsks).toHaveLength(1);

    // the rules are the starting rules: gentle over $50, firm late at night
    expect(data.rules.waitOverCents.value?.strength).toBe("gentle");
    expect(data.rules.waitAfterHour.value?.strength).toBe("firm");
  });

  it("writes a tamper-evident audit log that verifies", async () => {
    const d = deps();
    await seedDemoWeek(d);
    const data = await d.ledger.read();
    const r = verifyChain(data.audit, subkey("audit"), { allowLegacyPrefix: false, partial: false });
    expect(r.ok).toBe(true);
    expect(data.audit.length).toBeGreaterThan(8);
  });

  it("is idempotent: running it again gives the same week, not a bigger one", async () => {
    const d = deps();
    await seedDemoWeek(d);
    const first = summarize(await d.ledger.read(), NOW);
    await seedDemoWeek(d);
    const second = summarize(await d.ledger.read(), NOW);
    expect(second.spentThisWeekCents).toBe(first.spentThisWeekCents);
    expect(second.waitingList).toHaveLength(1);
    expect(second.purchases).toHaveLength(first.purchases.length);
  });

  it("leaves the demo flows in the video working on top of it (the shoes)", async () => {
    const d = deps();
    await seedDemoWeek(d);
    const { decide } = await import("../guardian");
    const { buildUserState } = await import("../ledger/logic");
    const state = buildUserState(await d.ledger.read(), NOW);
    const shoes = { amountCents: 7254, item: "Running Series Sneakers", category: "shoes", at: NOW };
    // the shoes at noon: a gentle wait, and Buy now works because the budget has room for them
    expect(decide(shoes, state).decision).toBe("wait");
    expect(decide({ ...shoes, overrideWait: true }, state).decision).toBe("approve");
    // late at night: the firm rule still saves them, with no Buy now
    const late = decide({ ...shoes, hourOverride: 23 }, state);
    expect(late.decision).toBe("waitlist");
    expect(late.canOverride).toBe(false);
  });

  it("has a known consequence: the $349 headphones no longer fit this week's $400 plan, so the Guardian stops them (rent and bills stay safe)", async () => {
    const d = deps();
    await seedDemoWeek(d);
    const { decide } = await import("../guardian");
    const { buildUserState } = await import("../ledger/logic");
    const state = buildUserState(await d.ledger.read(), NOW);
    const r = decide({ amountCents: 34900, item: "Over-Ear Headphones", category: "electronics", at: NOW }, state);
    expect(r.decision).toBe("refuse");
    expect(r.code).toBe("protected_money"); // the wall that comes first: it would dip into the rent and bills money
  });

  it("skips the two AI steps, and says so, when no AI is wired in", async () => {
    const report = await seedDemoWeek(deps());
    expect(report.steps.filter((s) => s.status === "skipped").map((s) => s.name)).toEqual(["A deal check catches a scam", "The Price Watcher finds a price drop"]);
  });

  it("refuses to build a week for anyone but the practice account (in a deployed demo)", async () => {
    const { vi } = await import("vitest");
    const d = deps(); // (built before the production setting, which asks for the real secret)
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DEMO_DEPLOYMENT", "1");
    vi.stubEnv("DEMO_USER_ID", "00000000-0000-4000-8000-0000000000aa");
    try {
      await expect(seedDemoWeek(d)).rejects.toThrow(/practice account/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
