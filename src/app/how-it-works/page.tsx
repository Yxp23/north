import { BadgeCheck, Bot, ShieldCheck } from "lucide-react";
import { SpeakButton } from "@/components/shell/speak";
import { card } from "@/components/classes";
import scoreboard from "../../../attacker/latest-scoreboard.json";
import proof from "../../content/proof.json";
import { RuleSchema } from "@/lib/rules/save-schema";
import { describeRule } from "@/lib/rules/describe";
import { CHECKS } from "@/lib/ui/guardian-trace";
import { Disclosure } from "@/components/disclosure";
import { Pipeline } from "./pipeline";

export const metadata = { title: "How North works" };

type Actor = { name: string; kind: string; can: string[]; cannot: string[] };
const ACTORS: Actor[] = [
  {
    name: "Concierge", kind: "AI helper",
    can: ["Read your words or photo and pick the right helper.", "Turn a rule you wrote into a structured rule. You read it back and confirm.", "Ask one question with picture choices if you were too vague."],
    cannot: ["Pay or refund.", "Make a rule weaker. It can only create or tighten rules.", "Approve anything."],
  },
  {
    name: "Finder", kind: "AI helper",
    can: ["Turn words or a photo into products.", "Give 3 picks that fit what is left this week."],
    cannot: ["Set a price. Names, pictures and prices come from the store.", "Buy anything."],
  },
  {
    name: "Scam checker", kind: "AI helper",
    can: ["Read an ad and find the matching listing.", "Raise a flag. A flag can only make the Guardian refuse."],
    cannot: ["Write the verdict. Code does, from real prices.", "Approve or loosen anything."],
  },
  {
    name: "Price Watcher", kind: "AI helper",
    can: ["Watch only items you are waiting on.", "Write one short message about a change that code found."],
    cannot: ["Buy. It can only tell you.", "Put its own numbers in a message. Code fills in prices."],
  },
  {
    name: "Any outside AI assistant", kind: "Connects through MCP",
    can: ["Ask to buy, with a reason.", "Read your rules in plain words and what is left this week."],
    cannot: ["Pay, refund, or change a rule.", "See your PayPal or the amount set aside for rent.", "Use Buy now. Only you can."],
  },
  {
    name: "Money Guardian", kind: "Plain code, no AI",
    can: ["Approve, wait, save for later, or refuse.", "Sign a one-use approval for exactly one payment."],
    cannot: ["Be talked into anything. No AI output can approve a buy or weaken a rule.", "Let anything past a hard wall, even Buy now."],
  },
];

const ORDER = [
  { n: 1, t: "Hard walls", d: "Refuse, no way around. A price that cannot be read, a seller flagged as a scam, a buy that listing text started, rent and bill money, going over this week's plan." },
  { n: 2, t: "Your must-have list", d: "Groceries and other must-haves pass every rule you made. They never pass a hard wall." },
  { n: 3, t: "Locked rules", d: "Never, while the rule is on. The only way around is changing the rule, which takes a day." },
  { n: 4, t: "A saved item's own timer", d: "Saved items wait their full time, whatever the time of day." },
  { n: 5, t: "Firm rules", d: "The buy is saved for later. No Buy now." },
  { n: 6, t: "Gentle rules", d: "Wait, or buy now? Buy now works right away, and is written in the audit log." },
];

// The rule the practice account starts with, written by the real code. If the schema or the words change, this page changes (or the build fails).
const EXAMPLE = RuleSchema.parse({ kind: "late_night", afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 });
const EXAMPLE_WORDS = describeRule("late_night", { afterHour: 21, untilHour: 5, strength: "firm", waitHours: 24 });

const fmt = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const INTRO = "North is a checkpoint for your money. You write the rules. Helpers and AI assistants can only ask. Plain code, the Money Guardian, decides, and only it can approve a payment.";

