"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "My money" },
  { href: "/shop", label: "Shop" },
  { href: "/check", label: "Check a deal" },
  { href: "/rules", label: "My rules" },
];

export function SiteNav() {
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  const onLogin = path === "/login";

  async function logOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    // A full page load on purpose: after logging out, nothing from the old session should stay on the page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <nav aria-label="Main" className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-1 px-3 py-1">
      <Link href="/" className="rounded-lg px-2 py-2 text-2xl font-bold">North</Link>
      {!onLogin && (
        <div className="flex flex-wrap text-base font-semibold">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-2.5 py-3">{l.label}</Link>
          ))}
          <button type="button" onClick={logOut} disabled={busy} className="whitespace-nowrap rounded-lg px-2.5 py-3 font-semibold">Log out</button>
        </div>
      )}
    </nav>
  );
}
