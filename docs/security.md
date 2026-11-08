# North security

Reference points: OWASP ASVS 4.0 and the OWASP Top 10 for LLM Applications. The threat model is `docs/threat-model.md`.
Written Nov 8, 2026. **This is a hackathon build with a sandbox PayPal. It has been tested hard but not audited by a person.**

## The design in one paragraph

North's defence is plain code. The Money Guardian (`decide`) has no AI, no database, no network and no clock, and fails closed.
Nothing can reach PayPal's money calls without a **signed, single-use, two-minute Guardian approval bound to the user, product,
exact cents, currency and quantity**. The database independently refuses a purchase that would break the weekly budget or the
protected money. Everything an AI says that becomes a price, number or rule is checked or written by code. **No AI ever approves,
unblocks or decides a payment.** AI is used only to read, suggest, warn, and (in `attacker/`) to attack.

## What is enforced, and where

| Area | Control | Where | Tested by |
|---|---|---|---|
| One door to PayPal | HMAC-signed approval (user, product, cents, currency, quantity, nonce, 2-minute expiry); nonce spent once in the database; the PayPal functions take amount and currency FROM the verified approval; refunds need a signed refund approval | `guardian/signed.ts`, `authorize.ts`, `paypal.ts`, `checkout/gateway.ts` | `signed.test`, `authorize.test`, `gateway.test`, `checkout/structure.test` |
| Money rules in the database | `ledger_apply` re-checks weekly budget and protected money in the same transaction | migration `20261109000000` | `security-sql.test` |
| Races | Optimistic version lock plus the database guard; 10 and 12 parallel buys tested | `supabase-ledger.ts` | `security-sql.test`, `replay.test` |
| Login | Supabase Auth password check, own signed 12-hour session cookie (HttpOnly, SameSite=Lax, Secure in production), real logout (session id spent in the database) | `auth/*`, `proxy.ts` | `session.test`, `check.test`, `guard.test` |
| CSRF | Origin check plus a per-session token on every state-changing request; routes also verify, a structure test fails if a route skips the check | `auth/check.ts`, `components/csrf-fetch.tsx` | `auth/structure.test`, `check.test` |
| Headers | CSP (frame-ancestors none, object-src none, connect/frame limited to North and PayPal), nosniff, DENY framing, referrer policy, HSTS in production, permissions policy | `security/headers.ts` | `headers.test` |
| Assistants (MCP) | Own revocable key naming its owner, hash only stored, checked on every request; least-privilege scopes; persistent per-assistant rate limits; wrong keys rate limited by address; `request_key` idempotency; max 5 waiting cards; never Buy now | `checkpoint/*` | `mcp.test`, `service.test`, `keys.test` |
| Demo tools | Off in production unless `DEMO_MODE=1` AND `DEMO_DEPLOYMENT=1`; then practice account only (`DEMO_USER_ID`); the pretend hour changes only the hour the late-night rule sees | `demo/mode.ts`, `checkout/request.ts`, `guardian.ts` | `mode.test`, `request.test`, structure tests |
| Rate limits | Counted in the database (shared by servers, kept across restarts); a broken limiter means "no" | `ratelimit/*`, `rate_limit_hit` | `limiter.test`, `security-sql.test` |
| Idempotency | One tap id, one product; request keys; webhook event ids kept for good; refunds use a fixed PayPal request id | `checkout.ts`, `service.ts`, SQL | checkout, service, SQL tests |
| Webhooks | PayPal signature, event older than 4 days refused, amount and currency must match, a handled event id is never handled again | `paypal/webhook/route.ts`, `ledger/logic.ts` | `paypal-webhook.test`, `logic.test`, SQL tests |
| Uncertain charges | A timeout stays "pending" and keeps counting against the budget | `checkout.ts` | `checkout.test` |
| Audit log | Each entry carries an HMAC of the previous one; database refuses edit and delete; `npm run audit:verify` | `ledger/audit-chain.ts`, SQL trigger | `audit-chain.test`, `security-sql.test` |
| Guardian invariants | Thousands of random purchases, rules and times (fast-check): never over budget, never protected money, flags always refuse, only the person overrides a wait, essentials never pass a wall, a young loosening still applies, garbage settings are refused | `guardian/properties.test.ts` | itself |
| Dependencies | `npm audit` reports 0 after fixes and overrides (see below) | `package.json` | `npm audit` |

## The attacker

`attacker/` is an AI red team (Claude) that fires attacks at a running North through MCP and the web routes, with an independent judge
that reads the ledger (`oracle.mts`, eight statements B1-B8; its own tests prove it can detect each). Run `npm run attack -- --rounds N`.

Latest run (`attacker/latest-scoreboard.json`, shown on the **Try to break North** page): **612 attacks across 10 categories, 0 breaches,
$0.00 moved against the rules.** (53 purchases were inside the rules, made by the logged-in test person; they are not attacks.)

Honest notes: the larger models (Sonnet 5.5, Opus 5.5) often decline the attacker job, so the recorded run used Haiku 4.5. The scoreboard reports
declined turns and warns when a category was thinly tested. Attacks that mattered are in `attacker/corpus/*.json` and replayed in every
`npm test` (`src/lib/attack/replay.test.ts`).

## Independent review

An AI reviewer that had not seen this work was given the repo and the goal "make money move without the Guardian's approval, or past a user's rule".
Results below.

### Independent review results

One pass (about 9 minutes, 58 tool calls, white-box, against a copy with pretend payments) found **1 serious hole, 2 low issues and 1 note**; everything else held (signed approvals, parallel buys, rule timing, CSRF/origin, proxy path tricks, logout, key handling, demo gating):

