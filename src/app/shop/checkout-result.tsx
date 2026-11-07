"use client";
// What the Money Guardian said about a buy, one screen per answer. Used after tapping Buy on a product and after
// "Buy this again". The words about WHY come from the Guardian; the prices come from the store.
import Link from "next/link";
import type { Ref } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary } from "@/components/classes";
import { WatchButton } from "@/components/watch-button";
import type { StepEvent } from "@/lib/agents/loop";
import type { CheckoutOutcome } from "@/lib/checkout/checkout";
import { formatMoney } from "@/lib/format";

const h1 = "text-3xl font-bold outline-none";

export function CheckoutResult({
  outcome: o, events, product, headingRef, onBuyNow, onBack,
}: {
  outcome: CheckoutOutcome;
  events: StepEvent[];
  product: { id: string; name: string; imageUrl: string };
  headingRef: Ref<HTMLHeadingElement>;
  /** The user tapped "Buy now" on a wait screen. */
  onBuyNow: () => void;
  /** Back to where they were choosing. */
  onBack: () => void;
}) {
  const panel = <ActivityPanel events={events} title="What happened" />;
  switch (o.kind) {
    case "paid":
      // The picture receipt: the thing, what it cost, and what is still left this week.
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Done! You bought it.</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={product.name} className="h-48 w-full rounded-xl bg-white object-contain" />
          <p className="text-xl">{product.name} for {formatMoney(o.purchase.amountCents)}.</p>
          <p className="rounded-xl bg-good-bg p-3 text-xl font-semibold text-good-ink">You&apos;ll still have {formatMoney(o.leftCents)} this week.</p>
          {o.result && <p className="text-lg">{o.result.reason}</p>}
          {panel}
          <Link href="/" className={btnPrimary}>See my money</Link>
        </div>
      );
    case "price_changed":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>The price changed</h1>
          <p className="text-xl">It was {formatMoney(o.seenCents)}. Now it is {formatMoney(o.nowCents)}. I did not buy it.</p>
          {panel}
          <button type="button" className={btnPrimary} onClick={() => window.location.reload()}>Look again</button>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </div>
      );
    case "wait":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Wait a moment</h1>
          <p className="text-xl">{o.result.reason}</p>
          {panel}
          <button type="button" className={btnSecondary} onClick={onBuyNow}>Buy now</button>
          <WatchButton productId={product.id} />
        </div>
      );
    case "waitlisted":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Saved for later</h1>
          <p className="text-xl">{o.result.reason}</p>
          <p className="text-lg">I will also watch the price while you wait, and tell you on the home screen if it changes.</p>
          {panel}
          <Link href="/" className={btnPrimary}>See my money</Link>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </div>
      );
    case "refused":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>I can&apos;t buy this</h1>
          <p className="text-xl">{o.result.reason}</p>
          {panel}
          <Link href="/" className={btnPrimary}>See my money</Link>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </div>
      );
    case "needs_paypal":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Connect PayPal first</h1>
          <p className="text-xl">This is okay to buy, but PayPal is not connected yet.</p>
          {panel}
          <Link href="/connect" className={btnPrimary}>Connect PayPal</Link>
        </div>
      );
    case "failed":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>It did not go through</h1>
          <p className="text-xl">{o.message}</p>
          {panel}
          <button type="button" className={btnPrimary} onClick={onBack}>Back</button>
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
          <p className="text-xl">It may be sold out now.</p>
          <Link href="/shop" className={btnPrimary}>Back to the shop</Link>
        </div>
      );
  }
}
