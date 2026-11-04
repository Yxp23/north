/** 34900 -> "$349.00". Money is always whole cents in the code. */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
