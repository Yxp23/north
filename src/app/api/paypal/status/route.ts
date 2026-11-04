import { readVault, writeVault } from "@/lib/spike-store";

// Tells the page whether a PayPal account is saved. Never returns the token itself.
export async function GET() {
  return Response.json({ saved: Boolean(await readVault()) });
}

// Forget the saved account locally (start the spike over).
export async function DELETE() {
  await writeVault(null);
  return Response.json({ saved: false });
}
