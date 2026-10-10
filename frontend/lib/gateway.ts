import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Hex } from "viem";
import {
  createCheckout,
  createQuote,
  fmt,
  getCheckout,
  getProductDetails,
  searchProducts,
  ShopError,
  type Money,
} from "./reap-shop";
import {
  checkPolicy,
  confirmOnchain,
  merchantId,
  readPolicy,
  releaseOnchain,
  reserveOnchain,
  toCents,
} from "./policy";
import { CONTRACT, explorerAddress, explorerTx } from "./chain";
import { listPurchases, loadPurchase, savePurchase, type Purchase } from "./store";

export class GatewayError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// Where Reap sends the user after approving. Override with REAP_RETURN_URL (e.g. http://localhost:3000/agent).
const returnUrl = () => process.env.REAP_RETURN_URL || "https://example.com/orders/done";
const cwdPath = (p: string) => path.resolve(process.cwd(), p);

function readJson(p: string, hint: string) {
  const f = cwdPath(p);
  if (!existsSync(f)) throw new GatewayError("MISSING_CONFIG", `Falta ${p}. ${hint}`, 500);
  return JSON.parse(readFileSync(f, "utf8"));
}

const policyConfig = () => readJson("config/policy.json", "Crea la politica con create-policy.ts en backend.");
const loadPolicyId = () => BigInt(policyConfig().policyId);
const loadEnrollmentId = (): string =>
  process.env.REAP_ENROLLMENT_ID || readJson(".data/enrollment.json", "Corre npm run reap-enroll o define REAP_ENROLLMENT_ID.").enrollmentId;

function shippingAddress() {
  return {
    firstName: process.env.DEMO_SHIP_FIRST ?? "Demo",
    lastName: process.env.DEMO_SHIP_LAST ?? "User",
    phone: process.env.DEMO_SHIP_PHONE ?? "+12125550123",
    addressLine1: process.env.DEMO_SHIP_ADDRESS ?? "350 5th Ave",
    city: process.env.DEMO_SHIP_CITY ?? "New York",
    postalCode: process.env.DEMO_SHIP_ZIP ?? "10118",
    country: process.env.DEMO_SHIP_COUNTRY ?? "US",
    ...(process.env.DEMO_SHIP_STATE ? { state: process.env.DEMO_SHIP_STATE } : {}),
  };
}

const usd = (cents: string | bigint | undefined) =>
  cents === undefined ? null : (Number(cents) / 100).toFixed(2);

/** Forma publica de una compra: todo en strings y con links al explorer. */
function view(p: Purchase) {
  return {
    quoteId: p.quoteId,
    status: p.status,
    product: p.product,
    merchant: p.merchantName,
    amountUsd: usd(p.amountCents),
    policyId: p.policyId,
    denyReason: p.denyReason ?? null,
    expiresAt: p.expiresAt,
    reservationId: p.reservationId ?? null,
    reserveTx: p.reserveTx ? { hash: p.reserveTx, url: explorerTx(p.reserveTx) } : null,
    checkoutId: p.checkoutId ?? null,
    approvalUrl: p.approvalUrl ?? null,
    reapStatus: p.reapStatus ?? null,
    orderId: p.orderId ?? null,
    chargedUsd: usd(p.chargedCents),
    confirmTx: p.confirmTx ? { hash: p.confirmTx, url: explorerTx(p.confirmTx) } : null,
    releaseTx: p.releaseTx ? { hash: p.releaseTx, url: explorerTx(p.releaseTx) } : null,
    error: p.error ?? null,
  };
}
export type PurchaseView = ReturnType<typeof view>;

// ---------------------------------------------------------------- 1. cotizar y evaluar la politica

