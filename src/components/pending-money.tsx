"use client";
// "A change that starts tomorrow", for the weekly money and the rent-and-bills money. Shown on Money and in setup. It is amber, never red: nothing went wrong.
// The old numbers stay in force until the day is over. Undo only removes the wait: it can never make anything looser.
import { Clock } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { MoneyPending } from "@/lib/ledger/types";
import { failureText } from "@/lib/ui/rate-limit-client";
import { ProblemNote } from "./states";

export function pendingMoneyWords(p: MoneyPending): string {
  const bits = [
    p.weeklyBudgetCents !== undefined && `Your weekly money goes up to ${formatMoney(p.weeklyBudgetCents)}.`,
    p.protectedCents !== undefined && `The money for rent and bills goes down to ${formatMoney(p.protectedCents)}.`,
  ].filter(Boolean);
  return `${bits.join(" ")} This lets you spend more, so it starts tomorrow. Until then, your old numbers stay.`;
}

export function PendingMoneyNote({ pending, onChanged }: { pending: MoneyPending; onChanged(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function undo() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      if (r.ok) onChanged();
      else setError(failureText("That did not work. Nothing was changed. Try again."));
    } catch {
      setError(failureText("That did not work. Nothing was changed. Try again."));
    }
    setBusy(false);
  }
  return (
    <div className="n-stack n-gap-2">
      <p role="status" className="n-note n-note-wait"><Clock aria-hidden="true" /><span>{pendingMoneyWords(pending)}</span></p>
      {error && <ProblemNote message={error} />}
      <button type="button" className="n-btn n-btn-secondary n-btn-auto" onClick={undo} disabled={busy}>{busy ? "One moment…" : "Undo this change"}</button>
    </div>
  );
}
