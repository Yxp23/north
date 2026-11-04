import { describe, expect, it, vi } from "vitest";
import { savePaypal, type ConnectDeps } from "./connect";
import { MemoryLedger } from "../ledger/ledger";

const NOW = new Date("2026-11-04T17:00:00Z");
function setup(exchange: ConnectDeps["exchange"]) {
  const ledger = new MemoryLedger("America/New_York", () => NOW);
  return { ledger, deps: { ledger, exchange, now: () => NOW } satisfies ConnectDeps };
}

describe("savePaypal (vault only, no money)", () => {
  it("swaps the setup token and keeps the vault id in the ledger", async () => {
    const exchange = vi.fn(async () => ({ ok: true as const, vaultId: "VAULT-9", customerId: "CUST-1" }));
    const { ledger, deps } = setup(exchange);
    expect(await savePaypal("SETUP-1", deps)).toEqual({ saved: true });
    expect(exchange).toHaveBeenCalledWith("SETUP-1");
    const d = await ledger.read();
    expect(d.paypalVault).toEqual({ vaultId: "VAULT-9", customerId: "CUST-1", savedAt: NOW.toISOString() });
    expect(d.purchases).toHaveLength(0); // nothing was bought
    expect(d.audit.some((e) => e.type === "paypal_connected")).toBe(true);
  });

  it("does not put the token in the audit log", async () => {
    const { ledger, deps } = setup(async () => ({ ok: true, vaultId: "SECRET-VAULT-ID" }));
    await savePaypal("SETUP-SECRET", deps);
    expect(JSON.stringify((await ledger.read()).audit)).not.toMatch(/SECRET/);
  });

  it("saves nothing when PayPal says no", async () => {
    const { ledger, deps } = setup(async () => ({ ok: false, error: "nope" }));
    expect(await savePaypal("SETUP-1", deps)).toEqual({ saved: false });
    expect((await ledger.read()).paypalVault).toBeUndefined();
  });

  it("saves nothing when PayPal can't be reached", async () => {
    const { ledger, deps } = setup(async () => { throw new Error("network"); });
    expect(await savePaypal("SETUP-1", deps)).toEqual({ saved: false });
    expect((await ledger.read()).paypalVault).toBeUndefined();
  });

  it("replaces an older saved PayPal", async () => {
    const { ledger, deps } = setup(async () => ({ ok: true, vaultId: "NEW" }));
    await ledger.update((d) => void (d.paypalVault = { vaultId: "OLD", savedAt: "2026-01-01T00:00:00Z" }));
    await savePaypal("S", deps);
    expect((await ledger.read()).paypalVault?.vaultId).toBe("NEW");
  });
});
