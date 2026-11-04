import { connection } from "next/server";
import { getClientToken } from "@/lib/paypal";

// A short-lived, browser-safe token so the PayPal popup can start. It can't move money.
export async function GET() {
  await connection(); // a fresh token per request, never prerendered at build time
  try {
    return Response.json({ clientToken: await getClientToken() });
  } catch {
    return Response.json({ error: "Could not start PayPal" }, { status: 502 });
  }
}
