/** True only for development, tests and the attacker (PAYMENTS_MODE=simulated): payments are pretended. Never in production. */
export const simulatedPayments = (env: Record<string, string | undefined> = process.env) => env.PAYMENTS_MODE === "simulated" && env.NODE_ENV !== "production";
