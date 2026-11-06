// A second layer against instructions hidden in a listing. It only WARNS (the activity panel says "Found hidden
// instructions"). It never decides anything: the block that protects the user's money is the Guardian's hard
// wall for buys an agent started, and that wall works whether or not this scan finds anything.

export type HiddenKind = "hidden_markup" | "invisible_text" | "note_to_ai" | "fake_system" | "fake_authority" | "ignore_rules" | "secrecy" | "command_to_buy";
export type Hit = { kind: HiddenKind; snippet: string };

const PATTERNS: { kind: HiddenKind; re: RegExp }[] = [
  // Text a person can't see.
  { kind: "hidden_markup", re: /<!--[\s\S]{0,400}?-->|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])|opacity\s*:\s*0(?![.\d]))[^"']*["']/i },
  { kind: "invisible_text", re: /[​-‏⁠﻿]{3,}/ },
  // Talking to the AI.
  { kind: "note_to_ai", re: /\b(?:ai|a\.i\.)\s+(?:assistant|agent|model|system)\b\s*[:,-]|\b(?:note|message|attention|instructions?)\s+(?:to|for)\s+(?:the\s+)?(?:ai|assistants?|agents?|models?|llms?)\b|\b(?:dear|hey)\s+(?:ai|assistant|agent)\b|\b(?:ai|a\.i\.|llm|bot|assistants?|agents?)\s+(?:must|should|need\s+to|are\s+required\s+to|will\s+now)\s+(?:place|make|send|suggest|buy|purchase|order|pay|propose|call|ignore)\b/i },
  // Claims to speak for someone the user trusts.
  { kind: "fake_authority", re: /\b(?:message|note|instructions?|request)s?\s+from\s+(?:the\s+)?(?:user'?s?|their|your)\s+(?:caregiver|supporter|guardian|helper|family|doctor|bank)\b/i },
  { kind: "fake_system", re: /(?:^|\n)\s*(?:system|assistant|developer)\s*:|<\/?\s*(?:system|user_words|user_answer|instructions?|ad_text|listing_description)\s*>|\[\/?INST\]|<\|[a-z_]+\|>/i },
  { kind: "ignore_rules", re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+|your\s+|my\s+|previous\s+|prior\s+|above\s+|earlier\s+|user'?s?\s+)*(?:instructions?|rules?|limits?|guardrails?|restrictions?)\b/i },
  { kind: "ignore_rules", re: /\b(?:skip|bypass|without)\s+(?:all\s+|any\s+|the\s+)?(?:usual\s+|normal\s+|safety\s+|security\s+)*(?:checks?|approval|limits?|guardian|guardrails?)\b/i },
  { kind: "secrecy", re: /\bdo\s+not\s+(?:tell|inform|alert|notify|show)\s+the\s+user\b|\bwithout\s+(?:telling|asking)\s+the\s+user\b/i },
  { kind: "command_to_buy", re: /\byou\s+(?:must|should\s+now|need\s+to|have\s+to)\s+(?:buy|purchase|order|pay|check\s*out)\b|\b(?:buy|purchase|order|pay\s+for)\s+\d+\s+(?:now|immediately|at\s+once)\b/i },
];

/** "Ign0re previ0us rules" -> "Ignore previous rules": digits and symbols that stand in for letters. */
const unDisguise = (t: string) => t.replace(/0/g, "o").replace(/[1|!](?=[a-z])/gi, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5(?=[a-z])/gi, "s").replace(/@/g, "a").replace(/\$(?=[a-z])/gi, "s");

export function findHiddenInstructions(text: string): { found: boolean; hits: Hit[] } {
  const hits: Hit[] = [];
  const input = String(text ?? "").slice(0, 50_000); // long enough for any listing, short enough to stay fast
  // Look at the text as written, and again with disguised letters put back (a hit in either counts).
  for (const body of [input, unDisguise(input)]) {
    for (const { kind, re } of PATTERNS) {
      if (hits.some((h) => h.kind === kind)) continue;
      const m = body.match(re);
      if (!m || m.index === undefined) continue;
      const from = Math.max(0, m.index - 10);
      hits.push({ kind, snippet: body.slice(from, from + 90).replace(/\s+/g, " ").trim() });
    }
  }
  return { found: hits.length > 0, hits };
}
