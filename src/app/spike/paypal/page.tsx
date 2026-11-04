"use client";
// Day-1 spike: save PayPal on the first purchase, charge again with no popup, refund.
// Throwaway test page. Raw API responses are shown on purpose so we can see what PayPal really returns.
import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    paypal?: any;
  }
}

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}

export default function PayPalSpike() {
  const [sdkReady, setSdkReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const sessionRef = useRef<any>(null);

  const addLog = useCallback((title: string, data?: unknown) => {
    const stamp = new Date().toLocaleTimeString();
    setLog((l) => [`[${stamp}] ${title}${data ? "\n" + JSON.stringify(data, null, 2) : ""}`, ...l]);
  }, []);

  const refreshSaved = useCallback(async () => {
    const res = await fetch("/api/paypal/status");
    setSaved((await res.json()).saved);
  }, []);

  useEffect(() => {
    fetch("/api/paypal/status")
      .then((r) => r.json())
      .then((j) => setSaved(j.saved));

    // Load the PayPal JS SDK v6 (not v5) and create the SDK instance.
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) return; // the page shows a warning for this
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = async () => {
      try {
        const sdk = await window.paypal.createInstance({
          clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
        });
        sessionRef.current = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }: { orderId: string }) => {
            addLog(`Approved in popup. Order ${orderId}. Capturing...`);
            const r = await post("/api/paypal/capture-order", { orderId });
            addLog(`Capture result (HTTP ${r.status})`, r.json);
            if (r.json.captureId) setCaptureId(r.json.captureId);
            refreshSaved();
          },
          onCancel: () => addLog("Popup cancelled"),
          onError: (err: unknown) => addLog("Popup error", String(err)),
        });
        setSdkReady(true);
      } catch (e) {
        addLog("SDK setup failed", String(e));
      }
    };
    script.onerror = () => addLog("Could not load the PayPal SDK script");
    document.body.appendChild(script);
    return () => script.remove();
  }, [addLog, refreshSaved]);

  // IMPORTANT: no `await` before session.start, or the browser blocks the popup.
  function firstPurchase() {
    const createOrderPromise = fetch("/api/paypal/create-order", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        addLog("Order created", j.raw);
        if (!j.orderId) throw new Error("no orderId");
        return { orderId: j.orderId as string };
      });
    sessionRef.current.start({ presentationMode: "auto" }, createOrderPromise);
  }

  async function chargeSaved() {
    addLog("Charging saved PayPal (no popup)...");
    const r = await post("/api/paypal/charge-saved");
    addLog(`Saved-account charge (HTTP ${r.status})`, r.json);
    if (r.json.captureId) setCaptureId(r.json.captureId);
  }

  async function refund() {
    if (!captureId) return;
    const r = await post("/api/paypal/refund", { captureId });
    addLog(`Refund of ${captureId} (HTTP ${r.status})`, r.json);
  }

  async function forget() {
    await fetch("/api/paypal/status", { method: "DELETE" });
    setCaptureId(null);
    refreshSaved();
    addLog("Forgot the saved account locally");
  }

  const btn = "rounded-lg bg-blue-700 px-5 py-3 text-white disabled:opacity-40";

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">PayPal spike (sandbox)</h1>
      {!process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID && (
        <p role="alert" className="rounded bg-red-100 p-3 text-red-900">
          NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set in .env.local (restart the dev server after adding it).
        </p>
      )}
      <p>
        Saved PayPal: <strong>{saved ? "yes" : "no"}</strong> · Last capture:{" "}
        <code>{captureId ?? "none"}</code>
      </p>
      <div className="flex flex-wrap gap-3">
        <button className={btn} disabled={!sdkReady} onClick={firstPurchase}>
          1. First purchase $5.00 (popup, saves PayPal)
        </button>
        <button className={btn} disabled={!saved} onClick={chargeSaved}>
          2. Buy again $5.00 (no popup)
        </button>
        <button className={btn} disabled={!captureId} onClick={refund}>
          3. Refund last purchase
        </button>
        <button className="rounded-lg border px-5 py-3" onClick={forget}>
          Forget saved account
        </button>
      </div>
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-3 text-sm text-black">
        {log.length ? log.join("\n\n") : "Results show up here."}
      </pre>
    </main>
  );
}
