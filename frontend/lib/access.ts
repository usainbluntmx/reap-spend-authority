import { timingSafeEqual } from "node:crypto";
import { GatewayError } from "./gateway";

/** True when the deployment protects the spending endpoints with a shared demo key. */
export const accessRequired = () => !!process.env.DEMO_ACCESS_KEY;

/**
 * Guards the endpoints that move budget (buy / finalize). If DEMO_ACCESS_KEY is set, the request must carry
 * the same value in the `x-demo-key` header. Quoting and reading the policy stay public.
 */
export function requireAccess(req: Request) {
  const expected = process.env.DEMO_ACCESS_KEY;
  if (!expected) return;
  const given = req.headers.get("x-demo-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new GatewayError("UNAUTHORIZED", "A demo access key is required to buy. Enter it in the form.", 401);
  }
}