"use client";
// The browser remembers, for a short while, that the server just said "too many" (a 429), so every screen can answer calmly
// (not with a red "that did not work"). Fed by the fetch wrapper in components/csrf-fetch.tsx.
import { useSyncExternalStore } from "react";
import { RATE_LIMIT_MESSAGE } from "./rate-limit";

const WINDOW_MS = 45_000;
let at = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

export function markRateLimited() {
  at = Date.now();
  tell();
  if (timer) clearTimeout(timer);
  timer = setTimeout(tell, WINDOW_MS + 50); // screens go back to normal on their own: no timer is ever shown to the person
}
export const rateLimitedNow = () => Date.now() - at < WINDOW_MS;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
export function useRateLimited(): boolean {
  return useSyncExternalStore(subscribe, rateLimitedNow, () => false);
}
/** The words for a failed step: the calm sentence if the server just said "too many", otherwise the plain `generic` sentence. */
export const failureText = (generic: string) => (rateLimitedNow() ? RATE_LIMIT_MESSAGE : generic);
