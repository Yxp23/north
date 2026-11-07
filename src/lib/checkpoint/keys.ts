// Each connected assistant has its OWN key. The key is shown once when it is made; only its SHA-256 hash is kept.
// A key works only on the MCP checkpoint (/api/mcp). It is not a PayPal credential and gives no account details.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ConnectedAgent, LedgerData } from "../ledger/types";

export const MAX_ACTIVE_AGENTS = 10;
const MAX_NAME = 40;

export const newAgentKey = () => `north_${randomBytes(32).toString("base64url")}`;
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

const NAME_OK = /^[^<>@]+$/;
const LOOKS_LIKE_LINK = /https?:|www\.|\.(?:com|net|org|example|io)\b/i;

export type ConnectResult = { ok: true; agent: ConnectedAgent; key: string } | { ok: false; message: string };

export function connectAgent(data: LedgerData, rawName: string, now: Date, newId: () => string): ConnectResult {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME || !NAME_OK.test(name) || LOOKS_LIKE_LINK.test(name)) return { ok: false, message: "Please give it a short plain name, like My assistant." };
  if (data.agentCheckpoint.agents.filter((a) => !a.revokedAt).length >= MAX_ACTIVE_AGENTS) return { ok: false, message: "You have a lot of assistants connected. Disconnect one first." };
  const key = newAgentKey();
  const agent: ConnectedAgent = { id: newId(), name, keyHash: hashKey(key), createdAt: now.toISOString() };
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
