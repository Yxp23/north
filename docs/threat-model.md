# North threat model

Written Nov 8, 2026, before the hardening work, from a read of the code as it stood at commit `5dde1d5`. The
"Status" column is updated as each fix lands (see `docs/security.md` for the final results).

**References:** OWASP ASVS 4.0 (V1 architecture, V2 authentication, V3 sessions, V4 access control, V5 input,
V7 logging, V8 data protection, V11 business logic, V13 API, V14 configuration) and the OWASP Top 10 for LLM
Applications (LLM01 prompt injection, LLM02 insecure output handling, LLM06 excessive agency, LLM08/09 over-reliance,
LLM10 unbounded consumption).

## What we protect

1. **Money:** no PayPal charge unless the Money Guardian approved *this* purchase for *this* user.
2. **The user's rules:** no rule gets weaker (or an assistant more powerful) sooner than its one-day delay, and
   no one but the person loosens a rule.
3. **The saved PayPal token (vault id)** and the assistants' keys.
4. **The record:** the audit log says what really happened.

## Principles

- **Only plain code decides.** The Guardian (`decide`) has no AI, network, database or clock. No AI output can approve a
  payment, unblock a wait or loosen a rule. AI flags can only make it refuse.
- **Fail closed.** Any error, unknown value, missing secret or unreadable input means "refuse", not "allow".
- **One door to PayPal's money calls.** The charge needs a signed, single-use, short-lived Guardian approval that is
  bound to the user, product, amount, currency and quantity.
- **Defense in depth.** The database independently refuses a purchase that would break the budget or protected money.

## Actors

| Actor | Can do | Cannot do (by design) |
|---|---|---|
| The person (logged in) | Buy, change rules (loosening takes a day), connect assistants, refund | Skip the Guardian |
| Outside AI assistant (MCP key) | Ask to buy, read rules in words, read week money | Pay, override a wait, see PayPal data, reach any web route |
| North's own AI helpers | Read, suggest, warn | Buy, refund, loosen rules, charge |
| Seller / listing author | Write text and set a price | Instruct anything, change the price after the Guardian read it |
| Network attacker / other website | Send requests | Act as the user (needs cookie + CSRF token + same origin) |
| PayPal (webhooks) | Tell us a payment happened | Be impersonated (signature checked by PayPal) |
| Operator / deployer | Set env vars | Turn on demo tools in production by accident |

## Threats

Each row: how money could move or a rule could be bypassed, the weakness found in `5dde1d5` (if any), the control,
and where it is tested. IDs are used in tests and in `docs/security.md`.

### A. Web routes (browser to server)

