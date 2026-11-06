// Streams one JSON object per line, so the activity panel can update while an agent works.
// (Server side. The browser side is in ndjson-client.ts.)
export type Send = (line: unknown) => void;

export function ndjsonResponse(work: (send: Send) => Promise<void>, onError: (send: Send) => void): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: Send = (line) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        await work(send);
      } catch (e) {
        console.error("[stream] failed:", e instanceof Error ? e.name : "unknown"); // the kind of problem, never its message
        onError(send);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
