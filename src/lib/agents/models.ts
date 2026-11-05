// Which Claude models North uses. Checked on Nov 5 against the live Models API (not just the docs table).
// Sonnet 5.5 rejects forced `tool_choice`, so agents are steered by their prompt, and code validates what comes back.

/** The agents: Concierge, Finder, Scam checker. A fast Sonnet-class model. */
export const AGENT_MODEL = "claude-sonnet-5-5";

/** Small, cheap rewrites (for example a one-line reason). A Haiku-class model. Not used by the Concierge yet. */
export const LIGHT_MODEL = "claude-haiku-5-5";
