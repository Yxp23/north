// Wires checkout to the real ledger, store and PayPal. API routes call runCheckout and nothing else.
import "server-only";
import { randomUUID } from "node:crypto";
import { subkey } from "../guardian/secret";
import type { GuardianCrypto } from "../guardian/authorize";
import { getLedger, getNonceStore } from "../ledger/server";
import { getStore } from "../store";
import type { StepEvent } from "../agents/loop";
import { checkout, type CheckoutInput, type CheckoutOutcome } from "./checkout";
import { createPaypalGateway, createSimulatedGateway } from "./gateway";
import { simulatedPayments } from "./mode";

/** The one place the signing key and the spent-approvals store are put together. */
export function guardianCrypto(): GuardianCrypto {
  return { key: subkey("approval"), nonces: getNonceStore(), now: () => Date.now() };
}

export function runCheckout(userId: string, input: CheckoutInput, onStep?: (event: StepEvent) => void): Promise<CheckoutOutcome> {
  const crypto = guardianCrypto();
  const ledger = getLedger(userId);
  return checkout(input, {
    userId,
    signer: { key: crypto.key, now: crypto.now },
    ledger,
    store: getStore(),
    gateway: simulatedPayments() ? createSimulatedGateway(crypto) : createPaypalGateway(crypto),
    getVaultId: async () => (await ledger.read()).paypalVault?.vaultId ?? (simulatedPayments() ? "SIMULATED-VAULT" : null),
    now: () => new Date(),
    newId: () => `pur_${randomUUID()}`,
    onStep,
  });
}
