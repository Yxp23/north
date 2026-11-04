// Manage PayPal sandbox webhooks for the app. PayPal can't reach localhost, so give it a tunnel URL.
//   node --env-file=.env.local scripts/webhook.mjs list
//   node --env-file=.env.local scripts/webhook.mjs register https://<tunnel>.trycloudflare.com
//   node --env-file=.env.local scripts/webhook.mjs delete <webhook id>
// `register` prints the webhook id. Put it in .env.local as PAYPAL_WEBHOOK_ID and restart the app.
const BASE = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

async function token() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`auth failed: ${r.status}`);
  return (await r.json()).access_token;
}

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "list") {
  const r = await api("GET", "/v1/notifications/webhooks");
  for (const w of r.body.webhooks ?? []) console.log(w.id, w.url, w.event_types.map((e) => e.name).join(","));
  if (!r.body.webhooks?.length) console.log("(no webhooks)");
} else if (cmd === "register") {
  if (!arg?.startsWith("https://")) throw new Error("Give an https URL, like https://abc.trycloudflare.com");
  const url = `${arg.replace(/\/$/, "")}/api/paypal/webhook`;
  const r = await api("POST", "/v1/notifications/webhooks", {
    url,
    event_types: [{ name: "PAYMENT.CAPTURE.COMPLETED" }, { name: "PAYMENT.CAPTURE.REFUNDED" }],
  });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  console.log(`Registered ${url}\nPAYPAL_WEBHOOK_ID=${r.body.id}`);
} else if (cmd === "delete") {
  const r = await api("DELETE", `/v1/notifications/webhooks/${arg}`);
  console.log(r.status === 204 ? "Deleted." : `Failed: ${r.status} ${JSON.stringify(r.body)}`);
} else {
  console.log("Usage: webhook.mjs list | register <https url> | delete <id>");
}
