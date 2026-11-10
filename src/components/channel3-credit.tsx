"use client";
import { useStoreLive } from "./shell/store-live";

/** A small, quiet line under live prices. Shown only when the prices really are live from Channel3. */
export function Channel3Credit({ what = "prices", className = "" }: { what?: "prices" | "price history"; className?: string }) {
  const live = useStoreLive();
  if (!live) return null;
  return <p className={`n-credit ${className}`}>{what === "prices" ? "Live prices from Channel3." : "Live prices and 30-day price history from Channel3."}</p>;
}
