// First-run setup: "how much can I spend each week" and "how much is set aside for rent and bills". Only ever for an account with no buys yet,
// so nothing that was already protected can be loosened after the fact. Only the person's own logged-in tap reaches this (never an assistant).
import type { LedgerData } from "../ledger/types";
import { addAudit } from "../ledger/logic";

export const SETUP_LIMITS = { weeklyMaxDollars: 5000, protectedMaxDollars: 50_000 };

export type SetupResult = { ok: true; weeklyBudgetCents: number; protectedCents: number } | { ok: false; message: string };

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export function applySetup(data: LedgerData, input: { weeklyDollars: unknown; protectedDollars: unknown }, now: Date): SetupResult {
  const w = Number(input.weeklyDollars);
  const p = Number(input.protectedDollars);
  if (!Number.isFinite(w) || !Number.isFinite(p) || w < 1 || p < 0 || w > SETUP_LIMITS.weeklyMaxDollars || p > SETUP_LIMITS.protectedMaxDollars) {
    return { ok: false, message: `Please use $1 to $${SETUP_LIMITS.weeklyMaxDollars.toLocaleString("en-US")} for each week, and $0 to $${SETUP_LIMITS.protectedMaxDollars.toLocaleString("en-US")} for rent and bills.` };
  }
  if (data.purchases.length > 0) return { ok: false, message: "You already have buys, so I can't change these here." };
  const weeklyBudgetCents = Math.round(w * 100);
  const protectedCents = Math.round(p * 100);
  data.weeklyBudgetCents = weeklyBudgetCents;
  data.protectedCents = protectedCents;
  // The practice account's money: the protected amount plus plenty for the weekly plan to be the limit.
  data.baseBalanceCents = protectedCents + weeklyBudgetCents * 4;
  addAudit(data, "setup", `Weekly money ${dollars(weeklyBudgetCents)}, set aside for rent and bills ${dollars(protectedCents)}.`, now);
  return { ok: true, weeklyBudgetCents, protectedCents };
}
