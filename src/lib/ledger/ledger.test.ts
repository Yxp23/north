import { MemoryLedger } from "./ledger";
import { ledgerContract } from "./ledger-contract";

ledgerContract("Memory", async () => ({
  ledger: new MemoryLedger("America/New_York", () => new Date("2026-11-04T15:00:00Z")),
}));
