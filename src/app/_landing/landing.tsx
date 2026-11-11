// The public front page (V2, "the checkpoint"): what North is, one tap to try it, the animated checkpoint, how it decides, who it is for, and the
// proof. Nothing here is private: it is the same for everyone. Built from design/landing-v2-reference.html in our design system (src/app/north-landing.css).
// The numbers come from the same places "How North works" reads them (content/actors.ts, the approval's own lifetime, the attacker scoreboard).
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CheckpointStage } from "./stage";
import { LandingAppearance } from "./landing-appearance";
import { TryDemo } from "./try-demo";
import { AI_HELPER_COUNT, PLAIN_CODE_COUNT } from "@/content/actors";
import type { PracticeLogin } from "@/lib/demo/practice";
import { APPROVAL_TTL_MS } from "@/lib/guardian/signed";
import scoreboard from "../../../attacker/latest-scoreboard.json";

const WORDS_1 = ["AI", "can", "spend", "your", "money", "now."];
const WORDS_2 = ["Not", "without", "your", "rules."];

const OUTCOMES = [
  { tag: "Approved", cls: "lp2-ok", title: "Fits your rules? PayPal pays.", text: "Groceries, bills, the things you planned. North says yes in a second, and shows what is left for the week." },
  { tag: "Wait", cls: "lp2-wt", title: "Your rule says wait? I save it.", text: "Late-night buys and big ones wait for you, and I watch the price meanwhile. Gentle rules still let you tap Buy now." },
  { tag: "Stopped", cls: "lp2-no", title: "Rent money or a scam? Never.", text: "Some walls never move: rent and bills, your weekly money, and sellers flagged as scams. Nothing is charged." },
];

const MADE_FOR = [
  { title: "Money in real things", text: "$72 is about 6 lunches. Numbers come with something you can picture." },
  { title: "Hear it out loud", text: "Every answer can read itself to you, in plain words." },
  { title: "One choice at a time", text: "Big buttons, one decision per screen, nothing hidden in small print." },
  { title: "Rules in your own words", text: "\"Wait a day on anything after 9 PM.\" North turns it into a rule it follows." },
  { title: "Stricter now, easier tomorrow", text: "Tightening a rule works right away. Loosening one waits a day, so a bad moment can't undo it." },
  { title: "You stay in charge", text: "Gentle, Firm or Locked. You pick how strict each rule is, and you can override the gentle ones." },
];

export function Landing({ practice }: { practice: PracticeLogin | null }) {
  const { tried, breaches } = scoreboard.totals;
  const numbers = [
    { n: String(AI_HELPER_COUNT), text: "AI helpers. None of them can pay." },
    { n: String(PLAIN_CODE_COUNT), text: "Guardian, plain code, the only thing that can approve." },
    { n: `${APPROVAL_TTL_MS / 60_000} min`, text: "Each approval is signed, works once and expires." },
    { n: `${breaches} / ${tried}`, text: "Attacks from our own AI red team that got through." },
  ];
  return (
    <div className="lp2" id="top">
      <div className="lp2-first">
        <div className="lp2-shapes" aria-hidden="true"><div className="lp2-shape lp2-shape-a" /><div className="lp2-shape lp2-shape-b" /></div>

        <header className="lp2-top">
          <a className="lp2-brand" href="#top" aria-label="North home">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 L14.2 9.8 L22.5 12 L14.2 14.2 L12 22.5 L9.8 14.2 L1.5 12 L9.8 9.8 Z" fill="currentColor" /></svg>
            <span>north</span>
          </a>
          <nav className="lp2-nav" aria-label="Site">
            <a className="lp2-tlink" href="#how">How it works</a>
            <LandingAppearance />
            <Link className="lp2-pill" href="/login">Log in</Link>
          </nav>
        </header>

        <main id="main" tabIndex={-1} style={{ display: "contents", outline: "none" }}>
          <section className="lp2-hero" aria-labelledby="lp2-h">
            <h1 id="lp2-h">
              {WORDS_1.map((w, i) => <span key={w + i}><span className="lp2-w" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>{w}</span>{" "}</span>)}
              <br />
              {WORDS_2.map((w, i) => <span key={w + i}><span className="lp2-w lp2-w2" style={{ animationDelay: `${0.62 + i * 0.08}s` }}>{w}</span>{" "}</span>)}
            </h1>
            <p className="lp2-sub lp2-up" style={{ animationDelay: ".9s" }}>
              North is the checkpoint between any AI and your PayPal. It checks every buy against rules you set in your own words. Built first for adults with cognitive disabilities.
            </p>
            <div className="lp2-actions lp2-up" style={{ animationDelay: "1.05s" }}>
              <TryDemo practice={practice} variant="v2" />
              <a className="lp2-tlink" href="#how" style={{ fontSize: 17 }}>See how North decides</a>
            </div>
            <CheckpointStage />
          </section>
        </main>
      </div>

      <section id="how" className="lp2-sec" aria-labelledby="how-h">
        <p className="lp2-eyebrow">How North decides</p>
        <h2 id="how-h" className="lp2-h2">Three answers. You set every one of them.</h2>
        <ul className="lp2-three">
          {OUTCOMES.map((o) => (
            <li key={o.tag} className="lp2-out">
              <span className={`tag ${o.cls}`}>{o.tag}</span>
              <h3>{o.title}</h3>
              <p>{o.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp2-sec" aria-labelledby="made-h">
        <p className="lp2-eyebrow">Built first for adults with cognitive disabilities</p>
        <h2 id="made-h" className="lp2-h2">Made for the way you think.</h2>
        <ul className="lp2-six">
          {MADE_FOR.map((m) => <li key={m.title} className="lp2-item"><h3>{m.title}</h3><p>{m.text}</p></li>)}
        </ul>
      </section>

      <section className="lp2-sec" aria-labelledby="code-h" style={{ paddingBottom: 0 }}>
        <div className="lp2-big">
          <p className="lp2-eyebrow">Behind the scenes</p>
          <h2 id="code-h" className="lp2-h2">AI suggests. Code decides.</h2>
          <p className="lp2-lead">North&apos;s AI helpers find products, check deals and read your rules. None of them can pay. Only the Money Guardian can approve a payment, and it is plain code you can read and test.</p>
          <ul className="lp2-nums">
            {numbers.map((x) => <li key={x.text}><div className="lp2-num">{x.n}</div><p>{x.text}</p></li>)}
          </ul>
          <p className="lp2-plug"><ShieldCheck aria-hidden="true" size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />Any AI assistant can plug into North&apos;s checkpoint. It asks to buy; you get one Yes or No.</p>
        </div>
      </section>

      <section className="lp2-final" aria-labelledby="final-h">
        <h2 id="final-h">See it decide in under a minute.</h2>
        <div className="row"><TryDemo practice={practice} variant="v2" /></div>
        <p className="fine">Practice money only. Payments in the PayPal sandbox · Live prices from Channel3</p>
      </section>

      <footer className="lp2-foot">
        <span>You set the rules. You can override them.</span>
        <span><Link href="/how-it-works">How North works</Link><Link href="/how-it-works">Help is always here</Link></span>
      </footer>
    </div>
  );
}
