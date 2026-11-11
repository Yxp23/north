"use client";
// "Take or choose a picture": a styled control in place of the browser's file box. On a phone it offers the camera or the photos.
// It shows a small preview and a Remove button. The picture is made small in the browser before it goes anywhere.
import { Camera, X } from "lucide-react";
import { useState } from "react";
import { shrinkPicture } from "@/lib/image-client";

export type Picture = { name: string; base64: string };

export function PicturePicker({ id, label, picture, onChange, compact = false, variant = "field" }: { id: string; label: string; picture: Picture | null; onChange: (p: Picture | null) => void; /** A smaller button, with the label read only by a screen reader. */ compact?: boolean; /** "bar": the camera button that sits inside the Find search bar (a "Photo" button, with a small preview and Remove). */ variant?: "field" | "bar" }) {
  const [error, setError] = useState("");
  async function choose(file: File | undefined) {
    setError("");
    if (!file) return;
    try {
      onChange({ name: file.name, base64: await shrinkPicture(file) });
    } catch {
      onChange(null);
      setError("I couldn't open that picture. Nothing was changed. Please try a different one.");
    }
  }
  if (variant === "bar") {
    return (
      <>
        {picture && (
          <span className="fs-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${picture.base64}`} alt={`Your picture: ${picture.name}`} />
            <button type="button" className="fs-remove" onClick={() => { onChange(null); setError(""); }} aria-label="Remove the picture" title="Remove the picture"><X aria-hidden="true" /></button>
          </span>
        )}
        {/* The real file input stays in the page (keyboards, screen readers); the label is the button you see. On a phone it offers the camera or the photos. */}
        <input id={id} className="n-pic-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <label htmlFor={id} className="fs-photo" title={label} aria-label={picture ? "Choose a different photo" : label}>
          <Camera aria-hidden="true" />
          <span className="fs-photo-word">Photo</span>
        </label>
        {error && <span role="alert" className="fs-error">{error}</span>}
      </>
    );
  }
  return (
    <div className="n-stack" style={{ gap: 10 }}>
      <span className={compact ? "ng-vh" : "n-label"} style={{ marginBottom: 0 }} id={`${id}-label`}>{label}</span>
      <div className="n-pic">
        {/* The real file input stays in the page (for keyboards and screen readers); the label is what you see. */}
        <input id={id} className="n-pic-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-describedby={`${id}-label`} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <label htmlFor={id} className="n-btn n-btn-secondary n-pic-btn">
          <Camera aria-hidden="true" />
          {picture ? "Choose a different picture" : compact ? "Add a photo" : "Take or choose a picture"}
        </label>
        {picture && (
          <div className="n-pic-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${picture.base64}`} alt={`Your picture: ${picture.name}`} />
            <button type="button" className="n-pic-remove" onClick={() => { onChange(null); setError(""); }} aria-label="Remove the picture">
              <X aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="n-note n-note-stop"><span>{error}</span></p>}
    </div>
  );
}
