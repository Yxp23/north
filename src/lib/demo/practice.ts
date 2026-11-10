// The practice account's login, for the judges' demo only. It is the SAME email and password the login page already fills in for a deployed
// demo (the account holds practice money only). "Try the demo" signs in with them through the normal login route, so it uses exactly the
// same password check, rate limits and session as any login. Nothing here can sign in anyone else.
import "server-only";
import { isDemoDeployment } from "./mode";

export type PracticeLogin = { email: string; password: string };

export function practiceLogin(env: Record<string, string | undefined> = process.env): PracticeLogin | null {
  if (!isDemoDeployment()) return null;
  if (!env.DEMO_USER_ID || !env.DEMO_LOGIN_EMAIL || !env.DEMO_LOGIN_PASSWORD) return null;
  return { email: env.DEMO_LOGIN_EMAIL, password: env.DEMO_LOGIN_PASSWORD };
}
