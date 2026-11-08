// Demo tools (the pretend hour, "Start over", the ledger peek, pretend tests, the assistant shortcut) must be impossible in a
// real deployment. Fail closed:
//  - while developing or testing (NODE_ENV is "development" or "test", or unset) they are on, unless DEMO_MODE=0,
//  - anywhere else (production, staging, anything unknown) they are OFF, unless the deployer sets BOTH DEMO_MODE=1 and
//    DEMO_DEPLOYMENT=1 (the explicit "this is the judges' demo" flag). DEMO_MODE=1 by itself is not enough.
// Even when on, the demo tools can never change how long a rule takes to change: the pretend hour only moves the hour of
// day the late-night rule sees (see CheckoutInput.pretendHour).
export type DemoState = {
  on: boolean;
  /** A deployed demo (production with both flags). The screens say so. */
  deployment: boolean;
  /** DEMO_MODE=1 in production without DEMO_DEPLOYMENT=1: ignored, and worth a warning. */
  misconfigured: boolean;
};

export function demoState(env: Record<string, string | undefined> = process.env): DemoState {
  const nodeEnv = env.NODE_ENV;
  const developing = nodeEnv === undefined || nodeEnv === "development" || nodeEnv === "test";
  if (developing) return { on: env.DEMO_MODE !== "0", deployment: false, misconfigured: false };
  const mode = env.DEMO_MODE === "1";
  const deployed = env.DEMO_DEPLOYMENT === "1";
  return { on: mode && deployed, deployment: mode && deployed, misconfigured: mode && !deployed };
}

let warned = false;
export function isDemoMode(): boolean {
  const s = demoState();
  if (s.misconfigured && !warned) {
    warned = true;
    console.error("[security] DEMO_MODE=1 is ignored in production unless DEMO_DEPLOYMENT=1 is also set. Demo tools stay OFF.");
  }
  return s.on;
}

export const isDemoDeployment = () => demoState().deployment;

/**
 * May THIS person use demo tools? While developing, yes. In a deployed demo, only the practice account (DEMO_USER_ID, the one
 * the judges log in to): a real person's account on the same server can never be changed by a demo tool. If DEMO_USER_ID is
 * not set in a deployed demo, nobody can.
 */
export function demoAllowed(userId: string, env: Record<string, string | undefined> = process.env): boolean {
  const s = demoState(env);
  if (!s.on) return false;
  if (!s.deployment) return true;
  const demoUser = env.DEMO_USER_ID;
  return !!demoUser && userId === demoUser;
}

/** For demo-only routes: null when allowed, otherwise the response to send (a plain 404, as if the route did not exist). */
export function demoOnly(userId: string): Response | null {
  return demoAllowed(userId) ? null : Response.json({ error: "Not available" }, { status: 404 });
}
