"use client";
import { useState } from "react";

export function LoginForm({ practice }: { practice: { email: string; password: string } | null }) {
  const [email, setEmail] = useState(practice?.email ?? "");
  const [password, setPassword] = useState(practice?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next");
        // Only go to a page on this site.
        window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
        return;
      }
      setError(typeof json.error === "string" ? json.error : "I could not log you in. Please try again.");
    } catch {
      setError("I could not reach North. Please check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="n-stack" noValidate>
      <div>
        <label htmlFor="email" className="n-label">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="n-field" />
      </div>
      <div>
        <label htmlFor="password" className="n-label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="n-field" />
      </div>
      {error && <p role="alert" className="n-note n-note-stop">{error}</p>}
      <button type="submit" disabled={busy} className="n-btn n-btn-primary">
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
