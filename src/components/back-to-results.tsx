"use client";
// "Back to results": shown at the top of a product page when the person came from a search. It goes back to the same search, and the
// results page puts them back at the same place (see lib/ui/find-cache.ts). Without a search it shows nothing; the page has its own "Back to Find".
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readLastResults } from "@/lib/ui/find-cache";

const noop = () => () => {};

export function BackToResults() {
  // The address as plain text, so React can compare it (an object would look new every time). The server renders nothing: it can't see this tab's storage.
  const url = useSyncExternalStore(noop, () => readLastResults()?.url ?? "", () => "");
  if (!url) return null;
  return (
    <Link href={url} className="ng-back-results"><ArrowLeft aria-hidden="true" />Back to results</Link>
  );
}
