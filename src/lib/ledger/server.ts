import "server-only";
import path from "node:path";
import { FileLedger } from "./file-ledger";
import type { Ledger } from "./ledger";

/** The user's time zone. The late-night rule and "this week" use it. */
export const TIME_ZONE = process.env.DEMO_TIME_ZONE || "America/New_York";

/** Demo tools (pretend clock, reset) are on in development, and in production only if DEMO_MODE=1. */
export const isDemoMode = () => process.env.DEMO_MODE === "1" || process.env.NODE_ENV !== "production";

let ledger: Ledger | undefined;
export function getLedger(): Ledger {
  return (ledger ??= new FileLedger(path.join(process.cwd(), ".data", "north-ledger.json"), TIME_ZONE));
}
