// Wires checkout to the real ledger, store and PayPal. API routes call runCheckout and nothing else.
import "server-only";
import { randomUUID } from "node:crypto";
import { getLedger } from "../ledger/server";
import { getStore } from "../store";
import type { StepEvent } from "../agents/loop";
import { checkout, type CheckoutInput, type CheckoutOutcome } from "./checkout";
import { paypalGateway } from "./gateway";

export function runCheckout(input: CheckoutInput, onStep?: (event: StepEvent) => void): Promise<CheckoutOutcome> {
  return checkout(input, {
    ledger: getLedger(),
    store: getStore(),
    gateway: paypalGateway,
    getVaultId: async () => (await getLedger().read()).paypalVault?.vaultId ?? null,
    now: () => new Date(),
    newId: () => `pur_${randomUUID()}`,
    onStep,
  });
}
