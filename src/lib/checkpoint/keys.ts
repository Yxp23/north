// Each connected assistant has its OWN key. The key is shown once when it is made; only its SHA-256 hash is kept.
// A key works only on the MCP checkpoint (/api/mcp). It is not a PayPal credential and gives no account details.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AGENT_SCOPES, type AgentScope, type ConnectedAgent, type LedgerData } from "../ledger/types";

export const MAX_ACTIVE_AGENTS = 10;
const MAX_NAME = 40;

/**
 * A key names its owner (so the checkpoint knows whose ledger to look in) and carries 256 random bits. Knowing the owner's id
 * gives nothing: the key is only accepted if its HASH matches one of THAT person's connected assistants.
 */
export const newAgentKey = (userId: string) => `north_${userId.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}`;
const KEY_RE = /^north_([0-9a-f]{32})\.[A-Za-z0-9_-]{43}$/;

/** `Authorization: Bearer north_...` -> which person it claims to be for. Null for anything that is not shaped like a key. */
export function parseAgentKey(header: string | null | undefined): { key: string; userId: string } | null {
  const m = header?.match(/^Bearer (\S+)$/);
  const k = m?.[1].match(KEY_RE);
  if (!m || !k) return null;
  const h = k[1];
  return { key: m[1], userId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` };
}
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

const NAME_OK = /^[^<>@]+$/;
const LOOKS_LIKE_LINK = /https?:|www\.|\.(?:com|net|org|example|io)\b/i;

export type ConnectResult = { ok: true; agent: ConnectedAgent; key: string } | { ok: false; message: string };

/** What an assistant may do. Older assistants (no scopes stored) may do everything they always could. */
export const scopesOf = (a: Pick<ConnectedAgent, "scopes">): readonly AgentScope[] => a.scopes ?? AGENT_SCOPES;
export const can = (a: Pick<ConnectedAgent, "scopes">, scope: AgentScope) => scopesOf(a).includes(scope);

/** Turns whatever came from the screen into a clean list of scopes, or null if it is not one. */
export function cleanScopes(input: unknown): AgentScope[] | null {
  if (input === undefined) return [...AGENT_SCOPES];
  if (!Array.isArray(input) || input.length === 0 || input.length > AGENT_SCOPES.length) return null;
  const out = new Set<AgentScope>();
  for (const s of input) {
    if (!(AGENT_SCOPES as readonly unknown[]).includes(s)) return null;
    out.add(s as AgentScope);
  }
  // Asking to buy comes with checking on its own asks: it makes no sense to ask and never see the answer.
  if (out.has("request_purchase")) out.add("read_status");
  return AGENT_SCOPES.filter((s) => out.has(s));
}

export function connectAgent(data: LedgerData, rawName: string, now: Date, newId: () => string, userId: string, scopes: AgentScope[] = [...AGENT_SCOPES]): ConnectResult {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME || !NAME_OK.test(name) || LOOKS_LIKE_LINK.test(name)) return { ok: false, message: "Please give it a short plain name, like My assistant." };
  if (data.agentCheckpoint.agents.filter((a) => !a.revokedAt).length >= MAX_ACTIVE_AGENTS) return { ok: false, message: "You have a lot of assistants connected. Disconnect one first." };
  const key = newAgentKey(userId);
  const clean = cleanScopes(scopes);
  if (!clean) return { ok: false, message: "Please pick what it may do." };
  const agent: ConnectedAgent = { id: newId(), name, keyHash: hashKey(key), createdAt: now.toISOString(), scopes: clean };
  data.agentCheckpoint.agents.push(agent);
  return { ok: true, agent, key };
}

/** Disconnect: the key stops working at once. The record stays (so the audit log still makes sense). */
export function revokeAgent(data: LedgerData, id: string, now: Date): boolean {
  const a = data.agentCheckpoint.agents.find((x) => x.id === id);
  if (!a) return false;
  a.revokedAt ??= now.toISOString();
  return true;
}

/** Which connected assistant sent this `Authorization: Bearer <key>`? Null for anything else, including a disconnected one. */
export function authenticateAgent(data: Pick<LedgerData, "agentCheckpoint">, header: string | null | undefined): ConnectedAgent | null {
  const m = header?.match(/^Bearer (\S+)$/);
  if (!m) return null;
  const got = Buffer.from(hashKey(m[1]), "hex");
  let found: ConnectedAgent | null = null;
  // Check every assistant (no early exit), so the time taken doesn't say which one matched.
  for (const a of data.agentCheckpoint.agents) {
    const want = Buffer.from(a.keyHash, "hex");
    if (want.length === got.length && timingSafeEqual(want, got) && !a.revokedAt) found = a;
  }
  return found;
}
