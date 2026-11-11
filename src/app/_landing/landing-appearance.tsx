"use client";
// Opens North's Appearance panel (theme, light or dark, reduce motion, solid surfaces) from the front page. The panel itself lives in the shell.
import { Palette } from "lucide-react";

export function LandingAppearance() {
  return (
    <button type="button" className="lp2-pill" aria-label="Appearance" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event("north:appearance"))}>
      <Palette aria-hidden="true" size={18} style={{ marginRight: 8 }} /><span className="lp2-pill-word">Appearance</span>
    </button>
  );
}
