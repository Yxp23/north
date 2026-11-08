// The checkpoint in front of the PayPal money calls.
//
// `authorizeMoney` takes a signed approval, checks the signature, the expiry and that it matches EXACTLY what is about
// to be sent (user, item, amount, currency, quantity), and spends its nonce (one time only). Only then does it hand
// back a `VerifiedMoney`. The PayPal functions that move money accept nothing else, and they take the amount and
// currency FROM it, not from separate arguments. A hand-made object is not in `issued`, so it is refused.
import type { NonceStore } from "./nonces";
import { verifyClaims, type Claims, type Expected } from "./signed";

declare const verifiedBrand: unique symbol;
export type VerifiedMoney = { readonly [verifiedBrand]: true; readonly claims: Readonly<Claims> };

export type GuardianCrypto = {
  /** The key approvals are signed with (see secret.ts). */
  key: Buffer;
  nonces: NonceStore;
  now(): number;
};

const issued = new WeakSet<object>();

export class MoneyNotAuthorizedError extends Error {
  constructor(why = "No valid Guardian approval for this money movement.") {
    super(why);
    this.name = "MoneyNotAuthorizedError";
  }
}

export type Authorized = { ok: true; verified: VerifiedMoney } | { ok: false; reason: string };

export async function authorizeMoney(token: unknown, expected: Expected, crypto: GuardianCrypto): Promise<Authorized> {
  const checked = verifyClaims(token, expected, crypto.key, crypto.now());
  if (!checked.ok) return { ok: false, reason: checked.reason };
  try {
    const first = await crypto.nonces.consume(checked.claims.nonce, checked.claims.userId, checked.claims.exp);
    if (!first) return { ok: false, reason: "already used" };
  } catch {
    return { ok: false, reason: "could not check that it was unused" }; // fail closed
  }
  const verified = Object.freeze({ claims: Object.freeze({ ...checked.claims }) }) as unknown as VerifiedMoney;
  issued.add(verified);
  return { ok: true, verified };
}

/** The PayPal money functions call this first. A forged or missing proof throws. */
export function requireVerified(v: unknown, kind: Claims["kind"]): Readonly<Claims> {
  if (!v || typeof v !== "object" || !issued.has(v)) throw new MoneyNotAuthorizedError();
  const claims = (v as VerifiedMoney).claims;
  if (claims.kind !== kind) throw new MoneyNotAuthorizedError("That approval is for something else.");
  return claims;
}
