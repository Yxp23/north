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
    <div className="n-col" style={{ maxWidth: 720, gap: 30 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Demo · Try to break North</div>
        <h1>Try to<br />break North.</h1>
        <p>Pretend to be an AI assistant. Type any trick you like. North&apos;s Money Guardian answers live. This is a practice run: nothing is bought and nothing is saved.</p>
      </div>
      <BreakIt />
      <section className="n-stack" aria-labelledby="score">
        <h2 id="score">Our own attacker&apos;s latest score</h2>
        <p>An AI tries new tricks against North all the time (<code>npm run attack</code>). Last run: {new Date(scoreboard.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.</p>
        <p className="n-t-xl"><strong>{scoreboard.totals.tried} attacks tried.</strong> Money moved against the rules: <strong>${(scoreboard.totals.movedAgainstRulesCents / 100).toFixed(2)}</strong>.</p>
        <div className="n-card" style={{ overflowX: "auto" }}>
          <table className="hw-table">
            <caption className="ng-vh">Attacks by category</caption>
            <thead><tr><th scope="col">What was tried</th><th scope="col">Tried</th><th scope="col">Turned away</th><th scope="col">Got through</th></tr></thead>
            <tbody>
              {Object.entries(scoreboard.categories).map(([id, c]) => (
                <tr key={id}><th scope="row">{id.replace(/_/g, " ")}</th><td>{c.tried}</td><td>{c.rejected}</td><td>{c.breaches}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="n-t-lg">One moment…</p>}>
      <Content />
    </Suspense>
  );
}