export default function HowItWorks() {
  const t = proof.tests;
  return (
    <div className="n-stack" style={{ gap: 44 }}>
      <div className="ng-page-title" style={{ maxWidth: 720 }}>
        <div className="ng-eyebrow">How North works</div>
        <h1>Your rules.<br />Checked by code.</h1>
        <p>{INTRO}</p>
        <div style={{ marginTop: 14 }}><SpeakButton text={INTRO} /></div>
      </div>

      <section aria-labelledby="path-h" className="n-stack">
        <h2 id="path-h">The path of a payment</h2>
        <p>An AI assistant can now spend your money. North is the checkpoint that makes it follow your rules.</p>
        <p className="n-credit">Prices and store comparisons come live from Channel3, and so does the 30-day price history (it builds up day by day). North never takes a price from an AI: it reads the price from Channel3 again at checkout.</p>
        <Pipeline />
      </section>

      <section aria-labelledby="actors-h" className="n-stack">
        <h2 id="actors-h">What each one can and can&apos;t do</h2>
        <ul className="hw-actors">
          {ACTORS.map((a) => (
            <li key={a.name} className={`${card} n-stack`}>
              <div>
                <h3 className="hw-actor-name">{a.kind === "Plain code, no AI" ? <ShieldCheck aria-hidden="true" size={22} /> : <Bot aria-hidden="true" size={22} />}{a.name}</h3>
                <p className="n-chip n-chip-quiet n-mt-1">{a.kind}</p>
              </div>
              <Disclosure flush summary="What it can and can't do">
                <div className="n-stack">
                  <div>
                    <p className="n-chip n-chip-good">Can</p>
                    <ul className="n-list">{a.can.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                  <div>
                    <p className="n-chip n-chip-stop">Can&apos;t</p>
                    <ul className="n-list">{a.cannot.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                </div>
              </Disclosure>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="order-h" className="n-stack">
        <h2 id="order-h">What the Guardian checks, in this order</h2>
        <p>It stops at the first check that applies, and tells you which one it was. The same order is shown in Behind the scenes after a buy.</p>
        <ol className="hw-order">
          {ORDER.map((o) => (
            <li key={o.n} className={card}>
              <span className="hw-badge" aria-hidden="true">{o.n}</span>
              <div><h3>{o.t}</h3><p>{o.d}</p></div>
            </li>
          ))}
        </ol>
        <div className="n-card">
          <Disclosure flush summary={`The ${CHECKS.length} individual checks`}>
            <ol className="n-list n-list-num">{CHECKS.map((c) => <li key={c}>{c}</li>)}</ol>
          </Disclosure>
        </div>
      </section>

      <section aria-labelledby="rule-h" className="n-stack">
        <h2 id="rule-h">Your words become the rule</h2>
        <p>This is a real rule: the one the practice account starts with. The words below are written by North&apos;s own code.</p>
        <ol className="hw-rule">
          <li className={card}>
            <p className="n-chip n-chip-quiet">1 · You write</p>
            <p className="hw-quote">&ldquo;Wait a day before I buy anything after 9pm.&rdquo;</p>
          </li>
          <li className={card}>
            <p className="n-chip n-chip-quiet">2 · The Concierge makes a rule</p>
            <pre className="hw-code" tabIndex={0} aria-label="The structured rule">{JSON.stringify(EXAMPLE, null, 2)}</pre>
            <p>Code checks every field. The AI cannot add a field or loosen one.</p>
          </li>
          <li className={card}>
            <p className="n-chip n-chip-quiet">3 · North reads it back</p>
            <p className="hw-quote">{EXAMPLE_WORDS}</p>
            <p>You choose Gentle, Firm or Locked, and confirm. Nothing is saved until you say yes.</p>
          </li>
          <li className={card}>
            <p className="n-chip n-chip-good"><BadgeCheck aria-hidden="true" />4 · The Guardian follows it</p>
            <p>A stricter rule starts right away. A weaker rule, or turning one off, starts tomorrow, and you can undo it before it starts.</p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="proof-h" className="n-stack">
        <h2 id="proof-h">What has been checked, and how far that goes</h2>
        <p>These numbers are read from the project, not typed in. The test numbers were made on {day(proof.generatedAt)} at version <span className="bts-id">{proof.commit}</span>. Run <span className="bts-id">npm run proof</span> to make them again.</p>
        <ul className="hw-stats">
          <li className={card}><strong>{fmt(t.passed)}</strong><span>of {fmt(t.total)} automatic tests pass{t.skipped ? ` (${t.skipped} skipped)` : ""}, in {t.files} test files.</span></li>
          <li className={card}><strong>{fmt(proof.guardianPropertyTests)}</strong><span>Guardian tests that try thousands of random buys, rules and times.</span></li>
          <li className={card}><strong>{fmt(scoreboard.totals.tried)}</strong><span>attacks from an AI attacker, in {Object.keys(scoreboard.categories).length} categories. Got through: {scoreboard.totals.breaches}. Money moved against the rules: ${(scoreboard.totals.movedAgainstRulesCents / 100).toFixed(2)}.</span></li>
          <li className={card}><strong>1</strong><span>serious hole found by an independent AI review. It is fixed and has a test.</span></li>
        </ul>

        <div className={card}>
          <Disclosure flush summary="The attack scoreboard">
            <div className="n-stack">
            <p>Run on {day(scoreboard.at)}. The attacker was {proof.attacker.model}: the bigger models often refuse that job. A separate judge reads the ledger to see whether any money moved against the rules.</p>
            <div style={{ overflowX: "auto" }}>
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
            <p>&ldquo;Turned away&rdquo; means the request was refused or stopped before it could do anything. The rest were asks that were inside the rules, answered normally. Zero got through.</p>
            </div>
          </Disclosure>
        </div>

        <div className={card}>
          <Disclosure flush summary="The red-team finding">
            <div className="n-stack">
            <p><span className="n-chip n-chip-stop">Serious</span> An AI reviewer that had not seen the work looked for a way to move money without the Guardian. It found one: an assistant could buy with no yes from you once a saved item&apos;s wait was over. It is fixed, a regression test guards it, and the same pass found 2 low problems and 1 note, also fixed or written down.</p>
            <p>Honest limit: the fixes were checked by tests, not by a second independent review.</p>
            </div>
          </Disclosure>
        </div>

        <div className={card}>
          <Disclosure flush summary="The evals">
            <div className="n-stack">
            <p>{proof.evals.dealCases} deal-check cases and {proof.evals.injectionListings} listings with hidden instructions, plus {proof.evals.conciergeRuleCases} rule-writing cases. The developer wrote them with Claude&apos;s help, so they are a smoke test, not proof. On the last recorded run, the real Sonnet 5.5 followed none of the {proof.evals.injectionListings} hidden instructions. If it had, the Guardian would still refuse: a buy that listing text started is a hard wall. Run <span className="bts-id">npm run eval:scam</span> to repeat it. That run uses the live AI and store.</p>
            </div>
          </Disclosure>
        </div>

        <div className={`${card} n-stack`}>
          <h3>What this does not show</h3>
          <ul className="n-list">
            <li>No person outside this project has audited North, and there has been no outside penetration test.</li>
            <li>Payments here use a PayPal sandbox with test money. Real payments would also need PayPal&apos;s risk data and monitoring.</li>
            <li>The checks cover the cases we thought of, and the attacker was an AI. Passing them is not a promise that nothing can go wrong.</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="pp-h" className={`${card} n-stack`}>
        <h2 id="pp-h">Where PayPal shows up</h2>
        <p>At checkout, the button says <strong>Pay with your saved PayPal</strong>. After a payment, the receipt says <strong>Paid with PayPal</strong> and keeps PayPal&apos;s own <strong>order</strong> and <strong>capture</strong> numbers. Turn on <strong>Behind the scenes</strong> on a laptop to see the same numbers, and whether PayPal was called at all. If the Guardian says no, it was not.</p>
      </section>
    </div>
  );
}
