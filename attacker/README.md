# The attacker

An AI red team that lives in this repo. It tries, over and over and in new ways, to make **money move against a person's rules**
in a running North. North's defence is plain code (the Money Guardian); **the AI here is only ever the attacker.**

```
npm run attack -- --rounds 2                       # every category, 2 rounds each
npm run attack -- --rounds 1 --category races      # one category
```

Start North first, with pretend payments and the practice shop (so a breach costs nothing and prices are fixed):

```
PAYMENTS_MODE=simulated STORE_MODE=demo SUPABASE_URL= SUPABASE_SECRET_KEY= npm run dev
```

(`PAYMENTS_MODE=simulated` is refused in production. It still checks the Guardian's signed approval; it only skips calling PayPal.)

## What it does

1. `harness.mts` logs in as the practice person, resets the demo account, sets a fixture of rules (`locked`: nothing over $1 except
   must-haves, or the starting `gentle` rules), and connects three assistants: **A** (full), **R** (read-only), **revoked**.
2. `brain.mts` is Claude, told to be a skilled, inventive attacker. For each category it fires requests through five tools:
   `send_web` (as the person, a cookie with no CSRF token, another website, nobody, or a forged cookie), `send_mcp`,
   `send_mcp_raw`, `send_parallel` (races) and `done`. It only sees HTTP answers. It never sees the judge or North's code.
3. `oracle.mts` is the judge. It looks at the person's ledger after every move and applies eight plain statements
   (B1-B8: no assistant buy without the person, nothing over the locked limit, no trap listing, budget, protected money, price x 1-5,
   no rule looser, no assistant allowance). It deliberately does not reuse any North decision code. `oracle.test.ts` proves the judge
   is not blind: each statement has a made-up ledger that breaks it.
4. `run.mts` prints a **scoreboard**: attacks tried by category, how many were rejected, breaches, and money moved against the rules
   (**must be 0**). The exit code is 1 on any breach. Everything is written to `attacker/results/` (not committed).

## Categories

poisoned listings, prompt injection through an assistant's reasons, fake urgency, price/quantity/currency tricks, replays, races,
revoked/wrong/over-reaching keys, demo-tool abuse, login/CSRF/cross-site, loosening rules early.

## Out of scope on purpose

- The demo **Start over** button (`/api/demo/reset`). It erases the whole demo account by design, so the harness skips it.
- The pretend hour can still *replace* the hour the late-night rule sees (that is what the demo clock is for). It cannot move the one-day
  rule delay, the wait timers or the week. It is off in production, and in a deployed demo it works for the practice account only.

## Attacks that matter become tests

`corpus/*.json` holds the attacks that taught us something (they got past a layer, or found a hole that was then fixed). The regular
test run (`npm test`) replays every one in-process (`src/lib/attack/replay.test.ts`) against the real checkpoint, checkout and
login code, with no AI and no network, so they can never quietly come back.