| ID | Threat | Finding at `5dde1d5` | Control | Status |
|---|---|---|---|---|
| A1 | Anyone who can reach the site acts as the one demo user: buy, refund, change rules, connect PayPal, read the ledger | **No login at all on any route.** | Supabase Auth login; `requireUser` on every route; a proxy gate; a structure test fails if a route skips it | **fixed** (see docs/security.md) |
| A2 | Another website makes a logged-in browser send a state-changing request (CSRF) | No protection | SameSite=Strict cookie + `Origin` check + per-session CSRF token header on every non-GET | **fixed** (see docs/security.md) |
| A3 | Price, quantity or currency tampering in the request body | Browser sends no price (ok). `seenCents` only stops a buy. `quantity` is validated 1 to 5. **Currency is not bound:** PayPal order is hard-coded USD while the store product carries its own currency. | Price always read fresh from the store; currency must be USD or the buy is refused; the signed approval binds amount, currency and quantity | **fixed** (see docs/security.md) |
| A4 | Replay of a checkout request (same `attemptId`) | Same attempt returns the old purchase (ok). **But an `attemptId` reused with a different product returns the other product's result.** | Reuse with different product/amount/quantity is refused; idempotency on every money route | **fixed** (see docs/security.md) |
| A5 | Double-click / parallel requests spend the same money | Optimistic version lock in one SQL transaction (ok); retries are capped at 8, so many parallel buys can fail with "busy". | Atomic reserve in the same transaction as the decision; DB-side budget invariant; parallel test (10 at once) | **fixed** (see docs/security.md) |
| A6 | Someone else's PayPal swapped in (vault routes) | Unauthenticated | Auth + CSRF; `return_url` built from a configured site URL, not the request Host | **fixed** (see docs/security.md) |
| A7 | XSS in rendered listing/assistant text | React escapes; no `dangerouslySetInnerHTML` | CSP; structure test bans `dangerouslySetInnerHTML` and `innerHTML` | **fixed** (see docs/security.md) |
| A8 | Clickjacking, MIME sniffing, referrer leaks | No security headers | `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, HSTS in production, `Permissions-Policy` | **fixed** (see docs/security.md) |
| A9 | Huge request bodies, cost/DoS on AI routes | In-memory limits per process; no body cap on JSON routes | Persistent rate limits in Supabase; body size cap | **fixed** (see docs/security.md) |

### B. The MCP checkpoint (outside assistants)

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| B1 | Assistant overrides a wait ("Buy now") | `overrideWait: false` always (ok, tested) | Keep; property test: a wait is overridden only by the person's own session | held, and attacked (attacker/, corpus) |
| B2 | Revoked or forged key | Hash compare, timing-safe, checked every request (ok) | Keep; scopes per key (least privilege); key tied to its user id | held, and attacked (attacker/, corpus) |
| B3 | Assistant key used on web routes | Only `/api/mcp` reads it (structure test) | Keep; with real auth the cookie session is the only way in | held, and attacked (attacker/, corpus) |
| B4 | Assistant floods the person with cards or the store with lookups | In-memory per-process limiter | Persistent per-assistant limit in the database | **fixed** (see docs/security.md) |
| B5 | Injection in `reason` / listing text through an assistant | Scanned; the untrusted flag makes the Guardian refuse (ok) | Keep; the attacker agent tries new variants (item 10) | held, and attacked (attacker/, corpus) |
| B6 | Retry of `request_purchase` creates duplicate asks | No idempotency key | Optional `request_key`; same key returns the same answer | **fixed** (see docs/security.md) |
| B7 | Auto-buy ("under $X") abused: many small buys, quantity, repeated asks | Total must be under $X and the Guardian approve; rate limit; budget walls | Keep; attack runs try quantity and split-buy tricks | held, and attacked (attacker/, corpus) |
| B8 | Assistant learns private data (PayPal token, protected amount) | Outputs are tested to hold none (ok) | Keep; attacker checks every reply | held, and attacked (attacker/, corpus) |

### C. North's own AI helpers

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| C1 | A tricked helper buys something | No helper has a charge tool; structure tests ban the imports and tool names (ok) | Keep | held, and attacked (attacker/, corpus) |
| C2 | A helper loosens a rule | Concierge only creates or tightens; saved rules re-checked by code | Keep; property test | held, and attacked (attacker/, corpus) |
| C3 | Model text shows a made-up price | Prices come from store/API values only (ok) | Keep | held, and attacked (attacker/, corpus) |
| C4 | Router sends a message somewhere dangerous | One tool that names a read-only destination (ok) | Keep | held, and attacked (attacker/, corpus) |

### D. Races, replay, idempotency

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| D1 | Approval reused or forged | In-memory `WeakMap`: one process only, not signed, not bound to the user or currency | HMAC-signed approval, nonce stored in the database (single use), expires in minutes | **fixed** (see docs/security.md) |
| D2 | Network failure after PayPal took the money | **"Uncertain" charges are marked `failed`, which frees the budget** while money may have moved | Uncertain stays `pending` (still counted) until a webhook or a check settles it | **fixed** (see docs/security.md) |
| D3 | PayPal retries the same charge | `PayPal-Request-Id` = attempt id (ok) | Keep | held, and attacked (attacker/, corpus) |
| D4 | Webhook replayed or forged | Signature checked by PayPal (ok); duplicate ids ignored, but only the last 500 are loaded; **amount in the event is not compared** | Event ids kept for good in the database; amount and currency must match the purchase; stale events are refused | **fixed** (see docs/security.md) |
| D5 | Refund twice | `CAPTURE_FULLY_REFUNDED` treated as success (ok) | Add idempotency key + only the owner's own purchase | held, and attacked (attacker/, corpus) |

### E. Clock

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| E1 | The demo clock shifts "now" for the Guardian | **`pretendHour` moves `at` by up to 23 hours, and `at` is also the Guardian's "now" for the one-day rule delay and the wait timers.** In a demo deployment a rule loosened an hour ago could count as in force. | The demo clock changes only the hour-of-day for the late-night rule. Rule delays, wait timers and the week all use the real clock. Property test. | **fixed** (see docs/security.md) |
| E2 | A browser clock is trusted | Server clock is used; the browser sends only an hour in demo mode | Keep | held, and attacked (attacker/, corpus) |

### F. Demo tools and configuration

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| F1 | Demo tools (reset, pretend time, ledger dump, pretend tests, assistant key shortcut) reachable in production | `DEMO_MODE=1` alone turns them on in production | `DEMO_MODE` refuses in production unless `DEMO_DEPLOYMENT=1`; every demo route checks one function; demo routes still need a login | **fixed** (see docs/security.md) |
| F2 | The demo ledger dump leaks internals | `/api/demo/ledger` returns the whole ledger, including assistant key hashes | Demo-only, authenticated, and with the hashes removed | **fixed** (see docs/security.md) |
| F3 | `/api/demo-assistant` with `connect:true` mints an assistant key with no auth | Yes | Auth + demo gate | **fixed** (see docs/security.md) |
| F4 | Missing secrets mean silent weak mode | A missing webhook id is refused (ok); the ledger falls back to a local file only outside production (ok); no signing secret exists yet | Production refuses to start charges without `NORTH_SECRET`; a clear error | **fixed** (see docs/security.md) |
| F5 | Secrets in logs | PayPal success bodies with tokens are not logged; error bodies are | Keep; test that no log line has a token pattern | held, and attacked (attacker/, corpus) |
| F6 | Host-header trouble in `return_url` | Built from the request URL | `NORTH_SITE_URL` in production | **fixed** |

### G. Prompt injection and untrusted text (OWASP LLM01/02/06)

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| G1 | Hidden instructions in a listing/ad/screenshot make an agent propose a buy | Judge sends every agent-started buy as untrusted; the hard wall refuses (ok) | Keep; the red-team agent invents new ones | held, and attacked (attacker/, corpus) |
| G2 | Injection through an assistant's `reason` | Scanned (ok) | Keep | held, and attacked (attacker/, corpus) |
| G3 | Fake urgency / social pressure | The Guardian has no "urgent" input; waits can't be shortened by words | Keep; property test | held, and attacked (attacker/, corpus) |
| G4 | Model output rendered as HTML or a link | Plain text only; numbers from code | Keep | held, and attacked (attacker/, corpus) |

### H. Audit and records

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| H1 | Someone edits or deletes audit entries (including with database access) | Plain rows; reset deletes them | Each entry carries an HMAC of the previous one; database blocks update and delete (except the labelled demo reset); `npm run audit:verify` | **fixed** (see docs/security.md) |

### I. Supply chain and dependencies

| ID | Threat | Finding | Control | Status |
|---|---|---|---|---|
| I1 | Vulnerable dependency (the Agent Toolkit pulls many) | `npm audit` reports findings (see item 9) | Fix or document each; run in CI | **fixed** (see docs/security.md) |

## Out of scope (and said so honestly)

- PayPal's own systems and the sandbox's reliability.
- A compromised server or a leaked `SUPABASE_SECRET_KEY` / `NORTH_SECRET`: the signed approvals and audit chain raise the cost,
  but an attacker who holds every secret is the operator.
- Real production needs: PayPal FraudNet risk data, a WAF, per-user data export and erasure, and a security review by a person.
