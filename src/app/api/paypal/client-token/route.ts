import { connection } from "next/server";
import { authenticate } from "@/lib/auth/guard";
import { getClientToken } from "@/lib/paypal";

// A short-lived, browser-safe token so the PayPal popup can start. It can't move money.
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  await connection(); // a fresh token per request, never prerendered at build time
  try {
    return Response.json({ clientToken: await getClientToken() });
  } catch {
    return Response.json({ error: "Could not start PayPal" }, { status: 502 });
  }
}
