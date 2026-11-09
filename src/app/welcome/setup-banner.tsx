"use client";
// A gentle prompt on Home for someone who has not set North up yet. It can be dismissed (Skip) and found again in Money.
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readSetup, subscribeSetup } from "./progress";

export function SetupBanner({ newUser }: { newUser: boolean }) {
  const state = useSyncExternalStore(subscribeSetup, () => readSetup().state, () => "done");
  if (!newUser || state === "done" || state === "skipped") return null;
  return (
    <div className="n-note n-note-quiet" role="note">
      <Sparkles aria-hidden="true" />
      <div className="n-stack" style={{ gap: 10 }}>
        <p><strong>Let&apos;s set North up.</strong> It takes three short steps, and you can skip any of them.</p>
        <Link href="/welcome" className="n-btn n-btn-secondary n-btn-auto">{state === "started" ? "Keep going" : "Start setup"}</Link>
      </div>
    </div>
  );
}
