import { config } from "dotenv";
import { buy, finalize, GatewayError, policyStatus, prepareQuote } from "../lib/gateway";
import { ShopError } from "../lib/reap-shop";

config({ path: ".env.local" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DONE = new Set(["COMPLETED", "RELEASED", "NEEDS_REVIEW"]);

async function printPolicy(label: string) {
  const s = await policyStatus();
  console.log(
    `${label}: gastado ${s.spentUsd} / ${s.totalUsd} USD | restante ${s.remainingUsd} | ` +
      `compras ${s.charges}/${s.maxCharges} | tope por compra ${s.perPurchaseUsd}`,
  );
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) throw new Error('Uso: npm run agent-run -- "badass coffee"   (opcional: PICK=2)');

  await printPolicy("Politica antes");

  console.log(`\n[1/3] Cotizando "${query}" ...`);
  const q = await prepareQuote(query, Number(process.env.PICK ?? 0));
  console.log("  opciones (usa PICK=<n> para otra):");
  for (const c of q.candidates) console.log(`    ${c.n}. ${c.name} | ${c.price}`);
  console.log(`  elegido:   ${q.product} (${q.merchant})`);
  console.log(`  desglose:  subtotal ${q.breakdown.subtotal} + envio ${q.breakdown.shipping} + impuesto ${q.breakdown.tax}`);
  console.log(`  TOTAL:     ${q.breakdown.total}`);

  if (q.status === "DENIED") {
    console.log(`\n🛑 La politica onchain RECHAZO la compra: ${q.denyReason}`);
    console.log("   No se reservo presupuesto ni se abrio ningun checkout en Reap.");
    return;
  }
  console.log("  politica:  ✅ aprobada");

  console.log("\n[2/3] Reservando presupuesto onchain y abriendo checkout ...");
  const b = await buy(q.quoteId);
  console.log(`  reserva #${b.reservationId}: ${b.reserveTx?.url}`);
  if (b.approvalUrl) {
    console.log("\n👉 Aprueba el cargo en esta URL (OTP de prueba 456789):\n" + b.approvalUrl);
  }

  console.log("\n[3/3] Esperando a Reap (consulta cada 4 s, maximo 10 min) ...");
  let r = b;
  const deadline = Date.now() + 10 * 60_000;
  while (!DONE.has(r.status) && Date.now() < deadline) {
    await sleep(4000);
    r = await finalize(q.quoteId);
    console.log(`  reap: ${r.reapStatus ?? r.status}`);
  }

  console.log("\nResultado:", r.status);
  if (r.status === "COMPLETED") {
    console.log(`  orderId:  ${r.orderId}`);
    console.log(`  cobrado:  ${r.chargedUsd} USD`);
    console.log(`  confirm:  ${r.confirmTx?.url}`);
  } else if (r.status === "RELEASED") {
    console.log(`  presupuesto liberado: ${r.releaseTx?.url}`);
  } else if (r.error) {
    console.log("  error:", r.error);
  }
  await printPolicy("\nPolitica despues");
}

main().catch((e) => {
  if (e instanceof GatewayError) console.error(`${e.code}: ${e.message}`);
  else if (e instanceof ShopError) {
    console.error(e.message);
    console.error("detail:", JSON.stringify(e.detail, null, 2));
  } else console.error(e);
  process.exit(1);
});