// What the browser sent to /api/find, /api/choose and /api/reorder: words and/or a picture. Checked before any AI sees it.
import { checkImage } from "../dealcheck/image";

type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type FinderRequest =
  | { ok: true; text: string; image?: { base64: string; type: ImageType } }
  | { ok: false; error: string };

export function parseFinderRequest(body: unknown, opts: { maxChars: number; requireImage?: boolean }): FinderRequest {
  const b = (body ?? {}) as { text?: unknown; imageBase64?: unknown };
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > opts.maxChars) return { ok: false, error: "That is too long. Please use a few words." };

  let image: { base64: string; type: ImageType } | undefined;
  if (typeof b.imageBase64 === "string" && b.imageBase64 !== "") {
    const checked = checkImage(b.imageBase64);
    if (!checked.ok) return { ok: false, error: checked.message };
    image = { base64: checked.base64, type: checked.type };
  }
  if (opts.requireImage && !image) return { ok: false, error: "Please add a picture." };
  if (!text && !image) return { ok: false, error: "Please type what you are looking for, or add a picture." };
  return { ok: true, text, ...(image ? { image } : {}) };
}
