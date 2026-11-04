// Connect PayPal without buying anything. After the user approves in the PayPal popup, we swap
// the one-time setup token for the permanent vault token and keep it in the ledger, server-side.
import type { Ledger } from "../ledger/ledger";
import { addAudit } from "../ledger/logic";

export type ExchangeResult = { ok: true; vaultId: string; customerId?: string } | { ok: false; error: string };

export type ConnectDeps = {
  ledger: Ledger;
  exchange(setupToken: string): Promise<ExchangeResult>;
  now(): Date;
};

export async function savePaypal(setupToken: string, deps: ConnectDeps): Promise<{ saved: boolean }> {
  let result: ExchangeResult;
  try {
    result = await deps.exchange(setupToken);
  } catch {
    result = { ok: false, error: "Could not reach PayPal." };
  }
  const now = deps.now();
  if (!result.ok) {
    await deps.ledger.update((d) => addAudit(d, "paypal_connect_failed", result.ok ? "" : result.error, now));
    return { saved: false };
  }
  await deps.ledger.update((d) => {
    d.paypalVault = { vaultId: result.vaultId, customerId: result.customerId, savedAt: now.toISOString() };
    addAudit(d, "paypal_connected", "PayPal saved (no purchase)", now); // never log the token itself
  });
  return { saved: true };
}
