import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { getEnrollment, ReapError } from "../lib/reap";

config({ path: ".env.local" });

async function main() {
  if (!existsSync(".data/enrollment.json")) {
    throw new Error("No hay enrollment guardado. Ejecuta primero: npm run reap-enroll");
  }
  const { enrollmentId } = JSON.parse(readFileSync(".data/enrollment.json", "utf8"));
  const e = await getEnrollment(enrollmentId);

  console.log("id:    ", e.id);
  console.log("status:", e.status);
  if (e.paymentMethod) {
    console.log(
      `tarjeta: ${e.paymentMethod.network} ****${e.paymentMethod.last4} ` +
        `(vence ${e.paymentMethod.expiryMonth}/${e.paymentMethod.expiryYear})`,
    );
  }

  if (e.status === "ACTIVE") {
    console.log("\n✅ Paso 1 completo: la tarjeta está lista para cobrar.");
  } else if (e.status === "REQUIRES_ACTION") {
    console.log("\n⏳ Falta terminar la página alojada. Abre:", e.nextAction?.url);
  } else {
    console.log("\n❌ Estado final distinto de ACTIVE. Ejecuta de nuevo: npm run reap-enroll");
  }
}

main().catch((e) => {
  if (e instanceof ReapError) {
    console.error(e.message);
    console.error("detail:", JSON.stringify(e.detail));
  } else {
    console.error(e);
  }
  process.exit(1);
});