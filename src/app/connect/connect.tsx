"use client";
// Connect PayPal. This saves your PayPal for later. It does not buy anything and no money moves.
// PayPal SDK v6 "save without purchase": setup token -> popup -> permanent token (kept on the server).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/classes";

/* eslint-disable @typescript-eslint/no-explicit-any -- the PayPal SDK has no bundled types */
declare global {
  interface Window {
    paypal?: any;
  }
}

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

type State = "loading" | "ready" | "connecting" | "connected" | "cancelled" | "not_eligible" | "error";

function loadSdk(): Promise<void> {
  if (window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load PayPal"));
    document.body.appendChild(s);
  });
}

export function Connect({ embedded = false }: { embedded?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [session, setSession] = useState<any>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await (await fetch("/api/summary", { cache: "no-store" })).json();
        if (summary.paypalSaved && !cancelled) setState("connected");

        const { clientToken, error } = await (await fetch("/api/paypal/client-token")).json();
        if (error || !clientToken) throw new Error("no client token");
        await loadSdk();
        const sdk = await window.paypal.createInstance({ clientToken, components: ["paypal-payments"], pageType: "checkout" });

        const methods = await sdk.findEligibleMethods({ currencyCode: "USD", paymentFlow: "VAULT_WITHOUT_PAYMENT" });
        if (!methods.isEligible("paypal")) {
          if (!cancelled) setState((s) => (s === "connected" ? s : "not_eligible"));
          return;
        }

        const saveSession = sdk.createPayPalSavePaymentSession({
          async onApprove(data: { vaultSetupToken?: string; setupToken?: string }) {
            setState("connecting");
            const token = data.vaultSetupToken ?? data.setupToken;
            const res = await fetch("/api/paypal/vault/payment-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // receivedKeys: field NAMES only, so a failure can be diagnosed from the server log.
              body: JSON.stringify({ vaultSetupToken: token, receivedKeys: Object.keys(data ?? {}) }),
            });
            setState(res.ok ? "connected" : "error");
          },
          onCancel: () => setState("cancelled"),
          onError: () => setState("error"),
        });
        if (cancelled) return;
        setSession(saveSession);
        setState((s) => (s === "connected" ? s : "ready"));
      } catch {
        if (!cancelled) setState((s) => (s === "connected" ? s : "error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [state]);

  // IMPORTANT: no `await` before session.start, or the browser blocks the popup.
  function connect() {
    setState("connecting");
    const setupTokenPromise = fetch("/api/paypal/vault/setup-token", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.id) throw new Error("no setup token");
        return { setupToken: j.id as string };
      });
    Promise.resolve(session.start({ presentationMode: "auto" }, setupTokenPromise)).catch(() => setState("error"));
  }

  const h1 = "n-focus-target";

  if (state === "connected" && embedded) {
    return <p role="status" className="n-note n-note-good"><span><strong>PayPal is connected.</strong> No money was taken.</span></p>;
  }
  if (state === "connected") {
    return (
      <div className="n-col">
        <h1 ref={headingRef} tabIndex={-1} className={h1}>PayPal is connected</h1>
        <p className="n-t-xl">You can buy things now. No money was taken.</p>
        <Link href="/find" className={btnPrimary}>Find something</Link>
        <Link href="/money" className={btnSecondary}>See my money</Link>
      </div>
    );
  }

  return (
    <div className={embedded ? "n-stack" : "n-col"}>
      {embedded ? (
        <p>This saves your PayPal so you can buy things. It does not buy anything. No money moves.</p>
      ) : (
        <>
          <h1 ref={headingRef} tabIndex={-1} className={h1}>Connect PayPal</h1>
          <p className="n-t-xl">This saves your PayPal so you can buy things. It does not buy anything. No money moves.</p>
        </>
      )}

      {state === "loading" && <p role="status" className="n-t-lg">Getting PayPal ready…</p>}
      {state === "connecting" && <p role="status" className="n-t-lg">Working with PayPal…</p>}
      {state === "cancelled" && <p role="status" className="n-note n-note-wait"><span>You stopped. Nothing was saved.</span></p>}
      {state === "not_eligible" && (
        <p role="alert" className="n-note n-note-stop"><span>PayPal says this account can&apos;t be saved here.</span></p>
      )}
      {state === "error" && <p role="alert" className="n-note n-note-stop"><span>That did not work. Nothing was saved. Please try again.</span></p>}

      <button
        type="button"
        className={btnPrimary}
        onClick={connect}
        disabled={!session || state === "loading" || state === "connecting" || state === "not_eligible"}
      >
        Connect PayPal
      </button>
      {!embedded && <Link href="/money" className={btnSecondary}>Back to my money</Link>}
    </div>
  );
}
