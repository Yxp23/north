// The checkpoint stage: requests from you and from AI assistants move toward North's glowing line. A buy that fits the rules passes and is
// paid; one the rules forbid bounces back and is stopped; one your own rule says wait on is saved. Pure CSS animation (see north-landing.css):
// the stage is for the eyes only, so it is hidden from screen readers and described once in words.
import { Bot, Check, Clock, Hand, ShieldCheck, User } from "lucide-react";

type Pill = { id: string; lane: 1 | 2 | 3; kind: "pass" | "stop" | "wait"; from: "you" | "ai"; item: string; price: string; outcome: string; outPrice?: string; delay: string; phoneDelay: string; extra?: boolean };

// One pill per row. `extra` pills only play on the big stage; the phone stage shows the first three, one at a time (Paid, Stopped, Saved).
const PILLS: Pill[] = [
  { id: "groceries", lane: 1, kind: "pass", from: "you", item: "Groceries", price: "$42.10", outcome: "Paid", outPrice: "$42.10", delay: "1.6s", phoneDelay: "0s" },
  { id: "gift", lane: 1, kind: "stop", from: "ai", item: "Gift cards", price: "$500", outcome: "Stopped: scam", delay: "6.1s", phoneDelay: "0s", extra: true },
  { id: "headphones", lane: 2, kind: "stop", from: "ai", item: "Headphones", price: "$349", outcome: "Stopped: rent money", delay: "3.1s", phoneDelay: "3s" },
  { id: "phone", lane: 2, kind: "pass", from: "you", item: "Phone bill", price: "$65.00", outcome: "Paid: bills first", delay: "7.6s", phoneDelay: "0s", extra: true },
  { id: "shoes", lane: 3, kind: "wait", from: "you", item: "Shoes, 11 PM", price: "$72.54", outcome: "Saved till morning", delay: "4.6s", phoneDelay: "6s" },
  { id: "bottle", lane: 3, kind: "pass", from: "ai", item: "Water bottle", price: "$18.00", outcome: "Paid", outPrice: "$18.00", delay: "9.1s", phoneDelay: "0s", extra: true },
];

const OUT = { pass: { cls: "lp2-ok", Icon: Check, w: 2.6 }, stop: { cls: "lp2-no", Icon: Hand, w: 2 }, wait: { cls: "lp2-wt", Icon: Clock, w: 2.4 } } as const;

function Moving({ p }: { p: Pill }) {
  const o = OUT[p.kind];
  const From = p.from === "you" ? User : Bot;
  return (
    <div className={`lp2-ch lane${p.lane} ${p.kind}${p.extra ? " extra" : ""}`} style={{ "--d": p.delay, "--dm": p.phoneDelay } as React.CSSProperties}>
      <span className="b"><From aria-hidden="true" />{p.item}<span className="p">{p.price}</span></span>
      <span className={`a ${o.cls}`}><o.Icon aria-hidden="true" strokeWidth={o.w} />{p.outcome}{p.outPrice && <span className="p">{p.outPrice}</span>}</span>
    </div>
  );
}

export function CheckpointStage() {
  return (
    <div className="lp2-stagewrap lp2-stagein">
      <p className="lp2-sr">
        An animation: purchase requests from you and from AI assistants move toward North. Groceries, a phone bill and a water bottle pass and are paid.
        Gift cards from an AI and $349 headphones are stopped. Running shoes at $72.54 wait because of your own rule.
      </p>
      <div className="lp2-stage" aria-hidden="true">
        <div className="lp2-end lp2-end-l">You and your AI assistants</div>
        <div className="lp2-end lp2-end-r">PayPal pays</div>
        <div className="lp2-lane lp2-l1" /><div className="lp2-lane lp2-l2" /><div className="lp2-lane lp2-l3" />
        <div className="lp2-gate" />
        <div className="lp2-north"><ShieldCheck aria-hidden="true" strokeWidth={2} />North · your rules</div>
        {PILLS.map((p) => <Moving key={p.id} p={p} />)}
      </div>
      <div className="lp2-key lp2-up" style={{ animationDelay: "1.6s" }}>
        <span><i style={{ background: "var(--n-success)" }} />Paid: fits your rules</span>
        <span><i style={{ background: "var(--n-state)" }} />Wait: your rule says so</span>
        <span><i style={{ background: "var(--n-stop)" }} />Stopped: never allowed</span>
      </div>
    </div>
  );
}
