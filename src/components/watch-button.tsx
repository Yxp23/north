"use client";
// "Wait, and watch the price": the user chose to wait, so the Price Watcher keeps an eye on the price and tells them
// on the home screen if it drops, comes back to a normal price, or sells out. It can only tell them: it can't buy.
import Link from "next/link";
import { useState } from "react";
import { btnPrimary } from "./classes";

export function WatchButton({ productId }: { productId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "full" | "error">("idle");

  async function watch() {
    setState("working");
    try {
      const res = await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", productId }) });
      const j = await res.json().catch(() => null);
      setState(!res.ok ? "error" : j?.status === "full" ? "full" : "done");
    } catch {
      setState("error");
    }
  }

  if (state === "done" || state === "full") {
    return (
      <div className="n-stack">
        <p role="status" className="n-note n-note-good"><span>
          {state === "full" ? "I am already watching a lot of things. Okay, we will wait." : "Okay. I will watch the price. I will tell you on the home screen if it changes."}
        </span></p>
        <Link href="/" className={btnPrimary}>See my money</Link>
      </div>
    );
  }
  return (
    <div className="n-stack n-gap-2">
      <button type="button" className={btnPrimary} onClick={watch} disabled={state === "working"}>
        {state === "working" ? "One moment…" : "Wait, and watch the price"}
      </button>
      {state === "error" && <p role="alert" className="n-t-lg n-ink-stop">I could not do that. Please try again.</p>}
    </div>
  );
}
