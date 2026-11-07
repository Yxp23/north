import { startTracking } from "@/lib/channel3";
import { getLedger } from "@/lib/ledger/server";
import { addAudit } from "@/lib/ledger/logic";
import { getStore } from "@/lib/store";
import { dismissNotice, startWatch, stopWatch } from "@/lib/watcher/state";

// The user's own choices about the Price Watcher: "Wait and watch the price", "Stop watching", and dismissing price news.
// None of this can buy anything. The browser sends only a product id or a notice id, never a price: the price
// the watch starts from is read from the store here.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const ledger = getLedger();
  const now = new Date();

  if (action === "start") {
    const productId = typeof body.productId === "string" ? body.productId : "";
    const product = productId.length > 0 && productId.length <= 80 ? await getStore().getProduct(productId) : null;
    if (!product) return Response.json({ error: "I could not find that product." }, { status: 404 });
    let status = "started" as "started" | "already" | "full";
    await ledger.update((d) => {
      status = startWatch(d, { id: product.id, name: product.name, imageUrl: product.imageUrl, priceCents: product.priceCents }, now);
      if (status === "started") addAudit(d, "watch_start", `Watching ${product.name}.`, now);
    });
    if (status !== "full" && process.env.CHANNEL3_API_KEY) await startTracking(product.id).catch(() => undefined); // best effort: a price history builds up
    return Response.json({ status, name: product.name });
  }

  if (action === "stop" && typeof body.productId === "string") {
    await ledger.update((d) => stopWatch(d, body.productId));
    return Response.json({ status: "stopped" });
  }

  if (action === "dismiss" && typeof body.id === "string") {
    let found = false;
    await ledger.update((d) => void (found = dismissNotice(d, body.id)));
    return Response.json({ status: found ? "dismissed" : "not_found" }, { status: found ? 200 : 404 });
  }

  return Response.json({ error: "Bad request" }, { status: 400 });
}
