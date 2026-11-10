// Who does what in North. One list, used by "How North works" and by the landing page's proof points, so the numbers always match.
// kind "AI helper" = one of North's own four helpers (Concierge, Finder, Scam checker, Price Watcher). None of them can pay.
// kind "Plain code, no AI" = the Money Guardian.
export type Actor = { name: string; kind: string; can: string[]; cannot: string[] };
export const ACTORS: Actor[] = [
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

export const AI_HELPER_COUNT = ACTORS.filter((a) => a.kind === "AI helper").length;
export const PLAIN_CODE_COUNT = ACTORS.filter((a) => a.kind === "Plain code, no AI").length;
