import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PUBLIC_API, PUBLIC_PAGES, isPublicPath } from "./public-paths";

// Login and access control, checked against the code itself so a new route can't quietly skip them.
const SRC = path.resolve(__dirname, "../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
  });
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const all = files(SRC).filter((f) => !/\.test\.tsx?$/.test(f)).map((f) => ({ file: rel(f), raw: readFileSync(f, "utf8"), text: strip(readFileSync(f, "utf8")) }));
const routes = all.filter((s) => /^app\/api\/.*\/route\.ts$/.test(s.file));
const routePath = (file: string) => "/" + file.replace(/^app\//, "").replace(/\/route\.ts$/, "");

describe("every web route checks the login", () => {
  it("finds the routes (so this test can't pass by finding nothing)", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it("every route calls authenticate() first, unless it is on the public list", () => {
    for (const r of routes) {
      const p = routePath(r.file);
      if (isPublicPath(p)) continue;
      const handlers = [...r.text.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\s*\(\s*(\w+)\s*:\s*Request\s*\)\s*\{\s*([^]*?)\n/g)];
      expect(handlers.length, `${r.file} has no handler`).toBeGreaterThan(0);
      for (const h of handlers) {
        // The first real statement of the handler must be the login check.
        const body = r.text.slice(r.text.indexOf(h[0]) + h[0].length - h[3].length - 1);
        expect(body.trimStart(), `${r.file} ${h[1]}`).toMatch(/^const auth = await authenticate\(\w+\);\s*if \(!auth\.ok\) return auth\.response;/);
      }
      expect(r.text, r.file).not.toMatch(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/);
    }
  });

  it("every public route is listed with the reason, and says so in its code", () => {
    for (const [p, { marker }] of Object.entries(PUBLIC_API)) {
      const r = routes.find((x) => routePath(x.file) === p);
      expect(r, `${p} has no route file`).toBeTruthy();
      expect(r!.text, `${p} must contain ${marker}`).toContain(marker);
    }
    // And no route is public by accident: the only public routes are the listed ones.
    const publicRoutes = routes.filter((r) => !/const auth = await authenticate\(/.test(r.text)).map((r) => routePath(r.file)).sort();
    expect(publicRoutes).toEqual(Object.keys(PUBLIC_API).filter((p) => p !== "/api/watch/run").sort());
  });

  it("the scheduled price check still needs a login for its button, and the cron secret for its schedule", () => {
    const r = routes.find((x) => routePath(x.file) === "/api/watch/run")!;
    expect(r.text).toMatch(/export async function POST\(req: Request\) \{\s*const auth = await authenticate\(req\);/);
    expect(r.text).toMatch(/export async function GET\(req: Request\) \{\s*if \(!isCronAuthorized/);
  });

  it("the only public pages are the login page", () => {
    expect([...PUBLIC_PAGES]).toEqual(["/login"]);
  });

  it("a person is identified only by the verified login, never by something the request says", () => {
    for (const r of routes) {
      expect(r.text, r.file).not.toMatch(/body\??\.(userId|user_id|uid)\b|searchParams\.get\(["'](user|uid|userId)/);
    }
  });

  it("getLedger is only called with a verified id", () => {
    for (const s of all) {
      for (const m of s.text.matchAll(/getLedger\(([^)]*)\)/g)) {
        const arg = m[1].trim();
        if (/^export function getLedger|userId: string/.test(m[0])) continue;
        expect(arg, `${s.file}: getLedger(${arg})`).toMatch(s.file === "app/api/auth/login/route.ts" ? /^r\.userId$/ : /^(auth\.userId|userId|opts\.userId|owner|id|uid)$/);
      }
    }
  });

  it("the CSRF and session cookie names live in one file", () => {
    const users = all.filter((s) => /north_session|north_csrf|x-north-csrf/.test(s.text)).map((s) => s.file).sort();
    expect(users).toEqual(["app/api/ask/route.ts", "components/csrf-fetch.tsx", "lib/auth/cookies.ts"]); // (ask passes the person's own login on to the helpers)
  });
});

describe("the browser code is safe from script injection and holds no secrets", () => {
  it("never writes HTML, or evaluates text", () => {
    for (const s of all) expect(s.text, s.file).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|document\.write\(|\beval\(|new Function\(|insertAdjacentHTML/);
  });

  it("client components read no server secrets", () => {
    for (const s of all.filter((x) => /^\s*["']use client["']/.test(x.raw))) {
      const envs = [...s.text.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]);
      for (const e of envs) expect(e, s.file).toMatch(/^NEXT_PUBLIC_/);
    }
  });

  it("only the PayPal client id is exposed to the browser", () => {
    const names = new Set(all.flatMap((s) => [...s.text.matchAll(/NEXT_PUBLIC_\w+/g)].map((m) => m[0])));
    for (const n of names) expect(n).toBe("NEXT_PUBLIC_PAYPAL_CLIENT_ID");
  });
});

describe("demo tools can't be reached unless demo mode is on", () => {
  it("only lib/demo/mode.ts reads the demo flags", () => {
    const users = all.filter((s) => /process\.env\.DEMO_(MODE|DEPLOYMENT)|env\.DEMO_(MODE|DEPLOYMENT)/.test(s.text)).map((s) => s.file);
    expect(users).toEqual(["lib/demo/mode.ts"]);
  });

  it("the demo-only routes check demoOnly() right after the login", () => {
    for (const p of ["/api/demo/ledger", "/api/demo/reset", "/api/demo-assistant"]) {
      const r = routes.find((x) => routePath(x.file) === p)!;
      expect(r.text, p).toMatch(/const auth = await authenticate\(req\);\s*if \(!auth\.ok\) return auth\.response;\s*const off = demoOnly\(auth\.userId\);\s*if \(off\) return off;/);
    }
  });

  it("the other demo features check demoAllowed(<this person>) before they do anything", () => {
    const uses = all.filter((s) => /demoAllowed\(auth\.userId\)/.test(s.text)).map((s) => s.file).sort();
    expect(uses).toEqual(["app/api/checkout/route.ts", "app/api/concierge/listing/route.ts", "app/api/summary/route.ts", "app/api/watch/run/route.ts"]);
  });

  it("pages only use the coarse switch to decide whether to SHOW a demo screen (the routes behind them decide per person)", () => {
    const uses = all.filter((s) => /isDemoMode\(\)/.test(s.text) && s.file !== "lib/demo/mode.ts").map((s) => s.file).sort();
    expect(uses).toEqual(["app/assistant-demo/page.tsx", "app/shop/[id]/page.tsx", "app/try-to-break/page.tsx"]);
  });

  it("the pretend hour reaches the Guardian only as `hourOverride`, never as the time", () => {
    const route = all.find((s) => s.file === "app/api/checkout/route.ts")!.text;
    expect(route).toContain("parseCheckoutBody(await readJson(req), { demoOn: demoAllowed(auth.userId) })");
    expect(route).not.toMatch(/\bat\s*[:,]|new Date\(.*pretend/);
    const request = all.find((s) => s.file === "lib/checkout/request.ts")!.text;
    expect(request).toContain("opts.demoOn && typeof b.pretendHour");
    expect(request).not.toMatch(/\bat\b\s*:/);
    expect(all.find((s) => s.file === "lib/checkout/checkout.ts")!.text).toMatch(/const at = now;/);
    expect(all.find((s) => s.file === "lib/checkout/checkout.ts")!.text).toMatch(/hourOverride: input\.pretendHour/);
  });
});

