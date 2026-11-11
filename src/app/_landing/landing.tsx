// The public front page (V2, "the checkpoint"): what North is, one tap to try it, the animated checkpoint, how it decides, who it is for, and the
// proof. Nothing here is private: it is the same for everyone. Built from design/landing-v2-reference.html in our design system (src/app/north-landing.css).
// The numbers come from the same places "How North works" reads them (content/actors.ts, the approval's own lifetime, the attacker scoreboard).
import { CircleDollarSign, ListChecks, PenLine, ShieldCheck, SlidersHorizontal, Timer, Volume2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CountNumber } from "./count-number";
import { LandingMotion } from "./landing-motion";
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

const MADE_FOR: { Icon: LucideIcon; title: string; text: string }[] = [
  { Icon: CircleDollarSign, title: "Money in real things", text: "$72 is about 6 lunches." },
  { Icon: Volume2, title: "Hear it out loud", text: "Answers can be read aloud." },
  { Icon: ListChecks, title: "One choice at a time", text: "Big buttons. One choice." },
  { Icon: PenLine, title: "Rules in your own words", text: "Say it your way." },
  { Icon: Timer, title: "Stricter now, easier tomorrow", text: "Tighter now. Looser tomorrow." },
  { Icon: SlidersHorizontal, title: "You stay in charge", text: "Gentle, Firm or Locked." },
];


export function Landing({ practice }: { practice: PracticeLogin | null }) {
  const { tried, breaches } = scoreboard.totals;
  const numbers = [
    { n: <CountNumber to={AI_HELPER_COUNT} />, text: "AI helpers. None of them can pay." },
    { n: <CountNumber to={PLAIN_CODE_COUNT} />, text: "Guardian, plain code, the only thing that can approve." },
    { n: <CountNumber to={APPROVAL_TTL_MS / 60_000} suffix=" min" />, text: "Each approval is signed, works once and expires." },
    { n: <><CountNumber to={breaches} /> / <CountNumber to={tried} /></>, text: "Attacks from our own AI red team that got through." },
  ];
  return (
    <div className="lp2" id="top">
      <LandingMotion />
      <noscript><style>{".lp2-rv{opacity:1!important;transform:none!important}.lp2-out .tag{opacity:1!important;transform:none!important}"}</style></noscript>
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
              <span className="long">The checkpoint between any AI and your PayPal. Built first for adults with cognitive disabilities.</span>
              <span className="phone-only">Between any AI and your PayPal. Built first for adults with cognitive disabilities.</span>
            </p>
            <div className="lp2-actions lp2-up" style={{ animationDelay: "1.05s" }}>
              <TryDemo practice={practice} variant="v2" />
              <a className="lp2-tlink" href="#how" style={{ fontSize: 17 }}>See how North decides</a>
            </div>
            <CheckpointStage />
          </section>
        </main>
      </div>

      <section id="how" className="lp2-sec" aria-labelledby="how-h" data-rv-group>
        <p className="lp2-eyebrow lp2-rv" style={{ "--i": 0 } as React.CSSProperties}>How North decides</p>
        <h2 id="how-h" className="lp2-h2 lp2-rv" style={{ "--i": 1 } as React.CSSProperties}>Three answers. You set every one of them.</h2>
        <ul className="lp2-three">
          {OUTCOMES.map((o, i) => (
            <li key={o.tag} className="lp2-out lp2-rv lp2-card" style={{ "--i": 2 + i * 2 } as React.CSSProperties}>
              <span className={`tag ${o.cls}`}>{o.tag}</span>
              <h3>{o.title}</h3>
              <p>{o.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp2-sec" aria-labelledby="made-h" data-rv-group>
        <p className="lp2-eyebrow lp2-rv" style={{ "--i": 0 } as React.CSSProperties}>Built first for adults with cognitive disabilities</p>
        <h2 id="made-h" className="lp2-h2 lp2-rv" style={{ "--i": 1 } as React.CSSProperties}>Made for the way you think.</h2>
        <ul className="lp2-six">
          {MADE_FOR.map((m, i) => (
            <li key={m.title} className="lp2-item lp2-rv lp2-card" style={{ "--i": 2 + i } as React.CSSProperties}>
              <span className="ico" aria-hidden="true"><m.Icon strokeWidth={1.8} /></span>
              <div><h3>{m.title}</h3><p>{m.text}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="lp2-sec" aria-labelledby="code-h" data-rv-group>
        <div className="lp2-big">
          <p className="lp2-eyebrow lp2-rv" style={{ "--i": 0 } as React.CSSProperties}>Behind the scenes</p>
          <h2 id="code-h" className="lp2-h2 lp2-rv" style={{ "--i": 1 } as React.CSSProperties}>AI suggests. Code decides.</h2>
          <p className="lp2-lead lp2-rv" style={{ "--i": 2 } as React.CSSProperties}>North&apos;s AI helpers find products, check deals and read your rules. None of them can pay. Only the Money Guardian can approve a payment, and it is plain code you can read and test.</p>
          <ul className="lp2-nums">
            {numbers.map((x, i) => <li key={x.text} className="lp2-rv" style={{ "--i": 3 + i } as React.CSSProperties}><div className="lp2-num">{x.n}</div><p>{x.text}</p></li>)}
          </ul>
          <p className="lp2-plug lp2-rv" style={{ "--i": 7 } as React.CSSProperties}><ShieldCheck aria-hidden="true" size={20} /><span>Any AI assistant can plug into North&apos;s checkpoint. It asks to buy; you get one Yes or No.</span></p>
        </div>
      </section>

      <section className="lp2-final" aria-labelledby="final-h" data-rv-group>
        <h2 id="final-h" className="lp2-rv" style={{ "--i": 0 } as React.CSSProperties}>See it decide in under a minute.</h2>
        <div className="row lp2-rv" style={{ "--i": 1 } as React.CSSProperties}><TryDemo practice={practice} variant="v2" /></div>
        <p className="fine lp2-rv" style={{ "--i": 2 } as React.CSSProperties}>Practice money only. Payments in the PayPal sandbox · Live prices from Channel3</p>
      </section>

      <footer className="lp2-foot">
        <span>You set the rules. You can override them.</span>
        <span><Link href="/how-it-works">How North works</Link><Link href="/how-it-works">Help is always here</Link></span>
      </footer>
    </div>
  );
}
