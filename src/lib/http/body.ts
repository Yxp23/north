// Reading a request body safely: a size cap (checked before and after reading) and JSON only. Anything else is null,
// and the route answers "Bad request". This stops giant bodies from eating memory or the AI budget.
export const DEFAULT_MAX_BODY = 64_000;
/** Routes that take a picture (the picture itself is checked again by checkImage). */
export const IMAGE_MAX_BODY = 7_000_000;

export async function readJson(req: Request, maxBytes = DEFAULT_MAX_BODY): Promise<unknown | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
