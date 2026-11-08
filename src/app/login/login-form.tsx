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
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-lg font-semibold">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-3 text-lg" />
      </div>
      <div>
        <label htmlFor="password" className="block text-lg font-semibold">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-3 text-lg" />
      </div>
      {error && <p role="alert" className="rounded-xl border border-line bg-card px-4 py-3 text-lg font-semibold">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-accent px-4 py-4 text-xl font-bold text-accent-ink disabled:opacity-60">
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
