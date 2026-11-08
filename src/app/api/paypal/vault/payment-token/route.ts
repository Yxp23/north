import { authenticate } from "@/lib/auth/guard";
import { runSavePaypal } from "@/lib/connect/run";
import { readJson } from "@/lib/http/body";
import { limited } from "@/lib/ratelimit/route";

// Step 3 of connecting PayPal: swap the approved setup token for the permanent token.
// The permanent token stays on the server. The browser only learns whether it was saved.
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const tooMany = await limited(auth.userId, "paypal-save", 20, 3600);
  if (tooMany) return tooMany;
  const body = (await readJson(req, 4000)) as { vaultSetupToken?: unknown; receivedKeys?: unknown } | null;
  const token = body?.vaultSetupToken;
  if (typeof token !== "string" || token.length < 5 || token.length > 200) {
    // The page sends the NAMES of the fields PayPal gave it (never the values), so we can see what changed.
    console.warn("[connect] no setup token in the approval. Fields PayPal sent:", body?.receivedKeys);
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const { saved } = await runSavePaypal(auth.userId, token);
    return Response.json({ saved }, { status: saved ? 200 : 502 });
  } catch (e) {
    // e.g. the database is unreachable. Say so in the log; show the user a plain failure.
    console.error("[connect] could not save PayPal:", e instanceof Error ? e.message : e);
    return Response.json({ saved: false }, { status: 500 });
  }
}
