// Shared look: big tap targets (at least 56px tall), strong contrast, clear focus.
const base =
  "inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-6 py-3 text-center text-xl font-semibold disabled:opacity-60";

export const btnPrimary = `${base} bg-accent text-accent-ink hover:brightness-110`;
export const btnSecondary = `${base} border-2 border-accent bg-card text-accent hover:bg-slate-50`;
export const card = "rounded-3xl border border-line bg-card p-5 shadow-sm";
