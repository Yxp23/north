"use client";
// "Connected assistants" (My money > Assistants): connect an outside AI assistant (it gets its own key, shown once), say what it may do
// on its own, disconnect it, and see what it asked for. The assistant can only ASK. North's Money Guardian answers,
// and the person's Yes is needed unless they allowed more (that takes a day).
import { useCallback, useEffect, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import { formatMoney } from "@/lib/format";
import type { AssistantsView } from "@/lib/checkpoint/views";

type View = AssistantsView & { mcpUrl: string };
const field = "n-field";
const STATUS: Record<string, string> = { pending: "Waiting for you", bought: "Bought", declined: "You said no", refused: "North said no", saved_for_later: "Saved for later", failed: "Did not go through", expired: "Not answered" };
const day = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export function Assistants() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; key: string; mcpUrl: string } | null>(null);
  const [message, setMessage] = useState("");
  const [dollars, setDollars] = useState("15");
  const [choice, setChoice] = useState<"ask" | "under">("ask");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [mayBuy, setMayBuy] = useState(true);
  const [maySeeRules, setMaySeeRules] = useState(true);
  const [maySeeMoney, setMaySeeMoney] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agents", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setView(await r.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function post(body: unknown) {
    const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: await r.json().catch(() => null) };
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const scopes = [...(mayBuy ? ["request_purchase"] : []), ...(maySeeRules ? ["read_rules"] : []), ...(maySeeMoney ? ["read_week_money"] : [])];
    const r = await post({ action: "connect", name, scopes });
    if (!r.ok) return setMessage(r.json?.error ?? "I could not connect it. Please try again.");
    setCreated({ name: r.json.name, key: r.json.key, mcpUrl: r.json.mcpUrl });
    setName("");
    load();
  }

  async function disconnect(id: string) {
    await post({ action: "revoke", id });
    setConfirming(null);
    setCreated(null);
    load();
  }

  async function savePermission(underDollars: number | null) {
    setMessage("");
    const r = await post({ action: "permission", underDollars });
    setMessage(r.json?.message ?? "I could not save that. Please try again.");
    load();
  }

  if (error) return <p role="status" className="text-lg">I can&apos;t load your assistants right now.</p>;
  if (!view) return <p role="status" className="text-lg">Loading your assistants…</p>;

  const connected = view.agents.length > 0;
  return (
    <section aria-labelledby="assistants-h" className="n-stack">
      <h2 id="assistants-h" className={connected ? undefined : "ng-vh"}>{connected ? "Connected assistants" : "Connect an assistant"}</h2>

      {created && (
        <div role="status" className="space-y-2 rounded-2xl border-2 border-good-ink bg-good-bg p-4 text-good-ink">
          <p className="text-xl font-semibold">{created.name} is connected.</p>
          <p className="text-lg">Copy these now. You will not see the key again.</p>
          <p className="text-base font-semibold">North address</p>
          <code className="block break-all rounded-lg bg-card p-2 text-base text-ink" style={{ border: "1px solid var(--n-line)" }}>{created.mcpUrl}</code>
          <p className="text-base font-semibold">Its key</p>
          <code className="block break-all rounded-lg bg-card p-2 text-base text-ink" style={{ border: "1px solid var(--n-line)" }}>{created.key}</code>
          <button type="button" className={btnSecondary} onClick={() => navigator.clipboard?.writeText(created.key)}>Copy the key</button>
        </div>
      )}

      {connected && (
        <>
      {view.agents.length === 0 ? (
        <p className="text-lg">No assistant is connected.</p>
      ) : (
        <ul className="space-y-3">
          {view.agents.map((a) => (
            <li key={a.id} className={`${card} space-y-2`}>
              <p className="text-xl font-semibold">{a.name}</p>
              <p className="text-base">Connected {day(a.createdAt)}.{a.lastUsedAt ? ` Last asked ${day(a.lastUsedAt)}.` : " It has not asked yet."}</p>
              <p className="text-base">It may: {[a.scopes.includes("request_purchase") && "ask to buy things", a.scopes.includes("read_rules") && "see your rules", a.scopes.includes("read_week_money") && "see what is left this week"].filter(Boolean).join(", ") || "nothing"}.</p>
              {confirming === a.id ? (
                <div role="group" aria-label={`Disconnect ${a.name}?`} className="space-y-2">
                  <p className="text-lg font-semibold">Disconnect {a.name}? Its key stops working right now.</p>
                  <button type="button" className={btnPrimary} onClick={() => disconnect(a.id)}>Yes, disconnect it</button>
                  <button type="button" className={btnSecondary} onClick={() => setConfirming(null)}>No, keep it</button>
                </div>
              ) : (
                <button type="button" className={btnSecondary} onClick={() => setConfirming(a.id)}>Disconnect</button>
              )}
            </li>
          ))}
        </ul>
      )}

        </>
      )}
      {!connected && <p className="n-note n-note-quiet"><span>No assistant is connected yet. Connect one first. Then you can choose what it may do on its own.</span></p>}
      <form onSubmit={connect} className={`${card} n-stack`}>
        <h3>{connected ? "Connect another assistant" : "Connect an assistant"}</h3>
        <label className="block space-y-2">
          <span className="block text-lg font-semibold">What do you call it?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={field} placeholder="My assistant" />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-lg font-semibold">What may it do?</legend>
          <label className="flex min-h-12 items-center gap-3 text-lg"><input type="checkbox" className="h-6 w-6" checked={mayBuy} onChange={(e) => setMayBuy(e.target.checked)} /> Ask to buy things (you still decide)</label>
          <label className="flex min-h-12 items-center gap-3 text-lg"><input type="checkbox" className="h-6 w-6" checked={maySeeRules} onChange={(e) => setMaySeeRules(e.target.checked)} /> See my rules</label>
          <label className="flex min-h-12 items-center gap-3 text-lg"><input type="checkbox" className="h-6 w-6" checked={maySeeMoney} onChange={(e) => setMaySeeMoney(e.target.checked)} /> See what is left this week</label>
        </fieldset>
        <button type="submit" className={btnPrimary} disabled={!name.trim() || !(mayBuy || maySeeRules || maySeeMoney)}>Connect it</button>
      </form>

      {connected && (
        <div className={`${card} n-stack`}>
          <h3>What may an assistant do on its own?</h3>
          <p>{view.permission.words}</p>
          {view.permission.pending && (
            <p className="n-note n-note-wait">A change is waiting. It starts {day(view.permission.pending.startsAt)}. Until then, the setting above stays.</p>
          )}
          <fieldset className="n-stack" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
            <legend className="ng-vh">Choose one</legend>
            <label className="n-checkrow">
              <input type="radio" name="perm" checked={choice === "ask"} onChange={() => setChoice("ask")} />
              <span>Ask me every time</span>
            </label>
            <label className="n-checkrow">
              <input type="radio" name="perm" checked={choice === "under"} onChange={() => setChoice("under")} />
              <span>Let it buy must-have things under a limit, without asking</span>
            </label>
            {choice === "under" && (
              <label className="block" style={{ marginLeft: 36 }}>
                <span className="n-label">The limit (dollars). It starts in one day.</span>
                <input type="number" inputMode="decimal" min={1} max={100} step="1" value={dollars} onChange={(e) => setDollars(e.target.value)} className={field} />
              </label>
            )}
          </fieldset>
          <button type="button" className={btnSecondary} disabled={choice === "under" && !(Number(dollars) >= 1)} onClick={() => savePermission(choice === "under" ? Number(dollars) : null)}>Save my choice</button>
          {message && <p role="status" className="text-lg font-semibold">{message}</p>}
        </div>
      )}

      {view.requests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">What my assistants asked for</h3>
          <ul className="space-y-3">
            {view.requests.map((r) => (
              <li key={r.id} className={`${card} space-y-2`}>
                <p className="text-lg font-semibold">{r.agentName} asked to buy {r.name}, {formatMoney(r.amountCents)}</p>
                <p className="text-base">{STATUS[r.status] ?? r.status} · {day(r.createdAt)}</p>
                <ActivityPanel title="What happened" events={r.steps.map((s) => ({ ...s, state: "done" as const }))} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
