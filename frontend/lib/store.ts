import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PurchaseStatus =
  | "QUOTED" // quote listo y aprobado por la politica
  | "DENIED" // la politica onchain lo rechazo (no se cobro nada)
  | "EXPIRED" // el quote vencio antes de comprar
  | "RESERVED" // presupuesto reservado onchain, falta abrir el checkout
  | "CHECKOUT" // checkout abierto en Reap, esperando aprobacion del usuario
  | "COMPLETED" // Reap cobro y se confirmo onchain con el orderId
  | "RELEASED" // checkout fallo/expiro y se libero el presupuesto
  | "NEEDS_REVIEW"; // algo no cuadra; requiere revision manual

export type Purchase = {
  quoteId: string;
  product: string;
  merchantName: string;
  merchantHash: string;
  amountCents: string;
  currency: string;
  policyId: string;
  expiresAt: string;
  status: PurchaseStatus;
  denyReason?: string;
  reservationId?: string;
  reserveTx?: string;
  checkoutId?: string;
  approvalUrl?: string | null;
  reapStatus?: string;
  orderId?: string;
  chargedCents?: string;
  confirmTx?: string;
  releaseTx?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

// Almacen minimo en archivo, suficiente para la demo local. En produccion iria una base de datos.
const file = () => path.resolve(process.cwd(), ".data/purchases.json");

function readAll(): Record<string, Purchase> {
  try {
    return JSON.parse(readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
}

export const loadPurchase = (quoteId: string): Purchase | undefined => readAll()[quoteId];

export function savePurchase(p: Purchase): Purchase {
  const all = readAll();
  p.updatedAt = new Date().toISOString();
  all[p.quoteId] = p;
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(all, null, 2));
  return p;
}

export const listPurchases = (): Purchase[] =>
  Object.values(readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));