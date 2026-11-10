// "Is someone signed in?", only to choose what to SHOW: the landing page or Home at "/", and whether the header has the tabs.
// It grants nothing. Every API route and every data screen still checks the login itself (auth/guard.ts), so a wrong answer here can
// only change which page is drawn, never what anyone can see or do.
import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { subkey } from "../guardian/secret";
import { SESSION_COOKIE } from "./cookies";
import { verifySession } from "./session";

export async function isSignedIn(): Promise<boolean> {
  await connection(); // per request, never prerendered: the answer depends on who is asking
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return verifySession(token, subkey("session"), Date.now()).ok;
  } catch {
    return false; // for example a missing secret in production: nobody is signed in
  }
}
