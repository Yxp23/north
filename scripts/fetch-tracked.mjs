// Prints a compact summary of the tracked Channel3 products so we can pick demo-store items.
// Run: node --env-file=.env.local scripts/fetch-tracked.mjs
import { readFileSync } from "node:fs";

const tracked = JSON.parse(readFileSync("data/tracked-products.json", "utf8"));
for (const [group, ids] of Object.entries(tracked.groups)) {
  for (const id of ids) {
    const res = await fetch(`https://api.trychannel3.com/v1/products/${id}`, {
      headers: { "x-api-key": process.env.CHANNEL3_API_KEY },
    });
    if (!res.ok) { console.log(group, id, "HTTP", res.status); continue; }
    const p = await res.json();
    const o = p.offers?.[0];
    const brands = (p.brands ?? []).map((b) => (typeof b === "string" ? b : b.name)).join("/");
    console.log(`${group} | ${id} | ${p.title} | brands=${brands || "-"} | ${o?.price?.price} ${o?.price?.currency} | offers=${p.offers?.length} | imgs=${p.images?.length}`);
  }
}
