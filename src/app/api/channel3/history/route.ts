import { getHistory } from "@/lib/channel3";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  try {
    return Response.json(await getHistory(id, 30));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
