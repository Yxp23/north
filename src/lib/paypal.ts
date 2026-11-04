// Server-only PayPal helpers (REST). The client secret never leaves the server.
import "server-only";
import { randomUUID } from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any -- PayPal responses are logged raw and read loosely */

const BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export type PayPalResult = { ok: boolean; status: number; body: any };

// Cache the OAuth token until shortly before it expires.
let tokenCache: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${JSON.stringify(json)}`);
  tokenCache = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  requestId?: string,
): Promise<PayPalResult> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // Every POST gets a request id so a retry can never charge twice.
  if (method === "POST") headers["PayPal-Request-Id"] = requestId ?? randomUUID();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    // A string body is already JSON (used when the exact bytes matter, like webhook verification).
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  // Log the raw response: the saved-account flow is unconfirmed, so we need to see it.
  console.log(`[paypal] ${method} ${path} -> ${res.status}`, JSON.stringify(parsed));
  return { ok: res.ok, status: res.status, body: parsed };
}

const money = (amount: string) => ({ currency_code: "USD", value: amount });

/** First purchase: PayPal popup approval, and ask PayPal to save the account on success. */
export function createVaultOrder(amount: string, returnBase: string) {
  return call("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ amount: money(amount), description: "North spike purchase" }],
    payment_source: {
      paypal: {
        attributes: {
          vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", customer_type: "CONSUMER" },
        },
        experience_context: {
          return_url: `${returnBase}/spike/paypal?result=return`,
          cancel_url: `${returnBase}/spike/paypal?result=cancel`,
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      },
    },
  });
}

export const captureOrder = (orderId: string, requestId?: string) =>
  call("POST", `/v2/checkout/orders/${orderId}/capture`, {}, requestId);

export const getOrder = (orderId: string) => call("GET", `/v2/checkout/orders/${orderId}`);

/**
 * Later purchase with the saved account: no popup. Confirmed in sandbox: comes back COMPLETED.
 * This moves money, so only src/lib/checkout/gateway.ts may call it (a test enforces that),
 * and that file is only reached after a Guardian approval.
 */
export function createOrderWithVault(vaultId: string, amount: string, opts: { customId: string; requestId: string }) {
  return call(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: money(amount),
          description: "North purchase",
          custom_id: opts.customId, // comes back on the webhook, so we can match the payment
        },
      ],
      payment_source: { paypal: { vault_id: vaultId } },
    },
    opts.requestId,
  );
}

export const refundCapture = (captureId: string) =>
  call("POST", `/v2/payments/captures/${captureId}/refund`, {});

/**
 * Ask PayPal whether a webhook really came from PayPal.
 * Needs the raw body and the paypal-transmission-* headers. Anything but SUCCESS means reject.
 * The raw text is sent as-is, because PayPal checks the signature against the exact bytes.
 */
export async function verifyWebhookSignature(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set");
  const h = (name: string) => headers.get(name) ?? "";
  const body =
    `{"auth_algo":${JSON.stringify(h("paypal-auth-algo"))},"cert_url":${JSON.stringify(h("paypal-cert-url"))},` +
    `"transmission_id":${JSON.stringify(h("paypal-transmission-id"))},"transmission_sig":${JSON.stringify(h("paypal-transmission-sig"))},` +
    `"transmission_time":${JSON.stringify(h("paypal-transmission-time"))},"webhook_id":${JSON.stringify(webhookId)},` +
    `"webhook_event":${rawBody}}`;
  const r = await call("POST", "/v1/notifications/verify-webhook-signature", body);
  return r.ok && r.body?.verification_status === "SUCCESS";
}

/** Pull the saved-account token out of a capture or order response. */
export function extractVault(body: any): { vaultId?: string; customerId?: string; status?: string } {
  const vault = body?.payment_source?.paypal?.attributes?.vault;
  return { vaultId: vault?.id, customerId: vault?.customer?.id, status: vault?.status };
}

/** Pull the capture id out of a capture response (or a COMPLETED order). */
export function extractCaptureId(body: any): string | undefined {
  return body?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
}
export const SPIKE_AMOUNT = "5.00"; // fixed spike price; the browser never sets an amount
