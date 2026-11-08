// Wires the Agent Checkpoint to the real ledger, store and guarded checkout. Server only.
// This is where the checkpoint reaches checkout (the only door to PayPal), and only as `runCheckout`.
import "server-only";
import { randomUUID } from "node:crypto";
import { runCheckout } from "../checkout/run";
import { getLedger, getRateLimiter, userExists } from "../ledger/server";
import { getStore } from "../store";
import { createCheckpointHandler } from "./mcp";
import type { CheckpointDeps } from "./service";

/** Everything the checkpoint needs for ONE person. */
export const checkpointDeps = (userId: string): CheckpointDeps => ({
  ledger: getLedger(userId),
  store: getStore(),
  checkout: (input, onStep) => runCheckout(userId, input, onStep),
  now: () => new Date(),
  newId: () => randomUUID(),
});

const addressOf = (req: Request) => (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);

let handler: ReturnType<typeof createCheckpointHandler> | undefined;
export const mcpHandler = (req: Request) =>
  (handler ??= createCheckpointHandler(async (userId) => ((await userExists(userId)) ? checkpointDeps(userId) : null), getRateLimiter(), addressOf))(req);
