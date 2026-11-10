import { randomUUID } from "node:crypto";
import { getAnthropic, NOT_SET_UP } from "@/lib/agents/client";
import { authenticate } from "@/lib/auth/guard";
import { demoAllowed } from "@/lib/demo/mode";
import { readJson } from "@/lib/http/body";
import { getLedger, listUserIds } from "@/lib/ledger/server";
import { ndjsonResponse } from "@/lib/ndjson";
import { limited } from "@/lib/ratelimit/route";
import { getStore } from "@/lib/store";
import { isCronAuthorized } from "@/lib/watcher/cron";
import { storeWatchBackend } from "@/lib/watcher/backend";
import { runWatchCheck, type WatchRunResult } from "@/lib/watcher/run";

// "Check prices now" (the button in Demo tools) and the schedule (Vercel cron, later: GET with CRON_SECRET).
// The Price Watcher can only write price news. It has no way to buy: a notice only opens the product, and a buy
// still goes through the Money Guardian.
function deps(userId: string, pretendDropPercent?: number) {
  return { ledger: getLedger(userId), backend: storeWatchBackend(getStore()), now: () => new Date(), newId: () => `notice_${randomUUID()}`, pretendDropPercent };
}

/** The button. Streams the steps for the activity panel, then the result. */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  // "Pretend the prices dropped" is a demo tool. It only works when demo tools are on.
  const p = Number(body?.pretendDropPercent);
  const pretend = demoAllowed(auth.userId) && Number.isFinite(p) && p > 0 && p < 100 ? Math.round(p) : undefined;
  const tooMany = await limited(auth.userId, "watch-run", 30, 3600);
  if (tooMany) return tooMany;

  return ndjsonResponse(
    async (send) => {
      let client;
      try {
        client = getAnthropic();
      } catch {
        send({ type: "result", payload: { checked: 0, notices: [], error: NOT_SET_UP } satisfies WatchRunResult });
        return;
      }
      const payload = await runWatchCheck({ ...deps(auth.userId, pretend), client, onStep: (s) => send({ type: "step", ...s }) });
      send({ type: "result", payload });
    },
    (send) => send({ type: "result", payload: { checked: 0, notices: [], error: "Something went wrong. Please try again." } satisfies WatchRunResult }),
  );
}

/** The schedule. Only with the secret; with no CRON_SECRET set it is off. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  let client;
  try {
    client = getAnthropic();
  } catch {
    return Response.json({ error: NOT_SET_UP }, { status: 503 });
  }
  // The schedule checks everyone's waiting list, one person at a time (capped), each in their own ledger.
  let checked = 0;
  let told = 0;
  let error: string | undefined;
  for (const userId of await listUserIds(20)) {
    const r = await runWatchCheck({ ...deps(userId), client });
    checked += r.checked;
    told += r.notices.length;
    error ??= r.error;
  }
  return Response.json({ checked, told, error });
}
