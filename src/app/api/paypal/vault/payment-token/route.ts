import { runSavePaypal } from "@/lib/connect/run";

// Step 3 of connecting PayPal: swap the approved setup token for the permanent token.
// The permanent token stays on the server. The browser only learns whether it was saved.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.vaultSetupToken;
  if (typeof token !== "string" || token.length < 5 || token.length > 200) {
    // The page sends the NAMES of the fields PayPal gave it (never the values), so we can see what changed.
    console.warn("[connect] no setup token in the approval. Fields PayPal sent:", body?.receivedKeys);
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const { saved } = await runSavePaypal(token);
    return Response.json({ saved }, { status: saved ? 200 : 502 });
  } catch (e) {
    // e.g. the database is unreachable. Say so in the log; show the user a plain failure.
    console.error("[connect] could not save PayPal:", e instanceof Error ? e.message : e);
    return Response.json({ saved: false }, { status: 500 });
  }
}
