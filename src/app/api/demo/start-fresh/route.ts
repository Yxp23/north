import { authenticate } from "@/lib/auth/guard";
import { demoOnly } from "@/lib/demo/mode";
import { runDemoWeek } from "@/lib/demo/seed-run";
import type { SeedReport } from "@/lib/demo/seed-week";
import { ndjsonResponse } from "@/lib/ndjson";
import { limited } from "@/lib/ratelimit/route";

// Demo only ("Start fresh"): put the practice account back to the seeded demo week, built by the real flows (see lib/demo/seed-week.ts).
// Only the practice account in a demo, never anyone else's. It streams the steps so the screen can show them, then a plain report.
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const off = demoOnly(auth.userId);
  if (off) return off;
  // A reset takes everyone's view back to the starting week, so it is limited more tightly than a normal tap.
  const tooMany = await limited(auth.userId, "start-fresh", 6, 3600);
  if (tooMany) return tooMany;
  return ndjsonResponse(
    async (send) => {
      const report: SeedReport = await runDemoWeek(auth.userId, (label) => send({ type: "step", label, state: "working" }));
      send({ type: "result", payload: report });
    },
    (send) => send({ type: "result", payload: { ok: false, steps: [], spentCents: 0, leftCents: 0, error: "That did not work. Nothing else was changed. Try again." } }),
  );
}
