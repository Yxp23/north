import { isDemoDeployment } from "@/lib/demo/mode";
import { runDemoWeek } from "@/lib/demo/seed-run";
import { isCronAuthorized } from "@/lib/watcher/cron";

// The daily demo reset (Vercel cron). Proves who it is with `Authorization: Bearer <CRON_SECRET>`. Only in the judges' deployment, and only
// for the practice account (DEMO_USER_ID): it rebuilds the seeded demo week with the real flows. The Guardian's rules are not touched.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const userId = process.env.DEMO_USER_ID;
  if (!isDemoDeployment() || !userId) return Response.json({ skipped: "This is not the judges' demo deployment." });
  const report = await runDemoWeek(userId);
  return Response.json({ ok: report.ok, steps: report.steps, spentCents: report.spentCents, leftCents: report.leftCents });
}
