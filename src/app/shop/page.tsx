import { ScanSearch, Search, Sparkles, Camera } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { card } from "@/components/classes";
import { formatMoney } from "@/lib/format";
import { getStore } from "@/lib/store";

export const metadata = { title: "Shop" };

// The live store's prices change, so the list is made when it is asked for, never ahead of time.
async function Products() {
  await connection();
  const products = await getStore().listProducts();
  return (
    <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/shop/${p.id}`} className={`${card} flex h-full flex-col items-center gap-3 text-center`} style={{ textDecoration: "none", color: "inherit" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imageUrl} alt="" className="h-40 w-full rounded-xl bg-white object-contain" />
            <span className="text-lg">{p.name}</span>
            <span className="text-2xl" style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(p.priceCents)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const ACTIONS = [
  { href: "/choose", Icon: Sparkles, title: "Help me choose", text: "Tell me what you need. I give you 3 that fit your money.", primary: true },
  { href: "/find", Icon: Search, title: "Find something", text: "Type words or add a picture." },
  { href: "/reorder", Icon: Camera, title: "Buy this again", text: "Take a picture of the empty one." },
  { href: "/check", Icon: ScanSearch, title: "Is this deal real?", text: "Check a link or an ad before you pay." },
];

export default function Shop() {
  return (
    <div className="n-stack" style={{ gap: 30 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Shop</div>
        <h1>Find what<br />you need.</h1>
        <p>You can browse without paying.</p>
      </div>
      <ul className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {ACTIONS.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className={a.primary ? "n-btn n-btn-primary" : `${card} block`}
              style={{ textDecoration: "none", color: a.primary ? undefined : "inherit", display: "grid", gap: 6, justifyItems: "start", textAlign: "left", height: "100%", borderRadius: 23, padding: 21 }}
            >
              <a.Icon aria-hidden="true" size={26} strokeWidth={1.5} />
              <span style={{ fontSize: 19, fontWeight: 500 }}>{a.title}</span>
              <span style={{ opacity: a.primary ? 0.95 : 1, color: a.primary ? undefined : "var(--n-muted)", fontWeight: 400 }}>{a.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="pick-h" className="n-stack">
        <h2 id="pick-h">Or pick one thing to look at</h2>
        <Suspense fallback={<p role="status" className="n-note n-note-quiet">Getting the shop. One moment.</p>}>
          <Products />
        </Suspense>
      </section>
    </div>
  );
}
