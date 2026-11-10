"use client";
// A product photo. In video-safe mode, photos from live stores (which can show real brands) are replaced by a plain tile; the project's own
// demo pictures (data/demo-products.json and /public/demo) were picked to have no brand, so they stay. Outside video-safe mode: always the photo.
import { ImageOff } from "lucide-react";
import demo from "../../data/demo-products.json";
import { useAppearance } from "./shell/appearance";

const CURATED = new Set((demo.products as { imageUrl: string }[]).map((p) => p.imageUrl));
export const isBrandSafe = (url: string) => url.startsWith("/demo/") || CURATED.has(url);

export function Photo({ src, alt = "", className, style }: { src: string; alt?: string; className?: string; style?: React.CSSProperties }) {
  const { videoSafe } = useAppearance();
  if (videoSafe && !isBrandSafe(src)) {
    return (
      <span className={`${className ?? ""} n-photo-hidden`} style={style} role="img" aria-label={alt ? `${alt} (photo hidden)` : "Photo hidden"}>
        <ImageOff aria-hidden="true" />
        <span>Photo hidden</span>
      </span>
    );
  }
  // One frame for every product photo (see .ph-frame in north-pages.css): a fixed shape on a soft surface that matches the theme, the picture
  // fitted inside it whole. The frame carries the size classes the caller passed; the picture only fills it.
  return (
    <span className={`ph-frame${className ? ` ${className}` : ""}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" />
    </span>
  );
}
