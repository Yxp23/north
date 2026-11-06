"use client";
// "Is this deal real?" One decision per screen:
//   paste a link / type the ad / add a picture -> (one question if the price is missing) -> the verdict.
// The verdict and every price in it are written by code from store facts (see lib/dealcheck/verdict.ts).
// The AI only reads the ad and finds the product. The activity panel shows each step in plain words.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import type { StepEvent } from "@/lib/agents/loop";
import type { DealPayload } from "@/lib/agents/scam-checker/scam-checker";
import { formatMoney } from "@/lib/format";
import { readNdjson } from "@/lib/ndjson-client";

type Flagged = "yes" | "no_seller" | "not_saved" | "no";
type Verdict = Extract<DealPayload, { kind: "verdict" }>;
type Stage =
  | { name: "ask" }
  | { name: "thinking"; events: StepEvent[] }
  | { name: "price"; question: string; events: StepEvent[] }
  | { name: "verdict"; payload: Verdict; flagged: Flagged; events: StepEvent[] }
  | { name: "error"; message: string; events: StepEvent[] };

const h1 = "text-3xl font-bold outline-none";
const field = "min-h-14 w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg";

const LOOK: Record<Verdict["verdict"]["kind"], { icon: string; label: string; box: string }> = {
  fine: { icon: "✓", label: "Looks fine", box: "bg-good-bg text-good-ink" },
  careful: { icon: "⚠", label: "Be careful", box: "bg-warn-bg text-warn-ink" },
  scam: { icon: "✋", label: "Looks like a scam", box: "bg-bad-bg text-bad-ink" },
};

