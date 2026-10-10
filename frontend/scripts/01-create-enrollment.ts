import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { createEnrollment, ReapError } from "../lib/reap";

config({ path: ".env.local" });

async function main() {
  const ownerId = process.env.DEMO_USER_ID ?? "demo-user-001";
  const email = process.env.DEMO_USER_EMAIL;
  if (!email) throw new Error("Falta DEMO_USER_EMAIL en frontend/.env.local");

  const enrollment = await createEnrollment({
    ownerId,
    email,
    returnUrl: "https://example.com/cards/added",
  });

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/enrollment.json",
    JSON.stringify({ enrollmentId: enrollment.id }, null, 2),
  );

  console.log("Enrollment creado");
  console.log("  id:    ", enrollment.id);
  console.log("  status:", enrollment.status);
  console.log("\nAbre esta URL en tu navegador y captura la tarjeta de prueba:\n");
  console.log(enrollment.nextAction?.url ?? "(sin nextAction)");
  console.log("\nCuando termines, ejecuta: npm run reap-check");
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