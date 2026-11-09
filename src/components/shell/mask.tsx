"use client";
// Video-safe mode helpers for screens: names and store addresses pass through here. Outside the mode they come back unchanged.
import { useMemo } from "react";
import { createMasker } from "@/lib/ui/video-safe";
import { useAppearance } from "./appearance";

const masker = createMasker(); // one per page load, so a store keeps its letter while you move around

export function useMask() {
  const { videoSafe } = useAppearance();
  return useMemo(
    () => ({
      on: videoSafe,
      store: (d: string) => (videoSafe ? masker.store(d) : d),
      item: (name: string, category?: string) => (videoSafe ? masker.item(name, category) : name),
      /** A sentence that may hold store addresses. */
      text: (s: string) => (videoSafe ? masker.text(s) : s),
      /** A sentence that holds a product name: the name is swapped, and store addresses are masked. */
      sentence: (s: string, name: string, category?: string) => (videoSafe ? masker.text(s.split(name).join(masker.item(name, category))) : s),
    }),
    [videoSafe],
  );
}