1. **HIGH, fixed:** an assistant could buy with no yes from the person once a firm wait had been served (the checkpoint's "save to the waiting list" call ran the Guardian again, which approved and charged). Also, an item saved at quantity 1 could be bought at quantity 5 on the same wait. Fix: the save call can never charge (`neverCharge`), the checkpoint asks the Guardian with the same waiting-list input as checkout (so a served wait becomes a normal approve, which makes a card), and a saved item's wait cannot be used for a bigger amount. Regression tests: "a served wait can't be used by an assistant to buy with no yes" in `service.test.ts`.
2. **LOW, documented:** the demo "Start over" puts the starting rules back at once. Demo/practice account only, off in production.
3. **LOW, fixed:** anyone who knew the email could lock the person out of logging in. The lockout is now per account AND address.
4. **INFO, fixed:** the proxy's static-file exception matched any path ending in `.png`; it now matches top-level files only. (No user data was exposed; every API route checks the login itself.)

Not reviewed by that pass: anything that needs the Claude or Channel3 keys (helpers), the real Supabase path and real PayPal (covered separately by `test:supabase` once the migration is run, and by the PayPal sandbox end-to-end run, which passed). The fixes were verified by tests, not by a second independent pass.

## Findings fixed during this work

- Pretend hour moved the Guardian's "now" by up to 23 hours, so a rule loosened an hour ago could count early. Fixed: it only changes the hour of day.
- Approvals were an in-memory object (not signed, not bound to user, currency or quantity). Fixed (signed, single-use, database-backed).
- Currency was not bound: PayPal orders were always USD. Fixed: non-USD is refused.
- A timed-out charge freed the budget while money might have moved. Fixed: stays pending.
- A tap id reused for another product returned the other buy. Fixed.
- A webhook's amount was not compared. Fixed; partial refunds no longer free the budget.
- The Guardian approved when the time zone was unreadable but a pretend hour was given, and read a NaN setting as "no limit". Fixed (found by the property tests).
- Retries of an assistant request racing each other could both buy. Fixed (the buy id is derived from the request key; saves are deduplicated inside the lock).
- Double tap on Yes could mark a bought request failed. Fixed.
- Ten simultaneous asks could pile up more than the card limit. Fixed (checked inside the lock).
- The demo ledger peek returned assistant key hashes. Removed.
- (From the independent review) an assistant could buy with no yes after a served firm wait. Fixed, see above.

## Known limits (said plainly)

- **No audit by a person**, and no penetration test by a third party. Sandbox PayPal only; production needs PayPal risk data (FraudNet), a WAF and monitoring.
- **CSP allows `'unsafe-inline'` scripts**: prerendered pages cannot carry per-request nonces. Protection against script injection relies on React escaping, a test that bans `dangerouslySetInnerHTML`/`innerHTML`/`eval`, and plain-text rendering of untrusted text.
- **A person's own session is the person.** Anything that runs inside their logged-in browser (for example script injection) can tap Yes on an assistant's card. CSP, CSRF tokens, SameSite cookies and framing bans are the defences.
- **Sessions are stateless cookies** checked against a "logged out" list; another server may accept a logged-out cookie for up to 10 seconds.
- **The demo clock can replace the hour** the late-night rule sees (that is its job in the video). It cannot move rule delays, wait timers or the week, it is off in production, and in a deployed demo only the practice account can use it. The demo "Start over" erases the whole practice account and restores the starting rules at once, by design.
- **The practice login is public** (README). Anyone can use the practice account's sandbox money; it is rate limited.
- **A charge we could not confirm stays pending** until PayPal's webhook settles it. If the webhook never comes it keeps counting against the budget (the safe direction).
- **The audit chain** detects edits, deletions and reordering. Cutting entries off the very end is only detected if the last hash is known elsewhere. Entries written before the migration are unprotected.
- **Prompt injection scanning is a heuristic.** It only ever adds caution. The safety does not depend on it: no AI output can approve a payment, and the hard walls hold whatever the text says.
- Dependency overrides (below) force newer versions under the PayPal Agent Toolkit. Only the read-only `orders.get` / `transactions.list` paths are used and were checked against the sandbox.

## Dependency audit

Before: 20 findings (11 high), almost all under `@paypal/agent-toolkit` (langchain, the AI SDK, mathjs, zod 3, openai) plus eslint-config-next's minimatch.
`npm audit fix` could not fix them without downgrading the toolkit. Now: `package.json` `overrides` pin patched versions (mathjs 15.2, langsmith 0.6,
@langchain/core 0.3.80, uuid 11, ai 5, undici 7, minimatch 11, openai 6, zod 4 for the toolkit). Result: 0 findings. Only `mathjs` and `zod` are loaded
at runtime by the toolkit entry we use (checked), and a real sandbox `list_transactions` call works with the overrides.

## Deploying safely (checklist)

1. Run all migrations, including `20261109000000_north_security_hardening.sql`.
2. Set `NORTH_SECRET` (32+ random chars), `SUPABASE_PUBLISHABLE_KEY`, `NORTH_SITE_URL`, `CRON_SECRET`, PayPal and Supabase keys.
3. Turn OFF sign-ups in Supabase Auth. Create people with `scripts/seed-demo-user.mjs` (practice account only).
4. For the judges' demo only: `DEMO_MODE=1`, `DEMO_DEPLOYMENT=1`, `DEMO_USER_ID`, `DEMO_LOGIN_EMAIL`, `DEMO_LOGIN_PASSWORD`. Never `PAYMENTS_MODE`.
5. `npm run audit:verify` after a demo day, and `npm audit` in CI.
