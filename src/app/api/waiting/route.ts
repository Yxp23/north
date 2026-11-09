import { authenticate } from "@/lib/auth/guard";
import { readJson } from "@/lib/http/body";
import { getLedger } from "@/lib/ledger/server";
import { addAudit, dropWaiting, restoreWaiting } from "@/lib/ledger/logic";
import { limited } from "@/lib/ratelimit/route";

// The person's own choice to take a saved item off the waiting list, and to put it back (Undo). Neither one can buy anything or
// make a rule weaker: a removed item that is bought again just waits again, and Undo restores the same record with its own timer.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "waiting", 120, 3600);
  if (tooMany) return tooMany;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" && body.id.length <= 80 ? body.id : "";
  const action = body?.action;
  if (!id || (action !== "remove" && action !== "undo")) return Response.json({ error: "Bad request" }, { status: 400 });
  const now = new Date();
  let done = false;
  await getLedger(auth.userId).update((d) => {
    done = action === "remove" ? dropWaiting(d, id) : restoreWaiting(d, id);
    if (done) addAudit(d, action === "remove" ? "waitlist_removed" : "waitlist_restored", `${action === "remove" ? "Removed from" : "Put back on"} the waiting list: ${id}`, now);
  });
  return Response.json({ status: done ? (action === "remove" ? "removed" : "restored") : "not_found" }, { status: done ? 200 : 404 });
}
