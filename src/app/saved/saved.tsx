"use client";
// Saved: what you are waiting on (the waiting list), what the Price Watcher is watching, and price news. Nothing here can buy.
import { Eye } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { btnPrimary, card } from "@/components/classes";
import { Empty, ErrorNote, Loading } from "@/components/states";
import type { PriceNotice, WaitingView } from "@/lib/ledger/types";
import { NoticeRow, RemovedRow, useSummary, WaitingRow } from "../summary-parts";

export function SavedPage() {
  const { data, error, load } = useSummary();
  // Items taken off the list stay here, with Undo, until the person leaves the screen.
  const [removed, setRemoved] = useState<WaitingView[]>([]);

  const page = (body: React.ReactNode) => (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Saved</div>
        <h1>Come back<br />when you&apos;re ready.</h1>
        <p>Your saved items stay here.</p>
      </div>
      {body}
    </div>
  );

  if (!data) return page(error ? <ErrorNote what="your saved items" onRetry={load} /> : <Loading what="your saved items" />);

  const shown = data.waitingList.filter((w) => !removed.some((r) => r.id === w.id));
  const notices: PriceNotice[] = data.priceNotices;

  return page(
    <>
      <section aria-labelledby="waiting-h" className="n-stack">
        <h2 id="waiting-h">Waiting list</h2>
        {shown.length === 0 && removed.length === 0 ? (
          <Empty action={<Link href="/shop" className={`${btnPrimary} n-btn-auto`}>Go to the shop</Link>}>
            Nothing is saved yet. When you wait on something, it shows here, and I will remind you.
          </Empty>
        ) : (
          <ul className="n-stack">
            {shown.map((w) => <WaitingRow key={w.id} w={w} onRemove={(x) => { setRemoved((r) => [...r, x]); load(); }} />)}
            {removed.map((w) => <RemovedRow key={w.id} w={w} onUndone={(x) => { setRemoved((r) => r.filter((y) => y.id !== x.id)); load(); }} />)}
          </ul>
        )}
      </section>

      <section aria-labelledby="news-h" className="n-stack">
        <h2 id="news-h">Price news</h2>
        {notices.length === 0 ? (
          <p className="n-note n-note-quiet"><span>No news about prices right now.</span></p>
        ) : (
          <ul className="n-stack" aria-live="polite">{notices.map((n) => <NoticeRow key={n.id} n={n} onChange={load} />)}</ul>
        )}
        {data.watching.length > 0 && (
          <div className={`${card} n-stack`}>
            <p className="n-chip n-chip-quiet" style={{ justifySelf: "start" }}><Eye aria-hidden="true" />I am watching the price of</p>
            <ul className="n-stack" style={{ gap: 8 }}>
              {data.watching.map((w) => <li key={w.productId}><Link href={`/shop/${w.productId}`} className="n-link">{w.name}</Link></li>)}
            </ul>
          </div>
        )}
      </section>
    </>,
  );
}
