// Money as the design shows it: whole dollars large, cents smaller, and one continuous amount for a screen reader.
import { formatMoney } from "@/lib/format";
import { realThings } from "@/lib/ui/real-things";

export function BigMoney({ cents, label }: { cents: number; label?: string }) {
  const full = formatMoney(cents); // "$1,234.56"
  const [dollars, c] = full.split(".");
  return (
    <div className="ng-amount">
      <span className="ng-vh">{label ? `${label}: ` : ""}{full}</span>
      <span aria-hidden="true" style={{ fontSize: "inherit", letterSpacing: "inherit" }}>
        {dollars}
        <span className="ng-cents">.{c}</span>
      </span>
    </div>
  );
}

/** "That is about 6 lunches." next to a big amount. A rough guide, and it says what it counted. */
export function RealThingsLine({ cents, className = "ng-real" }: { cents: number; className?: string }) {
  const r = realThings(cents);
  if (!r) return null;
  return (
    <p className={className} title={r.basis}>
      That is {r.text}. <span className="ng-vh">{r.basis}</span>
    </p>
  );
}
