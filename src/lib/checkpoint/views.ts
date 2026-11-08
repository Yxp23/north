// What the My rules screen shows about connected assistants. Never a key, a hash, or anything about PayPal.
import { assistantAllowance, permissionInWords } from "./permission";
import { REQUEST_LIFETIME_MS } from "../ledger/logic";
import type { AgentRequest, AgentScope, LedgerData, RequestStep } from "../ledger/types";
import { scopesOf } from "./keys";
import { RULE_DELAY_MS } from "../guardian";

export type AssistantsView = {
  permission: { words: string; /** In force now. Null = ask me every time. */ underCents: number | null; pending?: { underCents: number | null; startsAt: string } };
  agents: { id: string; name: string; createdAt: string; lastUsedAt?: string; scopes: readonly AgentScope[] }[];
  requests: { id: string; agentName: string; name: string; imageUrl: string; quantity: number; amountCents: number; status: AgentRequest["status"]; reason: string; createdAt: string; steps: RequestStep[] }[];
};

export function assistantsView(data: LedgerData, now: Date): AssistantsView {
  const c = data.agentCheckpoint;
  const force = assistantAllowance(data, now);
  const waiting = now.getTime() - new Date(c.permission.changedAt).getTime() < RULE_DELAY_MS && JSON.stringify(c.permission.value) !== JSON.stringify(force);
  return {
    permission: {
      words: permissionInWords(data, now),
      underCents: force?.underCents ?? null,
      ...(waiting ? { pending: { underCents: c.permission.value?.underCents ?? null, startsAt: new Date(new Date(c.permission.changedAt).getTime() + RULE_DELAY_MS).toISOString() } } : {}),
    },
    agents: c.agents.filter((a) => !a.revokedAt).map((a) => ({ id: a.id, name: a.name, createdAt: a.createdAt, scopes: scopesOf(a), ...(a.lastUsedAt ? { lastUsedAt: a.lastUsedAt } : {}) })),
    requests: [...c.requests]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
      .map((r) => ({
        id: r.id, agentName: r.agentName, name: r.name, imageUrl: r.imageUrl, quantity: r.quantity, amountCents: r.amountCents,
        status: r.status === "pending" && now.getTime() - new Date(r.createdAt).getTime() >= REQUEST_LIFETIME_MS ? "expired" : r.status,
        reason: r.reason, createdAt: r.createdAt, steps: r.steps,
      })),
  };
}
