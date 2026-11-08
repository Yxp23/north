// Signed Guardian approvals.
//
// When the Guardian approves a charge (or the person's own refund tap is accepted), the server signs a short
// statement with a secret only the server has (HMAC-SHA256):  "user U may pay A cents in currency C for Q of
// product P, one time, until T". The PayPal money calls refuse to run without a statement that verifies AND
// matches exactly what they are about to send. So even code that got hold of the PayPal functions cannot move
// money for a different user, product, amount, currency or quantity, and cannot keep using an old approval.
//
// Pure functions: no I/O. (The single-use rule lives in nonces.ts and authorize.ts.)
import { createHmac, timingSafeEqual } from "node:crypto";

export type MoneyKind = "charge" | "refund";

export type Claims = {
  v: 1;
  kind: MoneyKind;
  /** Unique per approval. Spent once (see nonces.ts). */
  nonce: string;
  userId: string;
  /** charge: the product id. refund: the purchase id. */
  ref: string;
  amountCents: number;
  currency: string;
  quantity: number;
  /** Milliseconds since 1970. */
  iat: number;
  exp: number;
};

/** What the money call is about to do. Every field must match the signed claims exactly. */
export type Expected = Pick<Claims, "kind" | "userId" | "ref" | "amountCents" | "currency" | "quantity">;

/** An approval is used a moment after it is made. A couple of minutes is plenty. */
export const APPROVAL_TTL_MS = 2 * 60_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const MAX_TOKEN_LENGTH = 1_000;
const PREFIX = "n1";
const KEYS: (keyof Claims)[] = ["v", "kind", "nonce", "userId", "ref", "amountCents", "currency", "quantity", "iat", "exp"];

const mac = (body: string, key: Buffer) => createHmac("sha256", key).update(`${PREFIX}.${body}`).digest();

const isText = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isCents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** True only for claims of exactly the right shape. */
function wellFormed(c: unknown): c is Claims {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const o = c as Record<string, unknown>;
  if (Object.keys(o).length !== KEYS.length || !KEYS.every((k) => k in o)) return false;
  return (
    o.v === 1 &&
    (o.kind === "charge" || o.kind === "refund") &&
    isText(o.nonce, 120) && isText(o.userId, 80) && isText(o.ref, 120) &&
    isCents(o.amountCents) &&
    typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) &&
    typeof o.quantity === "number" && Number.isSafeInteger(o.quantity) && o.quantity >= 1 && o.quantity <= 100 &&
    typeof o.iat === "number" && Number.isSafeInteger(o.iat) && typeof o.exp === "number" && Number.isSafeInteger(o.exp) && o.exp > o.iat
  );
}

export function signClaims(claims: Claims, key: Buffer): string {
  if (key.length < 16) throw new Error("The signing secret is too short.");
  if (!wellFormed(claims)) throw new Error("Refusing to sign a malformed approval.");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${PREFIX}.${body}.${mac(body, key).toString("base64url")}`;
}

export type Verified = { ok: true; claims: Claims } | { ok: false; reason: string };
const no = (reason: string): Verified => ({ ok: false, reason });

/** Anything unexpected is a "no": a bad shape, a bad signature, a different request, too old, or too new. */
export function verifyClaims(token: unknown, expected: Expected, key: Buffer, nowMs: number): Verified {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return no("no approval");
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== PREFIX) return no("not an approval");
    const [, body, sig] = parts;
    const want = mac(body, key);
    const got = Buffer.from(sig, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return no("bad signature");

    const claims: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!wellFormed(claims)) return no("malformed");
    if (claims.kind !== expected.kind) return no("wrong kind");
    if (claims.userId !== expected.userId) return no("different user");
    if (claims.ref !== expected.ref) return no("different item");
    if (claims.amountCents !== expected.amountCents) return no("different amount");
    if (claims.currency !== expected.currency) return no("different currency");
    if (claims.quantity !== expected.quantity) return no("different quantity");
    if (!Number.isFinite(nowMs)) return no("unreadable clock");
    if (nowMs >= claims.exp) return no("expired");
    if (claims.iat > nowMs + MAX_FUTURE_SKEW_MS) return no("from the future");
    return { ok: true, claims };
  } catch {
    return no("unreadable"); // fail closed
  }
}
