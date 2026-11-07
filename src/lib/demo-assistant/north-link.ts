// The demo assistant's real link to North: an MCP client over HTTP with the assistant's own key. Nothing else.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { NorthLink } from "./assistant";

export async function connectNorth(url: string, key: string, fetchImpl?: typeof fetch): Promise<NorthLink & { close(): Promise<void> }> {
  const client = new Client({ name: "any-ai-assistant", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${key}` } }, ...(fetchImpl ? { fetch: fetchImpl } : {}) }));
  return {
    async listTools() {
      return (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    },
    async call(name, args) {
      const r = (await client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> })) as { content?: { type: string; text?: string }[] };
      return (r.content ?? []).map((c) => c.text ?? "").join("\n");
    },
    close: () => client.close(),
  };
}
