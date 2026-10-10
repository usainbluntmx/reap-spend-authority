import { keccak256, parseEventLogs, toBytes, type Hex } from "viem";
import { CONTRACT, getAgent, getPublicClient } from "./chain";
import type { Money } from "./reap-shop";

/** 43.67 USD -> 4367n. El contrato trabaja en centavos de USD. */
export function toCents(m: Money): bigint {
  if (m.currency !== "USD") throw new Error(`Moneda no soportada por la politica: ${m.currency}`);
  return BigInt(Math.round(m.amount * 100));
}

/** Debe coincidir con el hash que se uso al crear la politica: keccak256(nombre en minusculas). */
export const merchantId = (name: string): Hex => keccak256(toBytes(name.trim().toLowerCase()));

const CHECK = [
  "Ok",
  "PolicyNotFound",
  "Revoked",
  "Expired",
  "MerchantNotAllowed",
  "OverPerPurchaseCap",
  "MaxChargesReached",
  "OverTotalCap",
] as const;
export type CheckReason = (typeof CHECK)[number];

export async function checkPolicy(policyId: bigint, merchant: Hex, cents: bigint) {
  const code = Number(
    await getPublicClient().readContract({
      ...CONTRACT,
      functionName: "check",
      args: [policyId, merchant, cents],
    }),
  );
  return { ok: code === 0, code, reason: (CHECK[code] ?? "Unknown") as CheckReason | "Unknown" };
}

export async function readPolicy(policyId: bigint) {
  const pub = getPublicClient();
  const [p, remaining] = await Promise.all([
    pub.readContract({ ...CONTRACT, functionName: "getPolicy", args: [policyId] }) as Promise<any>,
    pub.readContract({ ...CONTRACT, functionName: "remaining", args: [policyId] }) as Promise<bigint>,
  ]);
  return { ...p, remaining } as {
    owner: Hex;
    agent: Hex;
    expiresAt: bigint;
    maxCharges: number;
    charges: number;
    revoked: boolean;
    totalCap: bigint;
    perPurchaseCap: bigint;
    spent: bigint;
    remaining: bigint;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(functionName: string, args: unknown[]) {
  const pub = getPublicClient();
  const { account, client } = getAgent();
  // simulateContract decodifica los errores personalizados (PolicyRejected, NotAgent...) antes de gastar gas.
  // El RPC publico puede ir unos segundos por detras de la ultima transaccion, asi que se reintenta
  // SOLO la simulacion (es de lectura, no gasta nada) antes de rendirse. La escritura nunca se reintenta.
  let request: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      const sim: any = await pub.simulateContract({ ...CONTRACT, functionName, args, account } as any);
      request = sim.request;
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(2500);
    }
  }
  const hash = await client.writeContract(request as any);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`La transaccion ${functionName} revirtio: ${hash}`);
  return { hash, receipt };
}

export async function reserveOnchain(policyId: bigint, merchant: Hex, cents: bigint, quoteId: string) {
  const { hash, receipt } = await send("reserve", [policyId, merchant, cents, quoteId]);
  const [ev] = parseEventLogs({ abi: CONTRACT.abi, logs: receipt.logs, eventName: "PurchaseReserved" }) as any[];
  if (!ev) throw new Error("No se encontro el evento PurchaseReserved");
  return { hash, reservationId: ev.args.reservationId as bigint };
}

export async function confirmOnchain(reservationId: bigint, chargedCents: bigint, checkoutId: string, orderId: string) {
  return (await send("confirm", [reservationId, chargedCents, checkoutId, orderId])).hash;
}

export async function releaseOnchain(reservationId: bigint, reason: string) {
  return (await send("release", [reservationId, reason])).hash;
}