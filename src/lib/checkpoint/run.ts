// Wires the Agent Checkpoint to the real ledger, store and guarded checkout. Server only.
// This is where the checkpoint reaches checkout (the only door to PayPal), and only as `runCheckout`.
import "server-only";
import { randomUUID } from "node:crypto";
import { runCheckout } from "../checkout/run";
import { getLedger } from "../ledger/server";
import { getStore } from "../store";
import { createCheckpointHandler } from "./mcp";
import type { CheckpointDeps } from "./service";

export const checkpointDeps = (): CheckpointDeps => ({
  ledger: getLedger(),
  store: getStore(),
  checkout: (input, onStep) => runCheckout(input, onStep),
  now: () => new Date(),
  newId: () => randomUUID(),
});

// One handler for the life of the server, so each assistant's rate limit is remembered between requests.
let handler: ReturnType<typeof createCheckpointHandler> | undefined;
export const mcpHandler = (req: Request) => (handler ??= createCheckpointHandler(checkpointDeps()))(req);
