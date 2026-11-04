import { runSavePaypal } from "@/lib/connect/run";

// Step 3 of connecting PayPal: swap the approved setup token for the permanent token.
// The permanent token stays on the server. The browser only learns whether it was saved.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.vaultSetupToken;
  if (typeof token !== "string" || token.length < 5 || token.length > 200) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { saved } = await runSavePaypal(token);
  return Response.json({ saved }, { status: saved ? 200 : 502 });
}
