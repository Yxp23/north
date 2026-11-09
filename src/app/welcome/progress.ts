// Where a person is in first-run setup. Kept in this browser only (it is not money, a rule or a permission), so it is resumable on this device.
export type SetupState = "todo" | "started" | "skipped" | "done";
export type SetupProgress = { state: SetupState; step: 1 | 2 | 3 };
const KEY = "north-setup";
const listeners = new Set<() => void>();
let raw: string | null | undefined;
let cached: SetupProgress = { state: "todo", step: 1 };

export function readSetup(): SetupProgress {
  let now: string | null = null;
  try {
    now = localStorage.getItem(KEY);
  } catch {
    now = null;
  }
  if (now !== raw) {
    raw = now;
    try {
      const j = now ? JSON.parse(now) : null;
      const state: SetupState = ["todo", "started", "skipped", "done"].includes(j?.state) ? j.state : "todo";
      const step = j?.step === 2 || j?.step === 3 ? j.step : 1;
      cached = { state, step };
    } catch {
      cached = { state: "todo", step: 1 };
    }
  }
  return cached;
}
export function writeSetup(p: SetupProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* blocked storage: setup still works, it just won't be remembered */
  }
  raw = undefined;
  listeners.forEach((l) => l());
}
export function subscribeSetup(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
