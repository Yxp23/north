// Plain and client-safe (no server code), so a screen can use it.
/** Has this account already been through setup? PayPal saved and at least one buy. Those people change their money in Money, not in first-run setup. */
export const setupFinished = (s: { paypalSaved: boolean; purchases: unknown[] }): boolean => s.paypalSaved && s.purchases.length > 0;
