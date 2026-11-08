import "server-only";
import { createPaymentToken } from "../paypal";
import { getLedger } from "../ledger/server";
import { savePaypal } from "./connect";

export function runSavePaypal(userId: string, setupToken: string) {
  return savePaypal(setupToken, {
    ledger: getLedger(userId),
    now: () => new Date(),
    exchange: async (token) => {
      const r = await createPaymentToken(token);
      const vaultId = r.body?.id;
      if (!r.ok || typeof vaultId !== "string") {
        return { ok: false, error: `PayPal ${r.status}: ${JSON.stringify(r.body?.details ?? r.body?.name ?? "").slice(0, 200)}` };
      }
      return { ok: true, vaultId, customerId: r.body?.customer?.id };
    },
  });
}
