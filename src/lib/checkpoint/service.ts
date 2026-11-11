// The North Agent Checkpoint: what happens when an outside AI assistant asks to buy something.
//
//   assistant -> MCP tool -> here -> the Money Guardian -> (the person, if required) -> guarded checkout -> saved PayPal
//
// Rules this file keeps (checkpoint/structure.test.ts and service.test.ts check them):
//  - The price comes from the store, never from the assistant.
//  - The Guardian always gets overrideWait: false for an assistant. Only the PERSON's Yes can be a "Buy now".
//  - An assistant's reason, or a listing, that holds hidden instructions makes the buy "started by untrusted text",
//    which the Guardian's hard wall refuses. An assistant that says it acted on web content is refused the same way.
//  - It buys on its own only when ALL hold: the person allowed it (and the allowance is in force), the product was
//    named by id, it is a must-have, the total is under the person's $X, and the Guardian approves.
//  - Otherwise the person gets a one-tap card. A gentle-wait result needs their Yes too, and their Yes is the Buy now.
//  - The assistant is told approve / wait / refuse and the plain reason. It never sees a PayPal token or account detail.
// This file reaches checkout only through the `checkout` dependency, wired in checkpoint/run.ts.
import { createHash } from "node:crypto";
import type { StepEvent } from "../agents/loop";
import type { CheckoutInput, CheckoutOutcome } from "../checkout/checkout";
import { MAX_QUANTITY } from "../checkout/checkout";
import { decide, effective, isEssential } from "../guardian";
import { findHiddenInstructions } from "../injection/scan";
import type { Ledger } from "../ledger/ledger";
import { activeWaiting, addAudit, buildUserState, isSellerFlagged, REQUEST_LIFETIME_MS, summarize } from "../ledger/logic";
import type { AgentRequest, ConnectedAgent, LedgerData, RequestStep } from "../ledger/types";
import { dollarsLabel } from "../rules/describe";
import { rulesInWords } from "../rules/summary";
import { toRules } from "../ledger/logic";
import type { StoreProduct, StoreProvider } from "../store";
import { assistantAllowance, permissionInWords } from "./permission";

export type CheckpointDeps = {
  ledger: Ledger;
  store: StoreProvider;
  /** Guarded checkout. The ONLY way anything is charged. */
  checkout(input: CheckoutInput, onStep?: (e: StepEvent) => void): Promise<CheckoutOutcome>;
  now(): Date;
  newId(): string;
};

export type PurchaseInput = {
  /** A product id, or words. */
  product: string;
  quantity?: number;
  /** The assistant's own words. UNTRUSTED. */
  reason?: string;
  triggeredBy?: "user_request" | "web_content" | "other";
  /**
   * Optional. An assistant that retries (a timeout, a repeated tool call) should send the same key each time: it then gets the
   * SAME answer back and North makes only one request. A key can't be reused for a different product or amount.
   */
  requestKey?: string;
};

export type AgentAnswer = {
  decision: "approve" | "wait" | "refuse";
  status: "bought" | "asked_person" | "saved_for_later" | "refused";
  /** Plain words, from the Guardian or from us. */
  reason: string;
  requestId?: string;
  item?: { name: string; quantity: number; totalCents: number };
};

export const MAX_PENDING_PER_AGENT = 5;
export const REQUEST_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_REASON = 300;
const MAX_REQUESTS_KEPT = 50;
const ID_LIKE = /^[A-Za-z0-9_-]{4,40}$/;
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const cleanReason = (s: string | undefined) => (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_REASON);

const refuse = (reason: string): AgentAnswer => ({ decision: "refuse", status: "refused", reason });

