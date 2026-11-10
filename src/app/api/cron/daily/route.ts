import { getAnthropic } from "@/lib/agents/client";
import { keepDatabaseAwake } from "@/lib/cron/keepalive";
import { isCronAuthorized } from "@/lib/watcher/cron";
import { runScheduledWatch } from "@/lib/watcher/schedule";

// The daily schedule (Vercel cron). Proves who it is with `Authorization: Bearer <CRON_SECRET>`; with no CRON_SECRET set, nobody can start it.
//   1. a real read and write to the database, so the free-tier project never pauses,
//   2. the Price Watcher for everyone's waiting list (it can only write price news).
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const keepalive = await keepDatabaseAwake();
  let watch: Awaited<ReturnType<typeof runScheduledWatch>> | { skipped: string };
  try {
    watch = await runScheduledWatch(getAnthropic());
  } catch (e) {
    watch = { skipped: e instanceof Error && /ANTHROPIC/.test(e.message) ? "The AI key is not set." : "The price check did not run." };
  }
  return Response.json({ ok: keepalive.read && keepalive.write, keepalive, watch });
}
