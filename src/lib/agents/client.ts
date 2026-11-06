// The one Anthropic client for the server. The key (ANTHROPIC_API_KEY) never leaves the server.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

/** Throws if the key is missing. Callers turn that into a plain message. */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return (client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 }));
}

export const NOT_SET_UP = "The AI helper is not set up yet. Please tell the person who set up North.";
