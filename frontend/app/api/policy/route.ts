import { errorResponse, policyStatus } from "../../../lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/policy -> terminos de la politica, presupuesto restante y ultimas compras. */
export async function GET() {
  try {
    return Response.json(await policyStatus());
  } catch (e) {
    return errorResponse(e);
  }
}