export async function prepareQuote(query: string, pick = 0) {
  const email = process.env.DEMO_USER_EMAIL;
  if (!email) throw new GatewayError("MISSING_CONFIG", "Falta DEMO_USER_EMAIL en .env.local", 500);

  const found = await searchProducts(query);
  const products: any[] = found.products ?? [];
  if (!products.length) throw new GatewayError("NO_RESULTS", "Sin resultados para esa busqueda.", 404);

  const chosen = pick ? products[pick - 1] : products.find((p) => p.available);
  if (!chosen) throw new GatewayError("NO_RESULTS", "No hay producto disponible; usa pick=<n>.", 404);

  const details = await getProductDetails([chosen.id]);
  const variant = details.products?.[0]?.defaultVariant;
  if (!variant?.available) {
    throw new GatewayError("NO_VARIANT", "La variante por defecto no esta disponible; usa otro pick.", 409);
  }

  const quote = await createQuote({
    items: [{ variantId: variant.id, quantity: 1 }],
    email,
    shippingAddress: shippingAddress(),
  });

  // Reap puede devolver el MISMO quote durante ~15 min para el mismo producto. Si ese quote ya se uso,
  // no se debe pisar su registro (reabriria una compra COMPLETED y podria reservar presupuesto dos veces).
  const existing = loadPurchase(quote.id);
  if (existing && existing.status !== "QUOTED" && existing.status !== "DENIED") {
    throw new GatewayError(
      "QUOTE_REUSED",
      `Reap returned a quote that was already used (${existing.status}). Pick another product or wait about 15 minutes for a fresh quote.`,
      409,
    );
  }

  // La politica se evalua sobre el TOTAL real del quote (producto + envio + impuestos), no sobre el precio del catalogo.
  const finalAmount: Money = quote.amountBreakdown.finalAmount;
  const cents = toCents(finalAmount);
  const merchantName: string = chosen.merchant?.name ?? "";
  const merchantHash = merchantId(merchantName);
  const policyId = loadPolicyId();
  const verdict = await checkPolicy(policyId, merchantHash, cents);

  const now = new Date().toISOString();
  const purchase = savePurchase({
    quoteId: quote.id,
    product: chosen.name,
    merchantName,
    merchantHash,
    amountCents: cents.toString(),
    currency: finalAmount.currency,
    policyId: policyId.toString(),
    expiresAt: quote.expiresAt,
    status: verdict.ok ? "QUOTED" : "DENIED",
    ...(verdict.ok ? {} : { denyReason: verdict.reason }),
    createdAt: now,
    updatedAt: now,
  });

  return {
    ...view(purchase),
    breakdown: {
      subtotal: fmt(quote.amountBreakdown.itemsSubtotal),
      shipping: fmt(quote.amountBreakdown.shipping),
      tax: fmt(quote.amountBreakdown.tax?.amount),
      total: fmt(finalAmount),
    },
    candidates: products.slice(0, 10).map((p, i) => ({
      n: i + 1,
      name: p.name,
      merchant: p.merchant?.name ?? null,
      price: p.priceRange ? `${fmt(p.priceRange.min)} - ${fmt(p.priceRange.max)}` : null,
    })),
  };
}

// ---------------------------------------------------------------- 2. reservar onchain y abrir el checkout

