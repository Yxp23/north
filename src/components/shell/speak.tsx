"use client";
// Tap to hear: the browser's own speech reads a sentence aloud. Nothing is sent anywhere. Shows nothing if the browser can't speak.
import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
const noop = () => () => undefined;

export function SpeakButton({ text, label = "Hear this", className = "" }: { text: string; label?: string; className?: string }) {
  const supported = useSyncExternalStore(noop, canSpeak, () => false);
  const [speaking, setSpeaking] = useState(false);
  const mine = useRef<SpeechSynthesisUtterance | null>(null);

  // Stop talking when the person leaves the screen.
  useEffect(() => () => {
    if (mine.current && canSpeak()) window.speechSynthesis.cancel();
  }, []);

  if (!supported) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    u.onend = u.onerror = () => setSpeaking(false);
    mine.current = u;
    setSpeaking(true);
    synth.speak(u);
  }

  return (
    <button type="button" className={`n-speak ${className}`} aria-pressed={speaking} onClick={toggle}>
      {speaking ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      {speaking ? "Stop" : label}
    </button>
  );
}
