import { errorResponse, finalize } from "../../../lib/gateway";
import { requireAccess } from "../../../lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/finalize  { quoteId } -> consulta a Reap; confirma onchain si cobro, libera si fallo. Se puede llamar en bucle. */
export async function POST(req: Request) {
  try {
    requireAccess(req);
    const body = await req.json().catch(() => ({}));
    const quoteId = String(body?.quoteId ?? "").trim();
    if (!quoteId) {
      return Response.json({ error: { code: "BAD_REQUEST", message: "Falta 'quoteId'." } }, { status: 400 });
    }
    return Response.json(await finalize(quoteId));
  } catch (e) {
    return errorResponse(e);
  }
}