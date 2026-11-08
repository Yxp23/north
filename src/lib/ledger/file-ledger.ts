import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LockedLedger } from "./ledger";
import type { LedgerData } from "./types";

/** Keeps the ledger in one JSON file (.data is gitignored). Fine for local and a single demo server. */
export class FileLedger extends LockedLedger {
  protected lockKey: string;

  constructor(private readonly file: string, timeZone: string, clock?: () => Date, auditKey?: Buffer) {
    super(timeZone, clock, auditKey);
    this.lockKey = `file-${file}`;
  }

  protected async load(): Promise<LedgerData | null> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as LedgerData;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e; // a damaged file should be loud, not silently replaced
    }
  }

  protected async save(data: LedgerData) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.file); // swap in whole, so a crash can't leave half a file
  }
}
