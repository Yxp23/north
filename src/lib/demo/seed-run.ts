// Wires the demo-week seed to the real ledger, shop, signing key and (when the key is set) the AI. Server only.
import "server-only";
import { randomUUID } from "node:crypto";
import { getAnthropic } from "../agents/client";
import { guardianCrypto } from "../checkout/run";
import { channel3Backend } from "../dealcheck/channel3-backend";
import { getLedger } from "../ledger/server";
import { getStore } from "../store";
import { storeWatchBackend } from "../watcher/backend";
import { seedDemoWeek, type SeedReport } from "./seed-week";

export function runDemoWeek(userId: string, onStep?: (label: string) => void): Promise<SeedReport> {
  let ai: Parameters<typeof seedDemoWeek>[0]["ai"];
  try {
    ai = { client: getAnthropic(), dealBackend: channel3Backend, watchBackend: storeWatchBackend(getStore()) };
  } catch {
    ai = undefined; // no AI key: those two steps are skipped, and the report says so
  }
  return seedDemoWeek({ userId, ledger: getLedger(userId), store: getStore(), crypto: guardianCrypto(), now: () => new Date(), newId: () => randomUUID(), ai, onStep });
}
