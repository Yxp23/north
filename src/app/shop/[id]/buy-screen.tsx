"use client";
// One decision per screen: look, Buy, then the Guardian's answer (paid / wait / refuse).
// The price on screen comes from the store. The reason text comes from the Guardian.
// Every action (buying, asking the helper) shows its steps in the activity panel, in plain words.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { StoreComparison } from "@/components/store-comparison";
import type { StepEvent } from "@/lib/agents/loop";
import { useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import { readNdjson } from "@/lib/ndjson-client";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";
import type { StoreProduct } from "@/lib/store";
import { streamCheckout, toStep } from "../checkout-client";
import { CheckoutResult } from "../checkout-result";

type HelperResult = {
  summary: string | null;
  hidden: { productName: string }[];
  judged: { plain: string; productName?: string; quantity: number; amountCents?: number; code?: string; reason?: string }[];
  error?: string;
};

type Screen =
  | { name: "ready" }
  | { name: "working"; events: StepEvent[] }
  | { name: "error" }
  | { name: "done"; outcome: CheckoutOutcome; events: StepEvent[] }
  | { name: "helper"; events: StepEvent[]; result?: HelperResult; pretend: boolean };

export function BuyScreen({ product, demoMode }: { product: StoreProduct; demoMode: boolean }) {
  const [screen, setScreen] = useState<Screen>({ name: "ready" });
  const demoHour = useDemoHour();
  const pretendHour = demoHour === "" ? null : Number(demoHour);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // After each step, move focus to the new heading so screen readers read it.
  const focusKey = screen.name === "helper" ? `helper-${screen.result ? "done" : "busy"}` : screen.name;
  useEffect(() => {
    headingRef.current?.focus();
  }, [focusKey]);

  async function buy(overrideWait: boolean) {
    setScreen({ name: "working", events: [] });
    try {
      // The price on screen goes along only so that a changed price STOPS the buy. The store sets the price.
      const { outcome, events } = await streamCheckout(
        { productId: product.id, seenCents: product.priceCents, overrideWait, pretendHour: pretendHour ?? undefined },
        (events) => setScreen({ name: "working", events }),
      );
      setScreen({ name: "done", outcome, events });
    } catch {
      setScreen({ name: "error" });
    }
  }

  async function askHelper(pretend: boolean) {
    const events: StepEvent[] = [];
    const show = (result?: HelperResult) => setScreen({ name: "helper", events: [...events], result, pretend });
    show();
    try {
      const res = await fetch("/api/concierge/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, pretendTricked: pretend }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        return show({ summary: null, hidden: [], judged: [], error: j?.error ?? "Something went wrong. Please try again." });
      }
      let result: HelperResult | null = null;
      await readNdjson(res, (line) => {
        if (line.type === "step") {
          events.push(toStep(line));
          show();
        } else if (line.type === "result") result = line.payload as HelperResult;
      });
      show(result ?? { summary: null, hidden: [], judged: [], error: "Something went wrong. Please try again." });
    } catch {
      show({ summary: null, hidden: [], judged: [], error: "Something went wrong. Please try again." });
    }
  }

  const h1 = "text-3xl font-bold outline-none";

  if (screen.name === "working") {
    return (
      <div className="space-y-4">
        <p role="status" className="text-2xl">Checking with the Money Guardian…</p>
        <ActivityPanel events={screen.events} />
      </div>
    );
  }

  if (screen.name === "helper") {
    const r = screen.result;
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>{r ? "What the helper found" : "The helper is looking"}</h1>
        {!r && <p role="status" className="text-xl">Looking at {product.name}…</p>}
        {r?.error && <p role="alert" className="text-xl">{r.error}</p>}
        {r && !r.error && (
          <>
            <div className={`${card} space-y-2`}>
              <p className="text-lg font-semibold">{product.name}</p>
              <p className="text-xl">{r.summary ?? "I could not write a short summary for this one."}</p>
              <p className="text-2xl font-bold">{formatMoney(product.priceCents)}</p>
            </div>
            {r.hidden.length > 0 && (
              <p role="alert" className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">
                <span aria-hidden="true">⚠ </span>I found hidden instructions in this listing. They are not from you, so I do not follow them.
              </p>
            )}
            {r.judged.map((j, i) => (
              <div key={i} role="alert" className="space-y-1 rounded-xl border-2 border-bad-ink bg-bad-bg p-4 text-bad-ink">
                <p className="text-xl font-semibold">I stopped a buy</p>
                <p className="text-lg">{j.plain}</p>
              </div>
            ))}
          </>
        )}
        <ActivityPanel events={screen.events} />
        {r && (
          <>
            {demoMode && (
              <button type="button" className={btnSecondary} onClick={() => askHelper(true)}>
                Demo: run it again, pretending the AI is tricked
              </button>
            )}
            <button type="button" className={btnPrimary} onClick={() => setScreen({ name: "ready" })}>Back</button>
          </>
        )}
      </div>
    );
  }

  if (screen.name === "error") {
    return (
      <div className="space-y-4">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>Something went wrong</h1>
        <p className="text-lg">Nothing was bought. Please try again.</p>
        <button type="button" className={btnPrimary} onClick={() => setScreen({ name: "ready" })}>Back</button>
      </div>
    );
  }

  if (screen.name === "done") {
    return (
      <CheckoutResult
        outcome={screen.outcome}
        events={screen.events}
        product={product}
        headingRef={headingRef}
        onBuyNow={() => buy(true)}
        onBack={() => setScreen({ name: "ready" })}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 ref={headingRef} tabIndex={-1} className={h1}>{product.name}</h1>
      {pretendHour !== null && (
        <p role="note" className="rounded-xl bg-warn-bg p-3 text-warn-ink">
          Demo clock: pretending it is {pretendHour % 12 === 0 ? 12 : pretendHour % 12}:00 {pretendHour >= 12 ? "PM" : "AM"}.
        </p>
      )}
      <div className={`${card} flex flex-col items-center gap-4`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt={product.name} className="h-64 w-full rounded-xl bg-white object-contain" />
        <p className="text-4xl font-bold">{formatMoney(product.priceCents)}</p>
      </div>
      <StoreComparison offers={product.offers} live={product.live} />
      <button type="button" className={btnPrimary} onClick={() => buy(false)}>Buy this</button>
      <button type="button" className={btnSecondary} onClick={() => askHelper(false)}>Ask the helper about this</button>
      <Link href={`/check?product=${encodeURIComponent(product.id)}`} className={btnSecondary}>Is this deal real?</Link>
      <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
    </div>
  );
}
