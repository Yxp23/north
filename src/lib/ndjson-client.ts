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