/** The answer an earlier request got, rebuilt from what we stored (for a retry with the same request key). */
function answerFor(r: AgentRequest): AgentAnswer {
  const item = { name: r.name, quantity: r.quantity, totalCents: r.amountCents };
  const status: AgentAnswer["status"] = r.status === "bought" ? "bought" : r.status === "saved_for_later" ? "saved_for_later" : r.status === "pending" ? "asked_person" : r.status === "refused" || r.status === "declined" || r.status === "expired" || r.status === "failed" ? "refused" : "refused";
  const decision: AgentAnswer["decision"] = status === "bought" ? "approve" : status === "refused" ? "refuse" : "wait";
  return { decision, status, reason: `${r.guardianReason} (This is the answer to your earlier request with the same key. Nothing new was done.)`, requestId: r.id, item };
}

async function findProduct(store: StoreProvider, what: string): Promise<{ product: StoreProduct; byId: boolean } | null> {
  if (ID_LIKE.test(what)) {
    const p = await store.getProduct(what, { fresh: true }).catch(() => null);
    if (p) return { product: p, byId: true };
  }
  const found = await store.search(what, 1).catch(() => []);
  return found[0] ? { product: found[0], byId: false } : null;
}

const asStep = (e: StepEvent): RequestStep => ({ label: e.label, ...(e.detail ? { detail: e.detail } : {}), ...(e.warn ? { warn: true } : {}) });

/** Keep the newest requests. Answered ones go first. */
function addRequest(data: LedgerData, r: AgentRequest) {
  const list = data.agentCheckpoint.requests;
  if (!list.some((x) => x.id === r.id)) list.push(r);
  while (list.length > MAX_REQUESTS_KEPT) {
    const i = list.findIndex((x) => x.status !== "pending");
    list.splice(i >= 0 ? i : 0, 1);
  }
}

