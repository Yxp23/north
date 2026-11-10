"use client";
// "Try the demo": one tap. It signs in to the practice account through the NORMAL login route (the same password check, the same rate limits,
// the same session cookies as the login form). It is only ever given the practice login by the server, and only in the judges' demo deployment;
// everywhere else this is a plain link to the login page.
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProblemNote } from "@/components/states";
import type { PracticeLogin } from "@/lib/demo/practice";
import type { SeedReport } from "@/lib/demo/seed-week";
import { postAgent } from "@/lib/ndjson-client";
import { isRateLimitMessage } from "@/lib/ui/rate-limit";

export function TryDemo({ practice }: { practice: PracticeLogin | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");

  if (!practice) {
    return <Link href="/login" className="n-btn n-btn-primary n-btn-auto">Log in <ArrowRight aria-hidden="true" /></Link>;
  }

  // `fresh`: after signing in, also put the demo back to its starting week (Start fresh), then open it.
  async function go(fresh = false) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(practice) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && fresh) {
        setWorking("Setting up a fresh week. This can take up to a minute.");
        const r = await postAgent<SeedReport>("/api/demo/start-fresh", {}, (events) => setWorking(events.length ? events[events.length - 1].label : "Setting up a fresh week…"));
        if (!r.payload) {
          setError(r.error ?? "I could not set up a fresh week just now. Nothing else was changed. You can still try the demo as it is.");
          setBusy(false);
          setWorking("");
          return;
        }
      }
      if (res.ok) {
        // A full page load on purpose: the signed-in page replaces the landing page, with nothing left over.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
        return;
      }
      setError(typeof j.error === "string" && (res.status === 429 || isRateLimitMessage(j.error)) ? j.error : "I could not start the demo just now. Nothing was changed. Try again, or log in.");
    } catch {
      setError("I could not reach North. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="n-btn n-btn-primary n-btn-auto" onClick={() => go(false)} disabled={busy}>
        <Play aria-hidden="true" />{busy && !working ? "Starting the demo…" : "Try the demo"}
      </button>
      <button type="button" className="n-btn n-btn-quiet n-btn-auto lp-fresh" onClick={() => go(true)} disabled={busy}>
        <RotateCcw aria-hidden="true" />Start fresh
      </button>
      {working && <p role="status" className="lp-error n-note n-note-quiet"><span>{working}</span></p>}
      {error && <div className="lp-error"><ProblemNote message={error} /></div>}
    </>
  );
}
