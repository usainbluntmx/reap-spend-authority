import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  searchProducts,
  getProductDetails,
  createQuote,
  fmt,
  ShopError,
} from "../lib/reap-shop";

config({ path: ".env.local" });

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) throw new Error('Uso: npm run reap-quote -- "badass coffee"');
  const email = process.env.DEMO_USER_EMAIL;
  if (!email) throw new Error("Falta DEMO_USER_EMAIL en .env.local");

  console.log(`Buscando: "${query}" ...`);
  const found = await searchProducts(query);
  const products: any[] = found.products ?? [];
  if (!products.length) throw new Error("Sin resultados. Prueba otra búsqueda, en inglés.");

  products.forEach((p, i) => {
    const r = p.priceRange;
    const range = r ? `${fmt(r.min)} - ${fmt(r.max)}` : "?";
    console.log(`  ${i + 1}. ${p.name} | ${p.merchant?.name ?? "?"} | ${range}${p.available ? "" : " (no disponible)"}`);
  });

  const pick = Number(process.env.PICK ?? 0);
  const chosen = pick ? products[pick - 1] : products.find((p) => p.available);
  if (!chosen) throw new Error("No hay producto disponible. Cambia la búsqueda o usa PICK=<n>.");
  console.log(`\nElegido: ${chosen.name} (${chosen.merchant?.name})`);

  const details = await getProductDetails([chosen.id]);
  const product = details.products?.[0];
  const variant = product?.defaultVariant;
  if (!variant) throw new Error("Sin variante por defecto. Prueba otro con PICK=<n>.");
  if (!variant.available) throw new Error("La variante por defecto no está disponible. Usa PICK=<n>.");
  console.log(`Variante: ${variant.id} | ${fmt(variant.price)} | envío: ${variant.requiresShipping}`);

  const shippingAddress = {
    firstName: process.env.DEMO_SHIP_FIRST ?? "Demo",
    lastName: process.env.DEMO_SHIP_LAST ?? "User",
    phone: process.env.DEMO_SHIP_PHONE ?? "+12125550123",
    addressLine1: process.env.DEMO_SHIP_ADDRESS ?? "350 5th Ave",
    city: process.env.DEMO_SHIP_CITY ?? "New York",
    postalCode: process.env.DEMO_SHIP_ZIP ?? "10118",
    country: process.env.DEMO_SHIP_COUNTRY ?? "US",
    ...(process.env.DEMO_SHIP_STATE ? { state: process.env.DEMO_SHIP_STATE } : {}),
  };

  const quote = await createQuote({
    items: [{ variantId: variant.id, quantity: 1 }],
    email,
    shippingAddress,
  });

  const b = quote.amountBreakdown ?? {};
  console.log("\nQuote creado");
  console.log("  id:        ", quote.id);
  console.log("  subtotal:  ", fmt(b.itemsSubtotal));
  console.log("  envío:     ", fmt(b.shipping));
  console.log("  impuesto:  ", fmt(b.tax?.amount));
  console.log("  TOTAL:     ", fmt(b.finalAmount));
  console.log("  expira:    ", quote.expiresAt);
  const sel = (quote.shippingOptions ?? []).find((o: any) => o.selected);
  if (sel) console.log("  envío sel.:", sel.name, fmt(sel.price));

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/quote.json",
    JSON.stringify(
      {
        quoteId: quote.id,
        expiresAt: quote.expiresAt,
        finalAmount: b.finalAmount,
        product: chosen.name,
        merchant: chosen.merchant?.name,
        variantId: variant.id,
      },
      null,
      2,
    ),
  );
  console.log("\nSiguiente: npm run reap-checkout  (antes de que expire el quote)");
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