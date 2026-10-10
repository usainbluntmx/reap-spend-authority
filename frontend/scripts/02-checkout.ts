import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createCheckout, fmt, ShopError } from "../lib/reap-shop";

config({ path: ".env.local" });

async function main() {
  if (!existsSync(".data/quote.json") || !existsSync(".data/enrollment.json")) {
    throw new Error("Falta .data/quote.json o .data/enrollment.json. Corre reap-quote primero.");
  }
  const q = JSON.parse(readFileSync(".data/quote.json", "utf8"));
  const { enrollmentId } = JSON.parse(readFileSync(".data/enrollment.json", "utf8"));

  if (new Date(q.expiresAt).getTime() < Date.now()) {
    throw new Error("El quote ya expiró. Corre de nuevo: npm run reap-quote -- \"<búsqueda>\"");
  }

  // Sandbox: por defecto simulamos el checkout. REAL_APPROVAL=1 usa la página de aprobación real.
  const simulate = process.env.REAL_APPROVAL !== "1";
  console.log(`Cobrando ${fmt(q.finalAmount)} por "${q.product}" (simulate=${simulate}) ...`);

  const c = await createCheckout(q.quoteId, enrollmentId, "https://example.com/orders/done", simulate);

  console.log("\nCheckout creado");
  console.log("  id:    ", c.id);
  console.log("  status:", c.status);
  console.log("  monto: ", fmt(c.amount));
  if (c.nextAction?.url) {
    console.log("\nAprueba el cargo abriendo esta URL:\n" + c.nextAction.url);
  }
  writeFileSync(".data/checkout.json", JSON.stringify({ checkoutId: c.id }, null, 2));
  console.log("\nSiguiente: npm run reap-order");
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