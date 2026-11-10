// The scheduled price check for everyone's waiting list, one person at a time (capped), each in their own ledger.
// Shared by the old schedule route (/api/watch/run GET) and the daily cron. It can only write price news: it has no way to buy.
import "server-only";
import { randomUUID } from "node:crypto";
import type { ModelClient } from "../agents/loop";
import { getLedger, listUserIds } from "../ledger/server";
import { getStore } from "../store";
import { storeWatchBackend } from "./backend";
import { runWatchCheck } from "./run";

export async function runScheduledWatch(client: ModelClient): Promise<{ checked: number; told: number; error?: string }> {
  let checked = 0;
  let told = 0;
  let error: string | undefined;
  for (const userId of await listUserIds(20)) {
    const r = await runWatchCheck({ ledger: getLedger(userId), backend: storeWatchBackend(getStore()), client, now: () => new Date(), newId: () => `notice_${randomUUID()}` });
    checked += r.checked;
    told += r.notices.length;
    error ??= r.error;
  }
  return { checked, told, error };
}
