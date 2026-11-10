"use client";
// "Try the demo": one tap. It signs in to the practice account through the NORMAL login route (the same password check, the same rate limits,
// the same session cookies as the login form). It is only ever given the practice login by the server, and only in the judges' demo deployment;
// everywhere else this is a plain link to the login page.
import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProblemNote } from "@/components/states";
import type { PracticeLogin } from "@/lib/demo/practice";
import { isRateLimitMessage } from "@/lib/ui/rate-limit";

export function TryDemo({ practice }: { practice: PracticeLogin | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!practice) {
    return <Link href="/login" className="n-btn n-btn-primary n-btn-auto">Log in <ArrowRight aria-hidden="true" /></Link>;
  }

  // "Start fresh" is not offered here: a first-time visitor would not know what it means, and it would let one judge reset another's demo.
  // It lives in Demo tools only.
  async function go() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(practice) });
      const j = await res.json().catch(() => ({}));
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
      <button type="button" className="n-btn n-btn-primary n-btn-auto" onClick={go} disabled={busy}>
        <Play aria-hidden="true" />{busy ? "Starting the demo…" : "Try the demo"}
      </button>
      {error && <div className="lp-error"><ProblemNote message={error} /></div>}
    </>
  );
}