export async function requestPurchase(deps: CheckpointDeps, agent: ConnectedAgent, input: PurchaseInput): Promise<AgentAnswer> {
  const now = deps.now();
  const data = await deps.ledger.read();
  // Check the assistant again against our record, whatever the caller holds: a disconnected one gets nothing.
  const live = data.agentCheckpoint.agents.find((a) => a.id === agent.id);
  if (!live || live.revokedAt) return refuse("This assistant is not connected to North. Nothing was bought.");

  const stillPending = data.agentCheckpoint.requests.filter((r) => r.agentId === agent.id && r.status === "pending" && now.getTime() - new Date(r.createdAt).getTime() < REQUEST_LIFETIME_MS).length;
  if (stillPending >= MAX_PENDING_PER_AGENT) return refuse("You already have requests waiting for your person to answer. Wait for them before asking again. Nothing was bought.");

  const quantity = input.quantity ?? 1;
  const what = (input.product ?? "").trim();

  // A retry with the same key gets the same answer back, and never a second request. (Checked before anything else is done.)
  if (input.requestKey !== undefined) {
    if (!REQUEST_KEY_RE.test(input.requestKey)) return refuse("The request key can only have letters, numbers and - _ . : and be up to 64 long. Nothing was bought.");
    const same = data.agentCheckpoint.requests.find((r) => r.agentId === agent.id && r.requestKey === input.requestKey);
    if (same) {
      if (same.askedFor !== what || same.quantity !== quantity) return refuse("That request key was already used for something else. Use a new key for a new request. Nothing was bought.");
      return answerFor(same);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return refuse(`A request can be for 1 to ${MAX_QUANTITY} of one thing. Nothing was bought.`);
  if (!what || what.length > 120) return refuse("I need the product, as an id or a few words. Nothing was bought.");
  const reason = cleanReason(input.reason);

  const found = await findProduct(deps.store, what);
  if (!found) {
    await deps.ledger.update((d) => {
      addAudit(d, "agent_request", `An assistant (${live.name}) asked to buy something I could not find. Refused.`, now);
      const a = d.agentCheckpoint.agents.find((x) => x.id === agent.id);
      if (a) a.lastUsedAt = now.toISOString();
    });
    return refuse("I couldn't find that in the shop. Nothing was bought.");
  }
  const { product, byId } = found;
  // A product that comes in sizes needs a person to pick one. An assistant can't, and North never guesses a size, so nothing is asked or bought.
  if (product.sizes?.length) {
    await deps.ledger.update((d) => {
      addAudit(d, "agent_request", `An assistant (${live.name}) asked to buy ${product.name}, which comes in sizes. Refused: a person must pick the size.`, now);
      const a = d.agentCheckpoint.agents.find((x) => x.id === agent.id);
      if (a) a.lastUsedAt = now.toISOString();
    });
    return refuse(`${product.name} comes in sizes, and North can't choose a size for the person. Nothing was bought. Ask the person to open it in North and pick their size.`);
  }
  const unitCents = product.priceCents;
  const amountCents = unitCents * quantity;
  const label = quantity > 1 ? `${product.name} × ${quantity}` : product.name;
  const requestId = `req_${deps.newId()}`;
  // The id of the buy itself. With a request key it is the SAME for every retry of that request, so the ledger's own
  // "one attempt, one purchase" rule makes a double buy impossible even when two retries arrive at the same instant.
  // (Hashed, because PayPal limits a request id to 108 characters.)
  const attemptId = input.requestKey ? `agent-${createHash("sha256").update(`${agent.id}:${input.requestKey}`).digest("hex").slice(0, 40)}` : `agent-${requestId}`;
  const steps: RequestStep[] = [];
  const step = (label: string, detail?: string, warn = false) => steps.push({ label, ...(detail ? { detail } : {}), ...(warn ? { warn: true } : {}) });

  step(`An assistant (${live.name}) asked to buy ${label}.`, `Its reason: "${reason || "(none given)"}". ${byId ? "It named the product by id." : "It described the product in words, so I matched it to the shop."}`);
  step("Looking up the price…", `${product.name} is ${dollars(unitCents)} each, ${dollars(amountCents)} in all. The price comes from the store, never from the assistant.`);

  // Hidden instructions: in what the assistant said, or in the listing it was looking at.
  const inReason = findHiddenInstructions(reason);
  const inListing = findHiddenInstructions(`${product.name}\n${product.description ?? ""}`);
  const claimedWeb = input.triggeredBy === "web_content";
  const untrusted = inReason.found || inListing.found || claimedWeb;
  if (inReason.found) step("Found hidden instructions in what the assistant said.", inReason.hits.map((h) => `${h.kind}: ${h.snippet}`).join(" | ").slice(0, 300), true);
  if (inListing.found) step(`Found hidden instructions in the listing for ${product.name}.`, inListing.hits.map((h) => `${h.kind}: ${h.snippet}`).join(" | ").slice(0, 300), true);
  if (claimedWeb) step("The assistant says it was acting on text from a web page, not on what you asked.", undefined, true);
  if (!untrusted) step("Checking for hidden instructions…", "None found.");

  const state = buildUserState(data, now);
  step("Asking the Money Guardian…");
  // Same question checkout asks: an item already saved on the waiting list keeps its own timer (a served wait is a normal buy).
  const waiting = activeWaiting(data, product.id);
  const result = decide(
    {
      amountCents, item: label, category: product.category, at: now,
      waitlist: waiting ? { since: new Date(waiting.createdAt), waitHours: waiting.waitHours } : undefined,
      overrideWait: false, // an assistant can never press "Buy now". Only the person can.
      sellerFlaggedScam: isSellerFlagged(data, product.sellerDomain),
      agentStartedFromUntrustedText: untrusted,
    },
    state,
  );
  step(`The Money Guardian said ${result.decision === "approve" ? "yes" : result.decision === "refuse" ? "no" : "wait"}.`, `${result.decision} (${result.code}). ${result.reason}`, result.decision === "refuse");

  const base = { id: requestId, agentId: agent.id, ...(input.requestKey ? { requestKey: input.requestKey } : {}), askedFor: what, agentName: live.name, productId: product.id, name: label, imageUrl: product.imageUrl, unitCents, quantity, amountCents, reason, decision: (result.decision === "waitlist" ? "wait" : result.decision) as AgentRequest["decision"], guardianCode: result.code, guardianReason: result.reason, createdAt: now.toISOString() };
  const item = { name: product.name, quantity, totalCents: amountCents };
  // Saved inside the ledger's lock. Several asks at the very same moment can't slip past the limit on waiting cards, and a
  // disconnect that happened meanwhile is respected (nothing is saved for a disconnected assistant).
  const save = (r: Partial<AgentRequest> & Pick<AgentRequest, "status" | "needsPerson" | "needsOverride">, audit: string): Promise<"saved" | "full" | "disconnected" | { duplicate: AgentRequest }> =>
    deps.ledger.update((d) => {
      const a = d.agentCheckpoint.agents.find((x) => x.id === agent.id);
      if (!a || a.revokedAt) return "disconnected";
      // A retry that arrived at the same moment as the first: keep the first request, answer with it.
      const dup = input.requestKey ? d.agentCheckpoint.requests.find((x) => x.agentId === agent.id && x.requestKey === input.requestKey) : undefined;
      if (dup) return { duplicate: dup };
      if (r.status === "pending") {
        const waiting = d.agentCheckpoint.requests.filter((x) => x.agentId === agent.id && x.status === "pending" && now.getTime() - new Date(x.createdAt).getTime() < REQUEST_LIFETIME_MS).length;
        if (waiting >= MAX_PENDING_PER_AGENT) return "full";
      }
      addRequest(d, { ...base, steps, ...r });
      addAudit(d, "agent_request", audit, now);
      a.lastUsedAt = now.toISOString();
      return "saved";
    });
  const auditText = `An assistant (${live.name}) asked to buy ${label}, ${dollars(amountCents)}: ${result.decision} (${result.code}).`;
  /** Saves the request, then gives the answer. If a retry with the same key got there first, its answer is given instead. */
  const saveThen = async (r: Parameters<typeof save>[0], audit: string, answer: () => AgentAnswer): Promise<AgentAnswer> => {
    const out = await save(r, audit);
    if (typeof out === "object") return answerFor(out.duplicate);
    if (out === "disconnected") return refuse("This assistant is not connected to North. Nothing was bought.");
    if (out === "full") return refuse("You already have requests waiting for your person to answer. Wait for them before asking again. Nothing was bought.");
    return answer();
  };

  // ---- the Guardian said no -------------------------------------------------------------------
  if (result.decision === "refuse") {
    step("Nothing was bought.");
    return saveThen({ status: "refused", needsPerson: false, needsOverride: false }, auditText, () => ({ decision: "refuse", status: "refused", reason: result.reason, requestId, item }));
  }

  // ---- a firm wait: it goes on the waiting list, as for anyone ----------------------------------
  if (result.decision === "waitlist") {
    const out = await deps.checkout({ productId: product.id, attemptId, quantity, neverCharge: true });
    step("Saved it on the waiting list.", result.reason);
    return saveThen({ status: "saved_for_later", needsPerson: false, needsOverride: false }, auditText, () => ({ decision: "wait", status: "saved_for_later", reason: `${result.reason} ${out.kind === "waitlisted" ? "I saved it for later." : ""}`.trim(), requestId, item }));
  }

  // ---- may the assistant buy this on its own? -------------------------------------------------
  const allowance = assistantAllowance(data, now);
  const essential = isEssential({ amountCents, item: label, category: product.category, at: now }, effective(toRules(data.rules).essentials, now));
  const auto = result.decision === "approve" && !!allowance && byId && essential && amountCents <= allowance.underCents;

  if (auto) {
    step("You allowed your assistant to buy must-have things under " + dollarsLabel(allowance!.underCents) + " without asking. This one fits.");
    const collected: RequestStep[] = [];
    const out = await deps.checkout({ productId: product.id, attemptId, quantity, overrideWait: false, seenCents: unitCents }, (e) => collected.push(asStep(e)));
    steps.push(...collected.filter((c) => c.label !== "Looking up the price…" && c.label !== "Done."));
    if (out.kind === "paid") {
      return saveThen({ status: "bought", needsPerson: false, needsOverride: false, purchaseId: out.purchase.id, answeredAt: now.toISOString() }, `${auditText} Bought on its own (allowed under ${dollarsLabel(allowance!.underCents)}).`, () => ({ decision: "approve", status: "bought", reason: `${result.reason} It was bought with your person's saved PayPal.`, requestId, item }));
    }
    // The very same request (same key) is being handled right now by another call. Record nothing; the other call will.
    if (out.kind === "in_progress") {
      return { decision: "wait", status: "asked_person", reason: "This exact request is already being handled. Ask again in a moment, with the same request key, to see the result. Nothing new was done.", requestId, item };
    }
    // It did not go through (a wall, no PayPal, a price change…). Say so; never retry on its own.
    const why = out.kind === "refused" ? out.result.reason : out.kind === "needs_paypal" ? "PayPal is not connected yet." : out.kind === "price_changed" ? "The price changed while I was checking." : "It did not go through.";
    return saveThen({ status: out.kind === "refused" ? "refused" : "failed", needsPerson: false, needsOverride: false }, `${auditText} Not bought: ${why}`, () => ({ decision: out.kind === "refused" ? "refuse" : "wait", status: out.kind === "refused" ? "refused" : "asked_person", reason: `${why} Nothing was bought.`, requestId, item }));
  }

  // ---- the person decides ---------------------------------------------------------------------
  const needsOverride = result.decision === "wait"; // a gentle wait: their Yes is the Buy now
  step("Asked you first.", needsOverride ? "A wait rule applies, so only you can say Buy now." : allowance ? "This one is not covered by what you allowed on your own." : "Your assistant must ask you every time.");
  return saveThen({ status: "pending", needsPerson: true, needsOverride }, `${auditText} Waiting for the person's Yes.`, () => ({
    decision: "wait", status: "asked_person", requestId, item,
    reason: `${needsOverride ? result.reason : "The rules say this is okay to buy."} Your person has to say yes first, so I asked them. Nothing was bought yet.`,
  }));
}

export type AnswerResult =
  | { kind: "bought"; message: string }
  | { kind: "declined"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "price_changed"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "gone"; message: string };

/** The person's Yes or No on a card. A Yes still goes through the Guardian (and the saved PayPal) like any buy. */
export async function answerRequest(deps: CheckpointDeps, requestId: string, answer: "yes" | "no"): Promise<AnswerResult> {
  const now = deps.now();
  const data = await deps.ledger.read();
  const r = data.agentCheckpoint.requests.find((x) => x.id === requestId);
  const open = r && r.status === "pending" && now.getTime() - new Date(r.createdAt).getTime() < REQUEST_LIFETIME_MS;
  if (!r || !open) return { kind: "gone", message: "That request is not waiting any more." };

  const finish = (status: AgentRequest["status"], steps: RequestStep[], audit: string, purchaseId?: string) =>
    deps.ledger.update((d) => {
      const x = d.agentCheckpoint.requests.find((q) => q.id === requestId);
      if (!x || x.status !== "pending") return;
      x.status = status;
      x.answeredAt = now.toISOString();
      if (purchaseId) x.purchaseId = purchaseId;
      x.steps.push(...steps);
      addAudit(d, "agent_request", audit, now);
    });

  if (answer === "no") {
    await finish("declined", [{ label: "You said no. Nothing was bought." }], `You said no to the assistant's request: ${r.name}.`);
    return { kind: "declined", message: "Okay. I did not buy it." };
  }

  const collected: RequestStep[] = [{ label: "You said yes." }];
  // Their Yes on a gentle wait IS the Buy now (checkout logs it). It still goes through the Guardian and the budget.
  const out = await deps.checkout({ productId: r.productId, attemptId: `agent-${r.id}`, quantity: r.quantity, overrideWait: r.needsOverride, seenCents: r.unitCents }, (e) => {
    if (e.label !== "Done.") collected.push(asStep(e));
  });
  // A second tap on Yes while the first is still working: leave the request alone, the first tap will record the result.
  if (out.kind === "in_progress") return { kind: "failed", message: "I am already working on that one. Please wait a moment." };
  if (out.kind === "paid") {
    await finish("bought", collected, `You said yes to the assistant's request: ${r.name}, ${dollars(r.amountCents)}. Bought.`, out.purchase.id);
    return { kind: "bought", message: `Done. You bought ${r.name} for ${dollars(r.amountCents)}.` };
  }
  if (out.kind === "price_changed") {
    await finish("failed", [...collected, { label: "The price changed, so I did not buy it.", warn: true }], `Assistant request ${r.name}: the price changed. Not bought.`);
    return { kind: "price_changed", message: `The price changed from ${dollars(out.seenCents)} to ${dollars(out.nowCents)}. I did not buy it. Ask your assistant again.` };
  }
  if (out.kind === "refused") {
    await finish("refused", [...collected, { label: `The Money Guardian said no: ${out.result.reason}`, warn: true }], `Assistant request ${r.name}: refused. ${out.result.reason}`);
    return { kind: "refused", message: out.result.reason };
  }
  const message = out.kind === "needs_paypal" ? "PayPal is not connected yet. Connect it first." : out.kind === "wait" || out.kind === "waitlisted" ? out.result.reason : "It did not go through. Nothing was bought.";
  await finish("failed", collected, `Assistant request ${r.name}: not bought (${out.kind}).`);
  return { kind: "failed", message };
}

export type RequestStatusAnswer = { found: false } | { found: true; status: AgentRequest["status"]; plain: string };
const STATUS_WORDS: Record<AgentRequest["status"], string> = {
  pending: "Your person has not answered yet. Nothing was bought.",
  bought: "Your person said yes and it was bought.",
  declined: "Your person said no. Nothing was bought.",
  refused: "North's rules said no. Nothing was bought.",
  saved_for_later: "It is saved for later because of a wait rule. Nothing was bought yet.",
  failed: "It did not go through. Nothing was bought.",
  expired: "Nobody answered in time. Nothing was bought.",
};

/** The status of one of THIS assistant's own requests. It can't look at anyone else's. */
export async function requestStatus(deps: CheckpointDeps, agent: ConnectedAgent, requestId: string): Promise<RequestStatusAnswer> {
  const r = (await deps.ledger.read()).agentCheckpoint.requests.find((x) => x.id === requestId && x.agentId === agent.id);
  if (!r) return { found: false };
  const status = r.status === "pending" && deps.now().getTime() - new Date(r.createdAt).getTime() >= REQUEST_LIFETIME_MS ? "expired" : r.status;
  return { found: true, status, plain: STATUS_WORDS[status] };
}

/** The person's rules in plain words, and what the assistant may do on its own. Plain sentences only: no structure, no account details. */
export async function rulesForAgent(deps: CheckpointDeps): Promise<string> {
  const now = deps.now();
  const data = await deps.ledger.read();
  return [rulesInWords(toRules(data.rules), now), permissionInWords(data, now)].join("\n");
}

/** How much the person has left this week. Not the account balance, not the rent and bills, nothing about PayPal. */
export async function weekMoneyForAgent(deps: CheckpointDeps): Promise<string> {
  const s = summarize(await deps.ledger.read(), deps.now());
  return `Your person has ${dollarsLabel(s.leftCents)} left to spend this week. Their plan for the week is ${dollarsLabel(s.weeklyBudgetCents)} and ${dollarsLabel(s.spentThisWeekCents)} is spent.`;
}

export type Preview = {
  decision: "approve" | "wait" | "refuse";
  code: string;
  reason: string;
  /** What would happen next, in plain words. Nothing has happened: this is a practice run. */
  next: string;
  steps: RequestStep[];
};

/**
 * "Try to break North": the same questions requestPurchase asks, answered live, with NOTHING written and nothing bought. A test
 * checks it always gives the same decision as the real thing, so it can't drift. It still uses the person's real rules and money.
 */
export async function previewPurchase(deps: CheckpointDeps, input: PurchaseInput): Promise<Preview> {
  const now = deps.now();
  const data = await deps.ledger.read();
  const quantity = input.quantity ?? 1;
  const what = (input.product ?? "").trim();
  const steps: RequestStep[] = [];
  const done = (decision: Preview["decision"], code: string, reason: string, next: string): Preview => ({ decision, code, reason, next, steps });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return done("refuse", "bad_quantity", `A request can be for 1 to ${MAX_QUANTITY} of one thing.`, "Nothing would be bought.");
  if (!what || what.length > 120) return done("refuse", "bad_product", "I need the product, as an id or a few words.", "Nothing would be bought.");
  const reason = cleanReason(input.reason);
  const found = await findProduct(deps.store, what);
  if (!found) return done("refuse", "not_found", "I couldn't find that in the shop.", "Nothing would be bought.");
  const { product, byId } = found;
  const amountCents = product.priceCents * quantity;
  const label = quantity > 1 ? `${product.name} × ${quantity}` : product.name;
  steps.push({ label: `Looking up the price… ${label} is ${dollars(amountCents)}.`, detail: "The price comes from the store, never from the assistant." });
  const inReason = findHiddenInstructions(reason);
  const inListing = findHiddenInstructions(`${product.name}\n${product.description ?? ""}`);
  const claimedWeb = input.triggeredBy === "web_content";
  const untrusted = inReason.found || inListing.found || claimedWeb;
  if (inReason.found) steps.push({ label: "Found hidden instructions in what the assistant said.", warn: true });
  if (inListing.found) steps.push({ label: `Found hidden instructions in the listing for ${product.name}.`, warn: true });
  if (claimedWeb) steps.push({ label: "The assistant says it acted on text from a web page.", warn: true });
  if (!untrusted) steps.push({ label: "Checking for hidden instructions…", detail: "None found." });
  const result = decide(
    { amountCents, item: label, category: product.category, at: now, overrideWait: false, sellerFlaggedScam: isSellerFlagged(data, product.sellerDomain), agentStartedFromUntrustedText: untrusted },
    buildUserState(data, now),
  );
  steps.push({ label: `The Money Guardian said ${result.decision === "approve" ? "yes" : result.decision === "refuse" ? "no" : "wait"}.`, detail: `${result.decision} (${result.code}). ${result.reason}`, warn: result.decision === "refuse" });
  const decision = result.decision === "waitlist" ? "wait" : result.decision;
  if (result.decision === "refuse") return done("refuse", result.code, result.reason, "Nothing would be bought, and nobody can override this.");
  if (result.decision === "waitlist") return done("wait", result.code, result.reason, "It would go on the waiting list. Nothing would be bought.");
  const allowance = assistantAllowance(data, now);
  const essential = isEssential({ amountCents, item: label, category: product.category, at: now }, effective(toRules(data.rules).essentials, now));
  if (result.decision === "approve" && allowance && byId && essential && amountCents <= allowance.underCents) return done(decision, result.code, result.reason, "Your person allowed this kind of buy, so it would be bought with their saved PayPal.");
  // (The assistant is told "wait" while the person decides, exactly as in the real answer.)
  return done("wait", result.code, result.reason, result.decision === "wait" ? "Your person would get a card. Only THEIR yes can be a Buy now." : "Your person would get a card to say yes first.");
}
