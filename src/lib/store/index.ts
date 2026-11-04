import { DemoStore } from "./demo-store";
import type { StoreProvider } from "./types";

export type { StoreProduct, StoreProvider } from "./types";

/** The one place that decides which store the app uses. */
export function getStore(): StoreProvider {
  return new DemoStore();
}
