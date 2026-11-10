import { channel3Source } from "./channel3-source";
import { DemoStore } from "./demo-store";
import { LiveStore } from "./live-store";
import type { StoreProvider } from "./types";

export type { StoreOffer, StoreProduct, StoreProvider } from "./types";

/**
 * The one place that decides which store the app uses. With a Channel3 key it is the live store (any Channel3
 * product is buyable at its live price, and the 14 demo products are the fallback). Without one it is just the demo products.
 * STORE_MODE=demo also keeps it to the 14 demo products: live results can show real brand names and logos in
 * their pictures, and the contest bans those in the video.
 */
/** True when prices come live from Channel3 (the screens then say so). */
export const storeIsLive = (env: Record<string, string | undefined> = process.env): boolean => Boolean(env.CHANNEL3_API_KEY) && env.STORE_MODE !== "demo";

export function getStore(): StoreProvider {
  return storeIsLive() ? new LiveStore(channel3Source) : new DemoStore();
}
