import type { StepEvent } from "@/lib/agents/loop";

// Browser side: reads a stream of JSON lines. `onLine` gets each parsed line as it arrives.
export async function readNdjson(res: Response, onLine: (line: { type: string; [k: string]: unknown }) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onLine(JSON.parse(line));
      } catch {
        /* a broken line is skipped */
      }
    }
  }
}

/**
 * POSTs to an agent route that streams its steps, and gives back the final result. `onSteps` gets every step so far,
 * for the activity panel. `error` is plain words for the user.
 */
export async function postAgent<T>(url: string, body: unknown, onSteps: (events: StepEvent[]) => void): Promise<{ payload: T | null; error?: string; events: StepEvent[]; /** The whole result line (some routes add fields next to `payload`, like `route`). */ line?: { type: string; [k: string]: unknown } }> {
  const events: StepEvent[] = [];
  const generic = "Something went wrong. Please try again.";
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => null);
      return { payload: null, error: typeof j?.error === "string" ? j.error : generic, events };
    }
    let payload: T | null = null;
    let resultLine: { type: string; [k: string]: unknown } | undefined;
    await readNdjson(res, (line) => {
      if (line.type === "step") {
        events.push({ label: String(line.label), state: line.state as StepEvent["state"], detail: line.detail as string | undefined, warn: line.warn as boolean | undefined });
        onSteps([...events]);
      } else if (line.type === "result") {
        payload = line.payload as T;
        resultLine = line;
      }
    });
    return payload ? { payload, events, line: resultLine } : { payload: null, error: generic, events };
  } catch {
    return { payload: null, error: generic, events };
  }
}
