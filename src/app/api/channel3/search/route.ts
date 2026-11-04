import { search } from "@/lib/channel3";

// Text search ({ query }) or photo search ({ image }, a base64 string or data URL).
export async function POST(req: Request) {
  const { query, image } = await req.json();
  if (!query && !image) return Response.json({ error: "Send a query or an image" }, { status: 400 });
  try {
    const r = await search({ query, base64Image: image, limit: 5 });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
