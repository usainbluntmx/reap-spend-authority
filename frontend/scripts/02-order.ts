import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { getCheckout, fmt, ShopError } from "../lib/reap-shop";

config({ path: ".env.local" });

const FINAL = new Set(["COMPLETED", "FAILED", "EXPIRED"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!existsSync(".data/checkout.json")) {
    throw new Error("No hay checkout guardado. Corre reap-checkout primero.");
  }
  const { checkoutId } = JSON.parse(readFileSync(".data/checkout.json", "utf8"));

  let c: any;
  for (let i = 0; i < 20; i++) {
    c = await getCheckout(checkoutId);
    console.log(`status: ${c.status}`);
    if (FINAL.has(c.status)) break;
    await sleep(3000);
  }

  console.log("\nid:          ", c.id);
  console.log("status:      ", c.status);
  console.log("orderId:     ", c.orderId ?? "(aún sin orden)");
  console.log("finalAmount: ", fmt(c.finalAmount));

  if (c.status === "COMPLETED") console.log("\n✅ Paso 2 completo: compra confirmada en sandbox.");
  else if (c.status === "REQUIRES_ACTION") console.log("\n⏳ Falta aprobar en la URL de reap-checkout.");
  else console.log("\n❌ Terminó en", c.status);
}

main().catch((e) => {
  if (e instanceof ShopError) {
    console.error(e.message);
    console.error("detail:", JSON.stringify(e.detail, null, 2));
  } else {
    console.error(e);
  }
  process.exit(1);
});