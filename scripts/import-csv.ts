#!/usr/bin/env -S npx tsx
/**
 * Runner de importación por línea de comandos (Fase 2A: preparado para
 * invocarse desde una tarea programada — cron, GitHub Actions — en una
 * fase posterior; hoy se ejecuta a mano con `npm run db:import`).
 *
 * Uso:
 *   npm run db:import -- ruta/al/fichero.csv [--dry-run] [--source=etiqueta]
 *   npm run db:import -- --deactivate-stale [--stale-hours=72]
 *
 * Códigos de salida:
 *   0 = SUCCESS o PARTIAL (revisa /admin/errores si hubo filas rechazadas)
 *   1 = FAILED (no se importó nada usable, o error de configuración)
 *   2 = no se pudo obtener el bloqueo (ya hay otra importación en curso)
 *   3 = error de uso (argumentos, fichero no encontrado...)
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { prisma, isDatabaseConfigured } from "../src/server/db/client";
import { runCsvImport, ImportSetupError } from "../src/server/importer/run";
import { deactivateStaleOffers, getOfferStaleAfterHours } from "../src/server/importer/staleOffers";

const LOCK_NAME = "preciara_csv_import";
const LOCK_WAIT_SECONDS = 5;

type LogEvent = Record<string, unknown> & { level: "info" | "warn" | "error"; event: string };

function log(entry: LogEvent) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

async function acquireLock(): Promise<boolean> {
  if (!prisma) return false;
  const rows = await prisma.$queryRawUnsafe<{ acquired: number }[]>(
    `SELECT GET_LOCK('${LOCK_NAME}', ${LOCK_WAIT_SECONDS}) as acquired`
  );
  return rows[0]?.acquired === 1;
}

async function releaseLock(): Promise<void> {
  if (!prisma) return;
  await prisma.$queryRawUnsafe(`SELECT RELEASE_LOCK('${LOCK_NAME}')`);
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const options: Record<string, string> = {};
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (value === undefined) flags.add(key);
      else options[key] = value;
    } else {
      positional.push(arg);
    }
  }
  return { flags, options, positional };
}

async function main() {
  const runId = randomUUID();
  const { flags, options, positional } = parseArgs(process.argv.slice(2));

  if (!isDatabaseConfigured()) {
    log({ level: "error", event: "setup_error", runId, message: "Falta DATABASE_URL." });
    process.exitCode = 3;
    return;
  }

  if (flags.has("deactivate-stale")) {
    const hours = options["stale-hours"] ? Number(options["stale-hours"]) : getOfferStaleAfterHours();
    log({ level: "info", event: "deactivate_stale_start", runId, hours });
    const locked = await acquireLock();
    if (!locked) {
      log({ level: "warn", event: "lock_busy", runId });
      process.exitCode = 2;
      return;
    }
    try {
      const { deactivated } = await deactivateStaleOffers(hours);
      log({ level: "info", event: "deactivate_stale_done", runId, deactivated });
    } finally {
      await releaseLock();
    }
    return;
  }

  const filePath = positional[0];
  if (!filePath) {
    log({ level: "error", event: "usage_error", runId, message: "Falta la ruta al CSV." });
    process.exitCode = 3;
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    log({ level: "error", event: "usage_error", runId, message: `Fichero no encontrado: ${filePath}` });
    process.exitCode = 3;
    return;
  }

  const dryRun = flags.has("dry-run");
  const source = options.source ?? `csv:cli:${filePath.split("/").pop()}`;

  log({ level: "info", event: "import_start", runId, filePath, dryRun, source });

  const locked = await acquireLock();
  if (!locked) {
    log({ level: "warn", event: "lock_busy", runId });
    process.exitCode = 2;
    return;
  }

  try {
    const csvContent = readFileSync(filePath, "utf8");
    const summary = await runCsvImport({ csvContent, source, dryRun, metadata: { runId, invokedBy: "cli" } });

    log({
      level: summary.status === "FAILED" ? "error" : "info",
      event: "import_done",
      runId,
      importRunId: summary.importRunId,
      status: summary.status,
      rowsRead: summary.rowsRead,
      rowsRejected: summary.rowsRejected,
      productsCreated: summary.productsCreated,
      productsUpdated: summary.productsUpdated,
      offersCreated: summary.offersCreated,
      offersUpdated: summary.offersUpdated,
    });

    if (summary.rowsRejected > 0) {
      for (const err of summary.errors.slice(0, 20)) {
        log({ level: "warn", event: "row_rejected", runId, rowNumber: err.rowNumber, code: err.code, message: err.message });
      }
    }

    process.exitCode = summary.status === "FAILED" ? 1 : 0;
  } catch (error) {
    if (error instanceof ImportSetupError) {
      log({ level: "error", event: "setup_error", runId, message: error.message });
      process.exitCode = 3;
    } else {
      log({ level: "error", event: "unexpected_error", runId, message: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
    }
  } finally {
    await releaseLock();
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
