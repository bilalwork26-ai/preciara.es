#!/usr/bin/env -S npx tsx
/**
 * Preparación segura de una base de datos nueva o existente (pensado para
 * activar Hostinger sin usar `mcp.hostinger.com`, que no está disponible
 * desde aquí): valida las variables de entorno, aplica SOLO las
 * migraciones pendientes (nunca crea una migración nueva, nunca borra
 * tablas, nunca usa `db push --force-reset` ni `migrate reset`), y
 * opcionalmente carga el seed de demostración. Se detiene ante cualquier
 * situación destructiva o incompatible en lugar de intentar "arreglarla".
 *
 * Uso:
 *   npm run db:prepare              # valida + migra
 *   npm run db:prepare -- --seed    # valida + migra + carga datos de demostración (idempotente)
 *
 * Códigos de salida: 0 = preparado correctamente. 1 = bloqueado por algo
 * que requiere revisión manual (nunca se fuerza nada).
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../src/generated/prisma";
import { sanitizeErrorMessage } from "./lib/sanitizeError";
import { isMigrationApplicable } from "./lib/dbConnection";

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

async function main() {
  console.log("== 1/4: variables de entorno ==");
  if (!isMigrationApplicable()) {
    console.error("Falta DATABASE_URL. Defínela en las variables de entorno del sitio (nunca en el repositorio) y repite.");
    process.exitCode = 1;
    return;
  }
  console.log("DATABASE_URL: definida.");
  console.log(`ADMIN_PASSWORD: ${process.env.ADMIN_PASSWORD ? "definida" : "no definida (el panel /admin quedará cerrado)"}`);
  console.log(`ADMIN_SESSION_SECRET: ${process.env.ADMIN_SESSION_SECRET ? "definida" : "no definida (el panel /admin quedará cerrado)"}`);

  console.log("\n== 2/4: estado de las migraciones ==");
  try {
    run("npx", ["prisma", "migrate", "status"]);
  } catch {
    // `migrate status` devuelve código distinto de 0 cuando hay migraciones
    // pendientes: es informativo, no un fallo. Seguimos al paso de aplicar.
    console.log("(hay migraciones pendientes o la base está vacía; se aplican a continuación)");
  }

  console.log("\n== 3/4: aplicando SOLO migraciones pendientes ==");
  try {
    // `migrate deploy` nunca genera migraciones nuevas ni borra datos: es
    // el comando recomendado por Prisma para producción. Si detecta una
    // migración fallida o el historial no coincide, termina con error y no
    // toca nada más — nos detenemos ahí, sin intentar forzar nada.
    run("npx", ["prisma", "migrate", "deploy"]);
  } catch (error) {
    console.error("\nNo se pudieron aplicar las migraciones. No se ha tocado nada más.");
    console.error("Revisa `npm run db:migrate:status` antes de volver a intentarlo. Nunca ejecutes `prisma migrate reset` contra datos reales.");
    console.error(sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }

  const seedRequested = process.argv.includes("--seed");
  if (seedRequested) {
    console.log("\n== 4/4: cargando datos de demostración (--seed, idempotente) ==");
    try {
      run("npx", ["prisma", "db", "seed"]);
    } catch (error) {
      console.error("El seed falló. Las migraciones ya aplicadas siguen intactas; revisa el error antes de reintentar.");
      console.error(sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("\n== 4/4: seed de demostración omitido (usa --seed si quieres cargarlo) ==");
  }

  console.log("\n== Resumen ==");
  const prisma = new PrismaClient({ log: ["error"] });
  try {
    const [categories, merchants, products, offers, activeOffers] = await Promise.all([
      prisma.category.count(),
      prisma.merchant.count(),
      prisma.product.count(),
      prisma.offer.count(),
      prisma.offer.count({ where: { isActive: true } }),
    ]);
    console.log(`Categorías: ${categories} · Comercios: ${merchants} · Productos: ${products} · Ofertas: ${offers} (${activeOffers} activas).`);
  } finally {
    await prisma.$disconnect();
  }

  console.log("\nBase de datos preparada. Siguiente paso habitual: importar un CSV real desde /admin/importar (modo \"Simular\" primero).");
}

main().catch((error) => {
  console.error("Error inesperado:", sanitizeErrorMessage(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
