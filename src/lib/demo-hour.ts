"use client";
// Demo only: the "pretend it is ..." choice, kept in the browser's local storage.
// useSyncExternalStore keeps server and browser renders in step (the server sees "").
import { useSyncExternalStore } from "react";

const KEY = "north-demo-hour";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return ""; // storage can be blocked; the app still works
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** "" for the real time, or an hour "0".."23". */
export function useDemoHour(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

export function setDemoHour(value: string) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
