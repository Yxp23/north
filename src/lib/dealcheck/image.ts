// A picture a user uploads is checked by its own first bytes, never by the name or type the browser claims.
export const MAX_IMAGE_BYTES = 4_000_000;

export type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type ImageCheck = { ok: true; type: ImageType; base64: string } | { ok: false; message: string };

const SIGNATURES: { type: ImageType; test: (b: Buffer) => boolean }[] = [
  { type: "image/png", test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", test: (b) => b.length >= 6 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) },
  { type: "image/webp", test: (b) => b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

export function checkImage(input: string): ImageCheck {
  const base64 = String(input ?? "").replace(/^data:[^;]*;base64,/, "");
  const bad = { ok: false as const, message: "I couldn't read that picture. Please try a PNG, JPG, WEBP or GIF." };
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return bad;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, message: "That picture is too big. Please try a smaller one." };
  const match = SIGNATURES.find((s) => s.test(bytes));
  return match ? { ok: true, type: match.type, base64 } : bad;
}
