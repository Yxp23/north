// The PayPal Agent Toolkit (@paypal/agent-toolkit), used READ-ONLY: look up an order, list transactions.
//
// Why only reading: money moves in exactly one place, our guarded checkout (the Money Guardian decides, then the
// saved-account charge runs). The toolkit's create_order has no saved-account (vault) option, and its pay_order,
// refund and invoice tools would move money outside the Guardian, so they are never turned on:
//   1. the toolkit is built with only `orders.get` and `transactions.list` enabled, and
//   2. callToolkit refuses any other method before it reaches the toolkit.
// This is the ONLY file that imports the toolkit (checked by src/lib/payments-help/structure.test.ts).
import "server-only";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";

/** The only toolkit methods we will call. */
export const ALLOWED_METHODS = ["get_order", "list_transactions"] as const;
type Method = (typeof ALLOWED_METHODS)[number];

const ORDER_ID = /^[A-Z0-9]{17,32}$/; // the same shape the toolkit itself requires

/** What we turn on in the toolkit. Reading only. */
export const toolkitPermissions = () => ({ orders: { get: true }, transactions: { list: true } });

let toolkit: PayPalAgentToolkit | null = null;
function getToolkit(): PayPalAgentToolkit | null {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  toolkit ??= new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: toolkitPermissions(), context: { sandbox: (process.env.PAYPAL_ENV ?? "sandbox") !== "live" } },
  });
  return toolkit;
}

const failure = (status: number) => `{"ok":false,"status":${status}}`;

/** Calls one allowed toolkit method. `text` is what the toolkit returned (JSON as text). Never throws. */
export async function callToolkit(method: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  if (!(ALLOWED_METHODS as readonly string[]).includes(method)) return { ok: false, text: "That PayPal tool is not allowed here." };
  if ((method as Method) === "get_order" && !(typeof args.id === "string" && ORDER_ID.test(args.id))) return { ok: false, text: "That is not a PayPal order id." };
  const tk = getToolkit();
  if (!tk) return { ok: false, text: failure(503) };
  try {
    const r = await tk.handleToolCall({ id: `north-${method}`, type: "function", function: { name: method, arguments: JSON.stringify(args) } });
    return { ok: true, text: typeof r.content === "string" ? r.content : JSON.stringify(r.content) };
  } catch {
    return { ok: false, text: failure(500) }; // never pass on the error: it could hold a key
  }
}