/** Make a picture small before it leaves the phone: at most 1568 pixels wide, as a JPEG. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).replace(/^data:image\/jpeg;base64,/, "");
}

export function CheckDeal({ prefill }: { prefill: string }) {
  const [stage, setStage] = useState<Stage>({ name: "ask" });
  const [text, setText] = useState(prefill);
  const [price, setPrice] = useState("");
  const [picture, setPicture] = useState<{ name: string; base64: string } | null>(null);
  const [pictureError, setPictureError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [stage.name]);

  async function choosePicture(file: File | undefined) {
    setPictureError("");
    if (!file) return setPicture(null);
    try {
      setPicture({ name: file.name, base64: await shrink(file) });
    } catch {
      setPicture(null);
      setPictureError("I couldn't open that picture. Please try a different one.");
    }
  }

  async function check(priceText = price) {
    const events: StepEvent[] = [];
    const show = (s: Stage) => setStage(s);
    show({ name: "thinking", events: [] });
    const dollars = Number(priceText);
    try {
      const res = await fetch("/api/deal-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          imageBase64: picture?.base64,
          priceDollars: priceText.trim() && Number.isFinite(dollars) && dollars > 0 ? dollars : undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        return show({ name: "error", message: j?.error ?? "Something went wrong. Please try again.", events });
      }
      let payload: DealPayload | null = null;
      let flagged: Flagged = "no";
      await readNdjson(res, (line) => {
        if (line.type === "step") {
          events.push({ label: String(line.label), state: line.state as StepEvent["state"], detail: line.detail as string | undefined, warn: line.warn as boolean | undefined });
          show({ name: "thinking", events: [...events] });
        } else if (line.type === "result") {
          payload = line.payload as DealPayload;
          flagged = (line.flagged as Flagged | undefined) ?? "no";
        }
      });
      const p = payload as DealPayload | null;
      if (!p) show({ name: "error", message: "Something went wrong. Please try again.", events });
      else if (p.kind === "error") show({ name: "error", message: p.message, events });
      else if (p.kind === "needs_price") show({ name: "price", question: p.question, events });
      else show({ name: "verdict", payload: p, flagged, events });
    } catch {
      show({ name: "error", message: "Something went wrong. Please try again.", events });
    }
  }

  function startOver() {
    setText("");
    setPrice("");
    setPicture(null);
    setStage({ name: "ask" });
  }

  switch (stage.name) {
    case "ask":
      return (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() || picture) check();
          }}
        >
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Is this deal real?</h1>
          <p className="text-xl">Found a deal? I will check it for you. I will not buy anything.</p>
          <label className="block space-y-2">
            <span className="block text-xl font-semibold">Paste a link, or type what the ad says</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className={field} placeholder="70% off sneakers, $27" />
          </label>
          <div className="space-y-2">
            <label htmlFor="ad-picture" className="block text-xl font-semibold">Or add a picture of the ad</label>
            <input id="ad-picture" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => choosePicture(e.target.files?.[0])} className="block min-h-14 w-full text-lg" />
            {picture && <p className="text-lg">Picture added: {picture.name}</p>}
            {pictureError && <p role="alert" className="text-lg text-bad-ink">{pictureError}</p>}
          </div>
          <label className="block space-y-2">
            <span className="block text-xl font-semibold">What price does the ad say? (if you know)</span>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={field} placeholder="27" />
          </label>
          <button type="submit" className={btnPrimary} disabled={!text.trim() && !picture}>Check this deal</button>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </form>
      );

    case "thinking":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Checking the deal</h1>
          <p role="status" className="text-xl">This takes a few seconds.</p>
          <ActivityPanel events={stage.events} />
        </div>
      );

    case "price":
      return (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (Number(price) > 0) check(price); }}>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>{stage.question}</h1>
          <p className="text-xl">I couldn&apos;t find a price in the ad. Type it here and I will check again.</p>
          <label className="block space-y-2">
            <span className="block text-lg font-semibold">Price in dollars</span>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
          </label>
          <ActivityPanel events={stage.events} />
          <button type="submit" className={btnPrimary} disabled={!(Number(price) > 0)}>Check again</button>
          <button type="button" className={btnSecondary} onClick={startOver}>Start over</button>
        </form>
      );

    case "error":
      return (
        <div className="space-y-4">
          <h1 ref={headingRef} tabIndex={-1} className={h1}>I couldn&apos;t check that</h1>
          <p role="alert" className="text-xl">{stage.message}</p>
          <button type="button" className={btnPrimary} onClick={() => setStage({ name: "ask" })}>Try again</button>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </div>
      );

    case "verdict": {
      const { payload, flagged } = stage;
      const look = LOOK[payload.verdict.kind];
      const [main, ...rest] = payload.verdict.reasons;
      return (
        <div className="space-y-4">
          <div className={`rounded-3xl p-5 ${look.box}`}>
            <p aria-hidden="true" className="text-4xl">{look.icon}</p>
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold outline-none">{payload.verdict.headline}</h1>
            <p className="mt-2 text-xl">{main}</p>
          </div>
          {rest.length > 0 && (
            <ul className="list-disc space-y-1 pl-6 text-lg">
              {rest.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {flagged === "yes" && payload.sellerDomain && (
            <p role="status" className="rounded-xl border-2 border-bad-ink bg-bad-bg p-3 text-lg font-semibold text-bad-ink">
              I will not let you pay {payload.sellerDomain}. The Money Guardian will say no.
            </p>
          )}
          {flagged === "no_seller" && <p role="status" className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">I don&apos;t know who the seller is, so I couldn&apos;t block them.</p>}
          {flagged === "not_saved" && <p role="alert" className="rounded-xl bg-warn-bg p-3 text-lg text-warn-ink">I couldn&apos;t save a warning about this seller. Please be careful.</p>}
          <section aria-label="What I looked at" className={`${card} space-y-2`}>
            <h2 className="text-lg font-semibold text-muted">What I looked at</h2>
            <ul className="space-y-1 text-lg">
              {payload.productTitle && <li>Product: {payload.productTitle}</li>}
              {payload.verdict.evidence.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </section>
          {payload.claimSource === "picture" && (
            <p className="text-lg">I read the price from your picture: {formatMoney(payload.claimedCents)}. If that is wrong, type the price and check again.</p>
          )}
          <ActivityPanel events={stage.events} />
          {payload.claimSource === "picture" && <button type="button" className={btnSecondary} onClick={() => setStage({ name: "ask" })}>Type the price myself</button>}
          <button type="button" className={btnPrimary} onClick={startOver}>Check another deal</button>
          <Link href="/shop" className={btnSecondary}>Back to the shop</Link>
        </div>
      );
    }
  }
}
