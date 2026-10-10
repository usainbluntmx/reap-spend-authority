import { config } from "dotenv";
import { policyStatus } from "../lib/gateway";

config({ path: ".env.local" });

async function main() {
  const s = await policyStatus();
  console.log(`Politica #${s.policyId} en ${s.contract.url}`);
  console.log(`  dueño:    ${s.owner}`);
  console.log(`  agente:   ${s.agent}`);
  console.log(`  comercios: ${s.merchants.join(", ")}`);
  console.log(`  tope total ${s.totalUsd} USD | por compra ${s.perPurchaseUsd} USD | max compras ${s.maxCharges}`);
  console.log(`  gastado ${s.spentUsd} | restante ${s.remainingUsd} | compras ${s.charges}`);
  console.log(`  expira ${s.expiresAt} | revocada: ${s.revoked}`);
  console.log("\nCompras:");
  if (!s.purchases.length) console.log("  (ninguna todavia)");
  for (const p of s.purchases) {
    console.log(`  - ${p.status.padEnd(12)} ${p.amountUsd} USD  ${p.product}${p.orderId ? "  " + p.orderId : ""}${p.denyReason ? "  [" + p.denyReason + "]" : ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});