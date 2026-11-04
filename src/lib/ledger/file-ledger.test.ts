import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileLedger } from "./file-ledger";

const dirs: string[] = [];
async function ledger() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "north-ledger-"));
  dirs.push(dir);
  const file = path.join(dir, "ledger.json");
  return { file, ledger: new FileLedger(file, "America/New_York", () => new Date("2026-11-04T15:00:00Z")) };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("FileLedger", () => {
  it("starts with the demo defaults", async () => {
    const { ledger: l } = await ledger();
    const d = await l.read();
    expect(d.weeklyBudgetCents).toBe(40_000);
    expect(d.purchases).toEqual([]);
  });

  it("saves changes and reads them back", async () => {
    const { file, ledger: l } = await ledger();
    await l.update((d) => void (d.weeklyBudgetCents = 12_300));
    expect((await new FileLedger(file, "UTC").read()).weeklyBudgetCents).toBe(12_300);
  });

  it("saves nothing when a change throws", async () => {
    const { ledger: l } = await ledger();
    await expect(l.update((d) => { d.weeklyBudgetCents = 1; throw new Error("boom"); })).rejects.toThrow("boom");
    expect((await l.read()).weeklyBudgetCents).toBe(40_000);
  });

  it("does not lose changes when many updates overlap", async () => {
    const { ledger: l } = await ledger();
    await Promise.all(Array.from({ length: 25 }, () => l.update((d) => void (d.baseBalanceCents += 1))));
    expect((await l.read()).baseBalanceCents).toBe(160_025);
  });

  it("resets to the defaults", async () => {
    const { ledger: l } = await ledger();
    await l.update((d) => void (d.baseBalanceCents = 5));
    await l.reset();
    expect((await l.read()).baseBalanceCents).toBe(160_000);
  });

  it("keeps the connected PayPal when the demo is reset", async () => {
    const { ledger: l } = await ledger();
    await l.update((d) => {
      d.paypalVault = { vaultId: "V1", savedAt: "2026-11-04T00:00:00Z" };
      d.baseBalanceCents = 5;
    });
    await l.reset();
    const d = await l.read();
    expect(d.baseBalanceCents).toBe(160_000);
    expect(d.paypalVault?.vaultId).toBe("V1");
  });

  it("fails loudly on a damaged file instead of wiping it", async () => {
    const { file, ledger: l } = await ledger();
    await writeFile(file, "{not json");
    await expect(l.read()).rejects.toThrow();
  });
});
