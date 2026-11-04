// Wires checkout to the real ledger, store and PayPal. API routes call runCheckout and nothing else.
import "server-only";
import { randomUUID } from "node:crypto";
import { getLedger } from "../ledger/server";
import { getStore } from "../store";
import { readVault } from "../spike-store";
import { checkout, type CheckoutInput, type CheckoutOutcome } from "./checkout";
import { paypalGateway } from "./gateway";

export function runCheckout(input: CheckoutInput): Promise<CheckoutOutcome> {
  return checkout(input, {
    ledger: getLedger(),
    store: getStore(),
    gateway: paypalGateway,
    getVaultId: async () => (await readVault())?.vaultId ?? null,
    now: () => new Date(),
    newId: () => `pur_${randomUUID()}`,
  });
}
