import { startTracking } from "@/lib/channel3";

// Start 30-day price tracking. History only builds from the day tracking starts.
export async function POST(req: Request) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return Response.json({ error: "ids must be a list of strings" }, { status: 400 });
  }
  const results = await Promise.all(
    ids.map(async (id: string) => {
      try {
        return { id, ok: true, raw: await startTracking(id) };
      } catch (e) {
        return { id, ok: false, error: String(e) };
      }
    }),
  );
  return Response.json({ results });
}
