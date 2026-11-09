// Shared by the screenshot and accessibility scripts: a browser that is logged in to a RUNNING North (practice account).
import { chromium } from "playwright-core";
import os from "node:os";
import fs from "node:fs";

export const BASE = process.env.BASE_URL ?? "http://localhost:3200";

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = `${os.homedir()}/Library/Caches/ms-playwright`;
  const dir = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => d.startsWith("chromium-")).sort().pop() : null;
  return dir ? `${cache}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` : undefined;
}

export async function launch() {
  return chromium.launch({ executablePath: chromePath() });
}

/** A new page at the given width, logged in (local practice login unless DEMO_LOGIN_* is set). */
export async function loggedInContext(browser, viewport, extra = {}) {
  // Logging in is rate limited, so the session is kept in a file and reused for 20 minutes.
  const file = `${os.tmpdir()}/north-ui-session-${new URL(BASE).port || "80"}.json`;
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 20 * 60 * 1000;
  const opts = { viewport, reducedMotion: extra.reducedMotion ?? "no-preference", deviceScaleFactor: extra.deviceScaleFactor ?? 1, ...(extra.contextOptions ?? {}) };
  if (fresh) return browser.newContext({ ...opts, storageState: file });
  const context = await browser.newContext(opts);
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    headers: { Origin: BASE },
    data: { email: process.env.DEMO_LOGIN_EMAIL ?? "demo@north.local", password: process.env.DEMO_LOGIN_PASSWORD ?? "north-practice" },
  });
  if (!res.ok()) throw new Error(`login failed ${res.status()}`);
  await context.storageState({ path: file });
  return context;
}

export async function setAppearance(page, prefs) {
  await page.addInitScript((p) => localStorage.setItem("north-appearance", JSON.stringify(p)), prefs);
}
