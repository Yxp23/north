// The public front page: what North is, one tap to try it, a real decision, and the proof. Nothing here is private: it is the same for
// everyone, so it can be shown before logging in. The example decision is North's real Guardian answering for a $72.54 buy under the
// starting rules (decide() is called here, at request time), drawn with the same components as the app.
import { ArrowRight, Bot, ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";
import { DecisionCardPreview } from "./decision-card";
import { TryDemo } from "./try-demo";
import { AI_HELPER_COUNT, PLAIN_CODE_COUNT } from "@/content/actors";
import type { PracticeLogin } from "@/lib/demo/practice";
import scoreboard from "../../../attacker/latest-scoreboard.json";

export function Landing({ practice }: { practice: PracticeLogin | null }) {
  const { tried, breaches } = scoreboard.totals;
  return (
    <div className="lp">
      <section className="lp-hero" aria-labelledby="lp-h">
        <h1 id="lp-h">AI agents can now spend your money. North makes them follow your rules.</h1>
        <p className="lp-sub">
          Built first for adults with cognitive disabilities. <strong>AI suggests. Code decides.</strong>
        </p>
        <div className="lp-actions">
          <TryDemo practice={practice} />
          <Link href="/how-it-works" className="n-btn n-btn-secondary n-btn-auto">How North works <ArrowRight aria-hidden="true" /></Link>
        </div>
        <ul className="lp-proof" aria-label="Proof points">
          <li className="n-card"><Bot aria-hidden="true" /><strong>{AI_HELPER_COUNT}</strong><span>AI helpers, none can pay</span></li>
          <li className="n-card"><ShieldCheck aria-hidden="true" /><strong>{PLAIN_CODE_COUNT}</strong><span>Guardian, plain code</span></li>
          <li className="n-card"><ShieldX aria-hidden="true" /><strong>{breaches} of {tried}</strong><span>attacks got through</span></li>
        </ul>
      </section>
      <DecisionCardPreview />
    </div>
  );
}
