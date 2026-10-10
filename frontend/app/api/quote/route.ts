import { errorResponse, prepareQuote } from "../../../lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/quote  { query: string, pick?: number } -> cotiza y evalua la politica onchain (sin gastar nada). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim();
    if (!query) {
      return Response.json({ error: { code: "BAD_REQUEST", message: "Falta 'query'." } }, { status: 400 });
    }
    return Response.json(await prepareQuote(query, Number(body?.pick ?? 0)));
  } catch (e) {
    return errorResponse(e);
  }
}