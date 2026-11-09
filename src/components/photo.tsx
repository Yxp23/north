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
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} />;
}
