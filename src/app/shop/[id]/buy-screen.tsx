"use client";
// One decision per screen: look, Buy, then the Guardian's answer (paid / wait / refuse).
// The price on screen comes from the store. The reason text comes from the Guardian.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { useDemoHour } from "@/lib/demo-hour";
import { formatMoney } from "@/lib/format";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";
import type { StoreProduct } from "@/lib/store";

type Screen =
  | { name: "ready" }
  | { name: "working" }
  | { name: "error" }
  | { name: "done"; outcome: CheckoutOutcome };

const newAttemptId = () => `a-${crypto.randomUUID()}`;

export function BuyScreen({ product }: { product: StoreProduct }) {
  const [screen, setScreen] = useState<Screen>({ name: "ready" });
  const demoHour = useDemoHour();
  const pretendHour = demoHour === "" ? null : Number(demoHour);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // After each step, move focus to the new heading so screen readers read it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

  async function buy(overrideWait: boolean) {
    setScreen({ name: "working" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A fresh attempt id for each tap. It is also PayPal's request id, so a retry can't charge twice.
        body: JSON.stringify({ productId: product.id, attemptId: newAttemptId(), overrideWait, pretendHour: pretendHour ?? undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setScreen({ name: "done", outcome: await res.json() });
    } catch {
      setScreen({ name: "error" });
    }
  }

  const h1 = "text-3xl font-bold outline-none";

  if (screen.name === "working") {
    return <p role="status" className="text-2xl">Checking with the Money Guardian…</p>;
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
    const o = screen.outcome;
    switch (o.kind) {
      case "paid":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>Done! You bought it.</h1>
            <p className="text-xl">{product.name} for {formatMoney(o.purchase.amountCents)}.</p>
            {o.result && <p className="text-lg">{o.result.reason}</p>}
            <Link href="/" className={btnPrimary}>See my money</Link>
          </div>
        );
      case "wait":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>Wait a moment</h1>
            <p className="text-xl">{o.result.reason}</p>
            <button type="button" className={btnSecondary} onClick={() => buy(true)}>Buy now</button>
            <Link href="/" className={btnPrimary}>Wait</Link>
          </div>
        );
      case "waitlisted":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>Saved for later</h1>
            <p className="text-xl">{o.result.reason}</p>
            <Link href="/" className={btnPrimary}>See my money</Link>
            <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
          </div>
        );
      case "refused":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>I can&apos;t buy this</h1>
            <p className="text-xl">{o.result.reason}</p>
            <Link href="/" className={btnPrimary}>See my money</Link>
            <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
          </div>
        );
      case "needs_paypal":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>Connect PayPal first</h1>
            <p className="text-xl">This is okay to buy, but PayPal is not connected yet.</p>
            <Link href="/spike/paypal" className={btnPrimary}>Connect PayPal</Link>
          </div>
        );
      case "failed":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>It did not go through</h1>
            <p className="text-xl">{o.message}</p>
            <button type="button" className={btnPrimary} onClick={() => setScreen({ name: "ready" })}>Back</button>
          </div>
        );
      case "in_progress":
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>Almost done</h1>
            <p className="text-xl">Your buy is still going. Check My money in a moment.</p>
            <Link href="/" className={btnPrimary}>See my money</Link>
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className={h1}>I could not find that</h1>
            <Link href="/shop" className={btnPrimary}>Back to the shop</Link>
          </div>
        );
    }
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
      <button type="button" className={btnPrimary} onClick={() => buy(false)}>Buy this</button>
      <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
    </div>
  );
}
