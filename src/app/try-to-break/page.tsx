import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import scoreboard from "../../../attacker/latest-scoreboard.json";
import { isDemoMode } from "@/lib/ledger/server";
import { BreakIt } from "./break-it";

export const metadata = { title: "Try to break North" };

async function Content() {
  await connection(); // read the demo settings when the page is asked for, not when it was built
  if (!isDemoMode()) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Try to break North</h1>
      <p className="text-lg">Pretend to be an AI assistant. Type any trick you like. North&apos;s Money Guardian answers live. This is a practice run: nothing is bought and nothing is saved.</p>
      <BreakIt />
      <section className="space-y-2" aria-labelledby="score">
        <h2 id="score" className="text-2xl font-bold">Our own attacker&apos;s latest score</h2>
        <p className="text-lg">An AI tries new tricks against North all the time (<code>npm run attack</code>). Last run: {new Date(scoreboard.at).toLocaleDateString("en-US")}.</p>
        <p className="text-xl font-semibold">{scoreboard.totals.tried} attacks tried. Money moved against the rules: ${(scoreboard.totals.movedAgainstRulesCents / 100).toFixed(2)}.</p>
        <ul className="space-y-1 text-lg">
          {Object.entries(scoreboard.categories).map(([id, c]) => (
            <li key={id}>{id.replace(/_/g, " ")}: {c.tried} tried, {c.rejected} turned away, {c.breaches} got through</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-lg">One moment…</p>}>
      <Content />
    </Suspense>
  );
}
