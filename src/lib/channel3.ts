// Server-only Channel3 helpers. Plain REST on purpose (@channel3/sdk v4.6 doesn't match the docs).
import "server-only";

import { createHash } from "node:crypto";

const BASE = "https://api.trychannel3.com";
/** Searches and product reads are kept for 10 minutes. Price history changes slowly: an hour. */
export const SEARCH_TTL_MS = 10 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 60 * 1000;
const MAX_CACHED = 300;

/** An error from Channel3 with its HTTP status, so callers can tell "no such product" (404) from "down". */
export class Channel3Error extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const cache = new Map<string, { at: number; value: unknown }>();

type CallOptions = { ttlMs?: number; /** Skip the cache and read it from Channel3 now (checkout does this for the price). */ fresh?: boolean };

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, { ttlMs = SEARCH_TTL_MS, fresh = false }: CallOptions = {}): Promise<T> {
  // A picture search body is huge, so the key is a short hash of it.
  const key = `${method} ${path} ${body ? createHash("sha1").update(JSON.stringify(body)).digest("hex") : ""}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;

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
  if (!res.ok) throw new Channel3Error(res.status, `Channel3 ${res.status}: ${text.slice(0, 500)}`);
  cache.set(key, { at: Date.now(), value: json });
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!); // forget the oldest, so memory stays small
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
  description?: string;
  brands?: { name?: string }[] | string[];
  images?: { url: string; is_main_image?: boolean }[];
  offers?: Channel3Offer[];
  category?: { title?: string; path?: { title?: string }[] };
  variants?: { options?: { name?: string; values?: { label?: string; exists?: boolean }[] }[] };
};

export function search(input: { query?: string; base64Image?: string; limit?: number }) {
  const body: Record<string, unknown> = { limit: input.limit ?? 5 };
  if (input.query) body.query = input.query;
  // Channel3 wants raw base64: strip any "data:image/...;base64," prefix.
  if (input.base64Image) body.base64_image = input.base64Image.replace(/^data:[^;]+;base64,/, "");
  return call<{ products: Channel3Product[] }>("POST", "/v1/search", body);
}

export const getProduct = (id: string, opts: { fresh?: boolean } = {}) =>
  call<Channel3Product>("GET", `/v1/products/${encodeURIComponent(id)}`, undefined, { fresh: opts.fresh });

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
  call<PriceHistory>("GET", `/v0/price-tracking/history/${encodeURIComponent(id)}?days=${days}`, undefined, { ttlMs: HISTORY_TTL_MS });