export async function buy(quoteId: string) {
  const p = loadPurchase(quoteId);
  if (!p) throw new GatewayError("NOT_FOUND", "Quote desconocido.", 404);
  if (p.status !== "QUOTED") {
    throw new GatewayError("BAD_STATE", `Este quote esta en estado ${p.status}; no se puede comprar.`, 409);
  }
  if (Date.parse(p.expiresAt) <= Date.now()) {
    p.status = "EXPIRED";
    savePurchase(p);
    throw new GatewayError("QUOTE_EXPIRED", "El quote vencio. Pide uno nuevo.", 410);
  }

  const policyId = BigInt(p.policyId);
  const cents = BigInt(p.amountCents);
  const verdict = await checkPolicy(policyId, p.merchantHash as Hex, cents);
  if (!verdict.ok) {
    p.status = "DENIED";
    p.denyReason = verdict.reason;
    savePurchase(p);
    throw new GatewayError("POLICY_DENIED", `La politica rechazo la compra: ${verdict.reason}`, 403);
  }

  const r = await reserveOnchain(policyId, p.merchantHash as Hex, cents, p.quoteId);
  p.status = "RESERVED";
  p.reservationId = r.reservationId.toString();
  p.reserveTx = r.hash;
  savePurchase(p);

  try {
    const simulate = process.env.REAL_APPROVAL !== "1";
    const c = await createCheckout(p.quoteId, loadEnrollmentId(), returnUrl(), simulate);
    p.checkoutId = c.id;
    p.approvalUrl = c.nextAction?.url ?? null;
    p.status = "CHECKOUT";
    savePurchase(p);
  } catch (e) {
    // Si Reap no abre el checkout, el presupuesto reservado no debe quedar bloqueado.
    const reason = `createCheckout failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
    try {
      p.releaseTx = await releaseOnchain(r.reservationId, reason);
      p.status = "RELEASED";
    } catch (re) {
      p.status = "NEEDS_REVIEW";
      p.error = `No se pudo liberar la reserva: ${re instanceof Error ? re.message : String(re)}`;
    }
    savePurchase(p);
    throw e;
  }
  return view(p);
}

// ---------------------------------------------------------------- 3. conciliar con Reap: confirmar o liberar

const finalizing = new Set<string>();

export async function finalize(quoteId: string) {
  const p = loadPurchase(quoteId);
  if (!p) throw new GatewayError("NOT_FOUND", "Quote desconocido.", 404);
  if (!p.checkoutId) throw new GatewayError("BAD_STATE", "Este quote todavia no tiene checkout.", 409);
  if (["COMPLETED", "RELEASED", "NEEDS_REVIEW"].includes(p.status)) return view(p);
  if (finalizing.has(quoteId)) return view(p); // otra llamada ya esta conciliando
  finalizing.add(quoteId);

  try {
    const c = await getCheckout(p.checkoutId);
    p.reapStatus = c.status;
    const reservationId = BigInt(p.reservationId!);

    if (c.status === "COMPLETED") {
      // Se reconcilia contra finalAmount: es lo que Reap realmente cobro.
      const charged = c.finalAmount ? toCents(c.finalAmount) : BigInt(p.amountCents);
      try {
        p.confirmTx = await confirmOnchain(reservationId, charged, p.checkoutId, c.orderId ?? "");
        p.orderId = c.orderId;
        p.chargedCents = charged.toString();
        p.status = "COMPLETED";
      } catch (e) {
        p.status = "NEEDS_REVIEW";
        p.error = `Reap cobro pero no se pudo confirmar onchain: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else if (c.status === "FAILED" || c.status === "EXPIRED") {
      try {
        p.releaseTx = await releaseOnchain(reservationId, `checkout ${c.status}`);
        p.status = "RELEASED";
      } catch (e) {
        p.status = "NEEDS_REVIEW";
        p.error = `Checkout ${c.status} pero no se pudo liberar: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    savePurchase(p);
    return view(p);
  } finally {
    finalizing.delete(quoteId);
  }
}

// ---------------------------------------------------------------- estado de la politica

export async function policyStatus() {
  const cfg = policyConfig();
  const policyId = BigInt(cfg.policyId);
  const p = await readPolicy(policyId);
  return {
    policyId: policyId.toString(),
    contract: { address: CONTRACT.address, url: explorerAddress(CONTRACT.address) },
    owner: p.owner,
    agent: p.agent,
    merchants: cfg.merchants as string[],
    totalUsd: usd(p.totalCap),
    perPurchaseUsd: usd(p.perPurchaseCap),
    spentUsd: usd(p.spent),
    remainingUsd: usd(p.remaining),
    charges: p.charges,
    maxCharges: p.maxCharges,
    expiresAt: new Date(Number(p.expiresAt) * 1000).toISOString(),
    revoked: p.revoked,
    accessRequired: !!process.env.DEMO_ACCESS_KEY,
    purchases: listPurchases().slice(0, 20).map(view),
  };
}

// ---------------------------------------------------------------- errores HTTP para las rutas API

export function errorResponse(e: unknown): Response {
  if (e instanceof GatewayError) {
    return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  if (e instanceof ShopError) {
    return Response.json(
      { error: { code: "REAP_ERROR", message: e.message, detail: e.detail } },
      { status: e.status >= 400 && e.status < 500 ? 502 : 500 },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  return Response.json({ error: { code: "INTERNAL", message } }, { status: 500 });
}