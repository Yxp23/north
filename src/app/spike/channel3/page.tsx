"use client";
// Day-1 spike: Channel3 text search, photo search, start price tracking, read price history.
// Throwaway test page. Prices come straight from the API values.
import { useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Product = {
  id: string;
  title: string;
  brands?: any[];
  images?: { url: string; is_main_image?: boolean }[];
  offers?: { domain: string; price: { price: number; currency: string } }[];
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return { status: res.status, json: await res.json() };
}

export default function Channel3Spike() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  async function runSearch(body: object) {
    setBusy(true);
    setMessage("Searching...");
    const r = await api("/api/channel3/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.json.error) return setMessage(`Error (HTTP ${r.status}): ${r.json.error}`);
    setProducts(r.json.products ?? []);
    setMessage(`${r.json.products?.length ?? 0} results`);
  }

  function onPhoto(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    // The server strips the "data:...;base64," prefix.
    reader.onload = () => runSearch({ image: reader.result });
    reader.readAsDataURL(file);
  }

  async function track(ids: string[]) {
    const r = await api("/api/channel3/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setMessage(`Tracking started:\n${JSON.stringify(r.json, null, 2)}`);
  }

  async function loadHistory(id: string) {
    const r = await api(`/api/channel3/history?id=${encodeURIComponent(id)}`);
    setHistory((h) => ({ ...h, [id]: r.json }));
  }

  const btn = "rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-40";

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Channel3 spike</h1>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) runSearch({ query });
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border px-3 py-2 text-black"
          placeholder="Text search, e.g. dish soap"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search text"
        />
        <button className={btn} disabled={busy}>Search</button>
      </form>
      <label className="block">
        Or search by photo:{" "}
        <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>

      {products.length > 0 && (
        <button className={btn} onClick={() => track(products.map((p) => p.id))}>
          Track all {products.length} results
        </button>
      )}
      <pre className="whitespace-pre-wrap text-sm">{message}</pre>

      <ul className="space-y-4">
        {products.map((p) => {
          const img = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
          return (
            <li key={p.id} className="flex gap-4 rounded border p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img && <img src={img.url} alt={p.title} className="h-24 w-24 object-cover" />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-semibold">{p.title}</div>
                <div className="text-sm text-zinc-500">id: {p.id}</div>
                {p.offers?.slice(0, 3).map((o, i) => (
                  <div key={i} className="text-sm">
                    {o.domain}: {o.price.price} {o.price.currency}
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button className={btn} onClick={() => track([p.id])}>Track price</button>
                  <button className={btn} onClick={() => loadHistory(p.id)}>30-day history</button>
                </div>
                {history[p.id] && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-2 text-xs text-black">
                    {history[p.id].error
                      ? history[p.id].error
                      : `Status: ${history[p.id].statistics?.current_status}\n` +
                        JSON.stringify(history[p.id].statistics, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
