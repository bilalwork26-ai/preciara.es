#!/usr/bin/env -S npx tsx
/**
 * Runner de línea de comandos para `backfillCanonicalGtinFromEan` (ver
 * src/server/catalogSync/backfillCanonicalGtin.ts): rellena
 * `Product.canonicalGtin` en productos históricos que ya tienen un `ean`
 * válido pero todavía no lo tienen, para que Awin/eBay los reconozcan sin
 * duplicar. Nunca sobrescribe, nunca fusiona ni borra: los conflictos se
 * reportan.
 *
 * Uso:
 *   npm run db:backfill-canonical-gtin              # dry-run (por defecto): solo reporta, no escribe nada
 *   npm run db:backfill-canonical-gtin -- --apply    # escribe de verdad
 *
 * Nunca se ejecuta contra producción de forma automática: con
 * NODE_ENV=production, `--apply` se rechaza y el script se limita a
 * dry-run aunque se pida lo contrario — una escritura real contra
 * producción requiere ejecutarlo a mano y deliberadamente fuera de ese
 * entorno.
 *
 * Códigos de salida:
 *   0 = ejecutado (con o sin conflictos/GTIN inválidos — revisa el resumen)
 *   3 = error de configuración (falta DATABASE_URL, o --apply en producción)
 */
import { prisma, isDatabaseConfigured } from "../src/server/db/client";
import { backfillCanonicalGtinFromEan } from "../src/server/catalogSync/backfillCanonicalGtin";

type LogEvent = Record<string, unknown> & { level: "info" | "warn" | "error"; event: string };

function log(entry: LogEvent) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

async function main() {
  const args = process.argv.slice(2);
  const applyRequested = args.includes("--apply");

  if (!isDatabaseConfigured() || !prisma) {
    log({ level: "error", event: "setup_error", message: "Falta DATABASE_URL." });
    process.exitCode = 3;
    return;
  }

  if (applyRequested && process.env.NODE_ENV === "production") {
    log({
      level: "error",
      event: "setup_error",
      message: "Este script nunca escribe automáticamente en producción (NODE_ENV=production). Ejecuta --apply a mano y de forma deliberada fuera de ese entorno.",
    });
    process.exitCode = 3;
    return;
  }

  const dryRun = !applyRequested;
  log({ level: "info", event: "backfill_start", dryRun });

  const summary = await backfillCanonicalGtinFromEan(prisma, { dryRun });

  log({
    level: "info",
    event: "backfill_done",
    dryRun: summary.dryRun,
    scanned: summary.scanned,
    backfilled: summary.backfilled,
    invalidGtin: summary.invalidGtin,
    conflicts: summary.conflicts,
  });

  for (const outcome of summary.outcomes) {
    if (outcome.result === "conflict") {
      log({
        level: "warn",
        event: "gtin_conflict",
        productId: outcome.productId,
        ean: outcome.ean,
        normalizedGtin: outcome.normalizedGtin,
        conflictingProductId: outcome.conflictingProductId,
        message: "GTIN ya en uso por otro producto: no se enlaza (nunca se fusiona ni se borra). Revisa manualmente.",
      });
    }
  }

  if (dryRun && summary.backfilled > 0) {
    log({ level: "info", event: "dry_run_reminder", message: `Vuelve a ejecutar con --apply para escribir ${summary.backfilled} producto(s).` });
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ level: "error", event: "fatal", message: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
