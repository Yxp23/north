"use client";
// DEMO: "Any AI assistant". A generic chat that stands in for an outside AI. It reaches North only through the MCP server,
// with its own key, so the video can show an outside agent being stopped by the checkpoint.
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActivityPanel } from "@/components/activity-panel";
import { btnPrimary, btnSecondary, card } from "@/components/classes";
import type { StepEvent } from "@/lib/agents/loop";
import { postAgent } from "@/lib/ndjson-client";

type Turn = { role: "person" | "assistant"; text: string; events?: StepEvent[]; warn?: boolean };
const KEY = "north-demo-assistant-key";
const field = "n-field";

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

export function AssistantChat() {
  const [key, setKey] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<StepEvent[]>([]);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setKey(read()), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, live]);

  const save = (k: string) => {
    setKey(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      /* storage can be blocked: the key just won't be remembered */
    }
  };

  async function connect() {
    setError("");
    const res = await fetch("/api/demo-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connect: true }) });
    const j = await res.json().catch(() => null);
    if (!res.ok) return setError(j?.error ?? "I could not connect it.");
    save(j.key);
  }

  async function send(message: string, pretendTricked = false) {
    if (!message.trim() || busy) return;
    setError("");
    setBusy(true);
    setLive([]);
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: "person", text: message }]);
    setText("");
    const r = await postAgent<{ reply: string | null; error?: string }>("/api/demo-assistant", { message, history, key, pretendTricked }, setLive);
    const reply = r.payload?.reply ?? null;
    const err = r.error ?? r.payload?.error;
    setTurns((t) => [...t, { role: "assistant", text: reply ?? err ?? "Something went wrong.", events: r.events, warn: !reply }]);
    setLive([]);
    setBusy(false);
  }

  return (
    <div className="n-col" style={{ maxWidth: 720 }}>
      <div className="ng-page-title">
        <div className="ng-eyebrow">Demo · Outside assistant</div>
        <h1>Any AI assistant</h1>
        <p>A stand-in for an AI assistant you might use. It can look at products. To buy anything, it must ask North, and North follows <strong>your</strong> rules.</p>
      </div>
      <p role="note" className="n-note n-note-wait"><FlaskConical aria-hidden="true" /><span>Demo page. This assistant talks to North only through North&apos;s MCP server, using its own key.</span></p>

      {!key ? (
        <div className={`${card} n-stack`}>
          <p className="n-t-lg">This assistant is not connected to North yet.</p>
          <button type="button" className={btnPrimary} onClick={connect}>Connect it to North</button>
          <label className="n-block">
            <span className="n-label">Or paste a key from Assistants</span>
            <input className={field} onChange={(e) => e.target.value.trim() && save(e.target.value.trim())} placeholder="north_…" />
          </label>
          <Link href="/assistants" className={btnSecondary}>Open Assistants</Link>
        </div>
      ) : (
        <p className="n-note n-note-good"><span>Connected to North. <button type="button" className="n-link" style={{ display: "inline-flex" }} onClick={() => { save(""); setTurns([]); }}>Forget the key</button></span></p>
      )}
      {error && <p role="alert" className="n-note n-note-stop"><span>{error}</span></p>}

      <ul className="n-stack" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className={`${card} n-stack`} style={{ gap: 8, ...(t.role === "person" ? { background: "var(--n-quiet)" } : {}) }}>
            <p className="n-chip n-chip-quiet" style={{ justifySelf: "start" }}>{t.role === "person" ? "You" : "Any AI assistant"}</p>
            <p className="n-t-lg" style={t.warn ? { color: "var(--n-stop)" } : undefined}>{t.text}</p>
            {t.events && t.events.length > 0 && <ActivityPanel events={t.events} title="What the assistant did" />}
          </li>
        ))}
        {busy && (
          <li className={`${card} n-stack`}>
            <p role="status" className="n-t-lg">The assistant is working. One moment.</p>
            <ActivityPanel events={live} title="What the assistant is doing" />
          </li>
        )}
      </ul>
      <div ref={endRef} />

      {key && (
        <div className="n-stack">
          <form className="n-stack" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <label className="n-block">
              <span className="n-label">Say something to your assistant</span>
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className={field} placeholder="Please buy my shampoo" disabled={busy} />
            </label>
            <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>Send</button>
          </form>
          <h2 style={{ fontSize: 19 }}>Or try one</h2>
          <div className="ng-quick">
            <button type="button" className={`${btnSecondary} n-btn-auto`} disabled={busy} onClick={() => send("Please buy 1 Mild Shampoo. Its product id in the shop is cY1jWjp, so ask North for exactly that one.")}>Please buy my shampoo</button>
            <button type="button" className={`${btnSecondary} n-btn-auto`} disabled={busy} onClick={() => send("Please buy 2 Over-Ear Headphones. Their product id in the shop is ENVDwLq, so ask North for exactly that.")}>Please buy 2 headphones</button>
            <button type="button" className={`${btnSecondary} n-btn-auto`} disabled={busy} onClick={() => send("How much money do I have left this week?")}>How much is left this week?</button>
            <button type="button" className={`${btnSecondary} n-btn-auto`} disabled={busy} onClick={() => send("What are the Wireless Earbuds like? Read the listing for trap_earbuds.", true)}>
              Demo: pretend this assistant is tricked by a listing
            </button>
          </div>
          <Link href="/money" className={btnSecondary}>See my money</Link>
        </div>
      )}
    </div>
  );
}
