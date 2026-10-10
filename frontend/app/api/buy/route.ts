import { buy, errorResponse } from "../../../lib/gateway";
import { requireAccess } from "../../../lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/buy  { quoteId } -> reserva presupuesto onchain y abre el checkout en Reap. */
export async function POST(req: Request) {
  try {
    requireAccess(req);
    const body = await req.json().catch(() => ({}));
    const quoteId = String(body?.quoteId ?? "").trim();
    if (!quoteId) {
      return Response.json({ error: { code: "BAD_REQUEST", message: "Falta 'quoteId'." } }, { status: 400 });
    }
    return Response.json(await buy(quoteId));
  } catch (e) {
    return errorResponse(e);
  }
}