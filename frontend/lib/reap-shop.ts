import { randomUUID } from "node:crypto";

export class ShopError extends Error {
  constructor(message: string, public status: number, public detail: unknown) {
    super(message);
  }
}

export type Money = { amount: number; currency: string };

type CallOpts = {
  body?: unknown;
  headers?: Record<string, string>;
  idempotent?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T = any>(method: string, path: string, opts: CallOpts = {}): Promise<T> {
  const base = process.env.REAP_BASE_URL ?? "https://sg.sandbox.api.reap.global";
  const apiKey = process.env.REAP_API_KEY;
  if (!apiKey) throw new Error("Falta REAP_API_KEY en frontend/.env.local");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Reap-Version": process.env.REAP_VERSION ?? "2025-02-14",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    // La key se genera UNA vez: si hay reintento por red, Reap no duplica el recurso.
    ...(opts.idempotent ? { "Idempotency-Key": randomUUID() } : {}),
    ...(opts.headers ?? {}),
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(base + path, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        throw new ShopError(`${method} ${path} -> HTTP ${res.status}`, res.status, data);
      }
      return data as T;
    } catch (e) {
      if (e instanceof ShopError) throw e;
      lastErr = e;
      console.warn(`  (red: intento ${attempt}/4 falló, reintentando...)`);
      await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

export const searchProducts = (query: string) =>
  call("POST", "/agentic/products/search", {
    body: {
      query,
      context: { country: "US", currency: "USD" },
      filters: { availability: "AVAILABLE_ONLY" },
      pagination: { limit: 10 },
    },
  });

export const getProductDetails = (productIds: string[]) =>
  call("POST", "/agentic/products/details", { body: { productIds } });

export const resolveVariant = (productId: string, optionIds: string[]) =>
  call("POST", "/agentic/products/variant", { body: { productId, optionIds } });

export const createQuote = (body: unknown) =>
  call("POST", "/agentic/quotes", { body, idempotent: true });

export const getQuote = (id: string) => call("GET", `/agentic/quotes/${id}`);

export const selectShipping = (quoteId: string, shippingOptionId: string) =>
  call("POST", `/agentic/quotes/${quoteId}/shipping-option`, {
    body: { shippingOptionId },
  });

export const createCheckout = (
  quoteId: string,
  enrollmentId: string,
  returnUrl: string,
  simulate: boolean,
) =>
  call("POST", "/agentic/checkouts", {
    body: {
      quoteId,
      enrollmentId,
      presentation: { type: "REDIRECT", returnUrl },
    },
    idempotent: true,
    headers: simulate ? { "X-Simulate-Checkout": "COMPLETED" } : {},
  });

export const getCheckout = (id: string) => call("GET", `/agentic/checkouts/${id}`);

export const fmt = (m?: Money) => (m ? `${m.amount} ${m.currency}` : "?");