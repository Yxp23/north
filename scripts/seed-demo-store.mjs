// Builds data/demo-products.json from live Channel3 data.
// Run: node --env-file=.env.local scripts/seed-demo-store.mjs
//
// - Prices and images come straight from the Channel3 API. We never type a price by hand.
// - `name` is a brand-free display name we choose (the contest bans real brands and logos
//   in demo data and the video). Seller names and domains are not saved.
// - `tracked: true` means price tracking was started on Nov 4 (data/tracked-products.json),
//   so the scam check can read a price history for it.
import { readFileSync, writeFileSync } from "node:fs";

const tracked = new Set(
  Object.values(JSON.parse(readFileSync("data/tracked-products.json", "utf8")).groups).flat(),
);

// [Channel3 id, display name, category, image index (omit to use the main image)]
// Image indexes were chosen by eye: plain product shot, no people, no visible logo or brand text.
const PICKS = [
  ["cY1jWjp", "Mild Shampoo", "personal care", 0], // not tracked; front of the bottle, no brand name
  ["ENVDwLq", "Over-Ear Headphones", "electronics", 1], // tracked; front view, no logo
  ["OpovWAw", "Running Series Sneakers", "shoes"], // tracked
  ["VIYcSuc", "Kitchen Sponges", "household", 2],
  ["ioVqCKq", "Plain Cotton Terry Bath Towel", "household"],
  ["Qez8uoD", "Plain Notebook A5", "school and office"],
  ["z6AiKn7", "Plain T-Shirt", "clothes", 0],
  ["7b5sz6i", "White T-Shirt", "clothes"],
  ["0HzVACz", "Cotton Crew Socks", "clothes", 0],
  ["3swBTuK", "Canvas Tote Bag", "bags", 0],
  ["k1pWyMx", "Umbrella", "rain gear"],
  ["e16fOKW", "Stainless Steel Water Bottle", "kitchen", 0],
];

const products = [];
for (const [id, name, category, imageIndex] of PICKS) {
  const res = await fetch(`https://api.trychannel3.com/v1/products/${id}`, {
    headers: { "x-api-key": process.env.CHANNEL3_API_KEY },
  });
  if (!res.ok) throw new Error(`Channel3 ${res.status} for ${id}`);
  const p = await res.json();

  // Prefer an in-stock offer; fall back to the first one.
  const offer = p.offers?.find((o) => /in.?stock/i.test(o.availability ?? "")) ?? p.offers?.[0];
  const image =
    imageIndex === undefined
      ? (p.images?.find((i) => i.is_main_image) ?? p.images?.[0])
      : p.images?.[imageIndex];
  if (!offer || !image) throw new Error(`No offer or image for ${id}`);
  console.log(`${id} | ${name} | ${offer.price.price} ${offer.price.currency} | ${offer.availability} | ${image.url}`);

  products.push({
    id,
    name,
    category,
    priceCents: Math.round(offer.price.price * 100),
    currency: offer.price.currency,
    imageUrl: image.url,
    tracked: tracked.has(id),
  });
}

writeFileSync(
  "data/demo-products.json",
  JSON.stringify({ seededAt: new Date().toISOString().slice(0, 10), products }, null, 2) + "\n",
);
console.log(`\nSaved ${products.length} products.`);
