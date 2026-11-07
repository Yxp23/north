import { mcpHandler } from "@/lib/checkpoint/run";

// The North Agent Checkpoint: an MCP server (Streamable HTTP). An outside AI assistant connects here with its own
// North key (Authorization: Bearer ...). The key is accepted ONLY on this route. The assistant can ask to buy,
// and the Money Guardian answers; it can never pay, override a wait, or see PayPal details.
export const POST = (req: Request) => mcpHandler(req);
export const GET = (req: Request) => mcpHandler(req);
export const DELETE = (req: Request) => mcpHandler(req);
