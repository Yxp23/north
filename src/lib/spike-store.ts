// Spike-only storage for the saved PayPal token, in a local file so it survives dev reloads.
// Replaced by Supabase later. Server-only: the token never goes to the browser.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), ".data", "spike-vault.json");

export type SavedVault = { vaultId: string; customerId?: string };

export async function readVault(): Promise<SavedVault | null> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return null;
  }
}

export async function writeVault(v: SavedVault | null) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  if (v) await fs.writeFile(FILE, JSON.stringify(v, null, 2));
  else await fs.rm(FILE, { force: true });
}
