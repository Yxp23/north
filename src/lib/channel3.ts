// Server-only Channel3 helpers. Plain REST on purpose (@channel3/sdk v4.6 doesn't match the docs).
import "server-only";

const BASE = "https://api.trychannel3.com";
const TTL_MS = 60 * 60 * 1000; // cache every response for an hour

const cache = new Map<string, { at: number; value: unknown }>();

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = `${method} ${path} ${body ? JSON.stringify(body) : ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Error("CHANNEL3_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  console.log(`[channel3] ${method} ${path} -> ${res.status}`);
  // Errors are not cached.
  if (!res.ok) throw new Error(`Channel3 ${res.status}: ${text.slice(0, 500)}`);
  cache.set(key, { at: Date.now(), value: json });
  return json as T;
}

export type Channel3Offer = {
  domain: string;
  price: { price: number; currency: string; compare_at_price?: number | null };
  availability?: string;
};
export type Channel3Product = {
  id: string;
  title: string;
  brands?: { name?: string }[] | string[];
  images?: { url: string; is_main_image?: boolean }[];
  offers?: Channel3Offer[];
};

export function search(input: { query?: string; base64Image?: string; limit?: number }) {
  const body: Record<string, unknown> = { limit: input.limit ?? 5 };
  if (input.query) body.query = input.query;
  // Channel3 wants raw base64: strip any "data:image/...;base64," prefix.
  if (input.base64Image) body.base64_image = input.base64Image.replace(/^data:[^;]+;base64,/, "");
  return call<{ products: Channel3Product[] }>("POST", "/v1/search", body);
}

export const getProduct = (id: string) =>
  call<Channel3Product>("GET", `/v1/products/${encodeURIComponent(id)}`);

export const startTracking = (canonicalProductId: string) =>
  call<unknown>("POST", "/v0/price-tracking/start", { canonical_product_id: canonicalProductId });

export type PriceHistory = {
  history: unknown[];
  statistics: {
    current_price: number;
    min_price: number;
    max_price: number;
    mean: number;
    current_status: "low" | "typical" | "high";
  };
};

export const getHistory = (id: string, days = 30) =>
  call<PriceHistory>("GET", `/v0/price-tracking/history/${encodeURIComponent(id)}?days=${days}`);
