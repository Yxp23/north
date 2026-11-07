"use client";
// "Add a picture": the phone's camera or photos. The picture is made small in the browser before it goes anywhere.
import { useState } from "react";
import { shrinkPicture } from "@/lib/image-client";

export type Picture = { name: string; base64: string };

export function PicturePicker({ id, label, picture, onChange }: { id: string; label: string; picture: Picture | null; onChange: (p: Picture | null) => void }) {
  const [error, setError] = useState("");
  async function choose(file: File | undefined) {
    setError("");
    if (!file) return onChange(null);
    try {
      onChange({ name: file.name, base64: await shrinkPicture(file) });
    } catch {
      onChange(null);
      setError("I couldn't open that picture. Please try a different one.");
    }
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xl font-semibold">{label}</label>
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => choose(e.target.files?.[0])} className="block min-h-14 w-full text-lg" />
      {picture && <p className="text-lg">Picture added: {picture.name}</p>}
      {error && <p role="alert" className="text-lg text-bad-ink">{error}</p>}
    </div>
  );
}
