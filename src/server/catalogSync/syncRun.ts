/**
 * Orquesta una sincronización completa de un lote de `NormalizedOfferRow`
 * de UNA fuente (Awin o eBay, todavía sin conectar): valida y aplica cada
 * fila con `applyNormalizedOfferRow`, reutilizando exactamente los mismos
 * elementos que el importador CSV (`ImportRun`/`ImportError`, el patrón de
 * `dryRun`, y el bloqueo distribuido — con un nombre propio por fuente en
 * vez del compartido del CSV). Análogo a `runCsvImport`
 * (`src/server/importer/run.ts`).
 */
import { prisma, isDatabaseConfigured } from "@/server/db/client";
import type { PrismaClient } from "@/generated/prisma";
import { acquireDistributedLock, catalogSyncLockName, releaseDistributedLock } from "@/server/importer/distributedLock";
import { deactivateStaleOffersForSource } from "@/server/importer/staleOffers";
import { applyNormalizedOfferRow, type GtinRelinkDecision } from "./applyOffer";
import { NormalizedOfferRowError, type NormalizedOfferRow } from "./types";

export class SyncSetupError extends Error {}
export class SyncLockBusyError extends Error {}

export type SyncRowError = { rowIndex: number; externalId: string | null; code: string; message: string };
export type SyncGtinRelinkNotice = { rowIndex: number; externalId: string | null; decision: GtinRelinkDecision };

export type SyncSummary = {
  importRunId: number | null;
  dryRun: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  rowsRead: number;
  productsCreated: number;
  productsUpdated: number;
  merchantsCreated: number;
  merchantsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
  rowsRejected: number;
  errors: SyncRowError[];
  /** Decisiones de relink tardío de GTIN (punto 10) tomadas en este lote — auditoría, nunca cuentan como rechazo. */
  gtinRelinkNotices: SyncGtinRelinkNotice[];
  staleDeactivated: number;
};

function describeGtinRelinkDecision(decision: GtinRelinkDecision): string {
  switch (decision.code) {
    case "GTIN_RELINK_CLAIMED":
      return `El producto #${decision.productId} reclama en solitario el GTIN ${decision.normalizedGtin} (no lo tenía nadie más).`;
    case "GTIN_RELINK_APPLIED":
      return `La oferta se reasignó del producto #${decision.fromProductId} al producto canónico #${decision.toProductId} para el GTIN ${decision.normalizedGtin}.`;
    case "GTIN_RELINK_AMBIGUOUS_SKIPPED":
      return `GTIN ${decision.normalizedGtin} entrante no coincide con el GTIN ya establecido (${decision.existingCanonicalGtin}) del producto #${decision.productId}: no se fusiona automáticamente.`;
  }
}

/**
 * Ejecuta una sincronización. `rows` debe ser un lote de UNA sola fuente
 * (todas con el mismo `row.source`); se valida y se rechaza si no.
 *
 * `scope` declara EXPLÍCITAMENTE qué comercios cubre este feed — nunca se
 * deduce de los comercios que de hecho aparecen en `rows` (punto 9): así,
 * un feed válido pero vacío, o un comercio que esta vez no trajo ninguna
 * fila, siguen dentro del alcance de la desactivación de ofertas viejas.
 * Cada fila debe pertenecer a un comercio declarado en `scope.merchantSlugs`
 * — si no, se rechaza como error de configuración del adaptador
 * (`SyncSetupError`), antes de escribir nada.
 *
 * `feedFetchedSuccessfully` distingue "la descarga del feed se completó
 * correctamente" (aunque no trajera filas: un feed vacío pero confirmado es
 * SUCCESS, no FAILED) de "la descarga falló" (siempre FAILED,
 * independientemente de `rows`, y nunca se procesa ninguna fila).
 *
 * La desactivación de ofertas viejas (`deactivateStaleAfterHours`, si se
 * indica) se ejecuta SOLO si la sincronización terminó en `SUCCESS` y nunca
 * en `dryRun` — una descarga fallida, parcial o en dry-run nunca desactiva
 * catálogo: mejor dejar ofertas potencialmente viejas activas que
 * arriesgarse a apagar catálogo que en realidad sigue vigente. Se acota
 * SIEMPRE a `scope.merchantSlugs` (nunca a los comercios inferidos de las
 * filas), así que un comercio del alcance sin ninguna fila esta vez
 * también puede ver sus ofertas viejas desactivadas.
 */
export async function runCatalogSync(params: {
  source: NormalizedOfferRow["source"];
  rows: NormalizedOfferRow[];
  scope: { merchantSlugs: string[] };
  feedFetchedSuccessfully: boolean;
  dryRun?: boolean;
  deactivateStaleAfterHours?: number;
  importRunSourceLabel?: string;
}): Promise<SyncSummary> {
  const { source, rows, scope, feedFetchedSuccessfully, dryRun = false, deactivateStaleAfterHours, importRunSourceLabel } = params;

  if (!isDatabaseConfigured() || !prisma) {
    throw new SyncSetupError("No hay una base de datos configurada (falta DATABASE_URL).");
  }
  const mismatched = rows.find((r) => r.source !== source);
  if (mismatched) {
    throw new SyncSetupError(
      `El lote declara la fuente "${source}" pero contiene una fila con source="${mismatched.source}". Cada sincronización debe ser de una sola fuente.`
    );
  }
  const scopeSlugs = new Set(scope.merchantSlugs);
  const outOfScope = rows.find((r) => !scopeSlugs.has(r.merchant.slug));
  if (outOfScope) {
    throw new SyncSetupError(
      `La fila del comercio "${outOfScope.merchant.slug}" no está declarada en scope.merchantSlugs de esta sincronización. El adaptador debe declarar explícitamente qué comercios cubre el feed.`
    );
  }

  const db: PrismaClient = prisma;
  const lockName = catalogSyncLockName(source);
  const locked = await acquireDistributedLock(lockName);
  if (!locked) {
    throw new SyncLockBusyError(`Ya hay una sincronización de "${source}" en curso (bloqueo "${lockName}" ocupado).`);
  }

  try {
    const errors: SyncRowError[] = [];
    const gtinRelinkNotices: SyncGtinRelinkNotice[] = [];
    let productsCreated = 0;
    let productsUpdated = 0;
    let merchantsCreated = 0;
    let merchantsUpdated = 0;
    let offersCreated = 0;
    let offersUpdated = 0;

    const importRun = dryRun
      ? null
      : await db.importRun.create({
          data: {
            source: importRunSourceLabel ?? `sync:${source.toLowerCase()}`,
            status: "RUNNING",
            rowsRead: rows.length,
          },
        });

    // Una descarga fallida nunca se procesa: no hay filas de las que fiarse
    // (aunque `rows` no esté vacío, p. ej. un feed truncado a mitad).
    if (feedFetchedSuccessfully) {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        try {
          const outcome = await applyNormalizedOfferRow(db, row, { dryRun });
          if (outcome.product === "created") productsCreated += 1;
          else productsUpdated += 1;
          if (outcome.merchant === "created") merchantsCreated += 1;
          else merchantsUpdated += 1;
          if (outcome.offer === "created") offersCreated += 1;
          else offersUpdated += 1;
          if (outcome.gtinRelink) {
            gtinRelinkNotices.push({ rowIndex: index, externalId: row.externalId || null, decision: outcome.gtinRelink });
          }
        } catch (error) {
          if (error instanceof NormalizedOfferRowError) {
            errors.push({ rowIndex: index, externalId: row.externalId || null, code: error.code, message: error.message });
            continue;
          }
          console.error(`[catalogSync:${source}] Error inesperado en la fila ${index}:`, error);
          errors.push({
            rowIndex: index,
            externalId: row.externalId || null,
            code: "UNEXPECTED_ERROR",
            message: "Error inesperado al procesar esta fila. Revisa los logs del servidor para más detalle.",
          });
        }
      }
    }

    const rowsRejected = errors.length;
    const status = computeStatus(feedFetchedSuccessfully, rows.length, rowsRejected);

    if (!dryRun && importRun) {
      if (errors.length > 0 || gtinRelinkNotices.length > 0) {
        await db.importError.createMany({
          data: [
            ...errors.map((e) => ({
              importRunId: importRun.id,
              rowNumber: e.rowIndex + 1,
              errorCode: e.code,
              message: e.message,
              rowData: e.externalId ? { externalId: e.externalId } : undefined,
            })),
            // Notas de auditoría no bloqueantes (punto 10): nunca cuentan
            // como fila rechazada ni afectan a `status`.
            ...gtinRelinkNotices.map((n) => ({
              importRunId: importRun.id,
              rowNumber: n.rowIndex + 1,
              errorCode: n.decision.code,
              message: describeGtinRelinkDecision(n.decision),
              rowData: n.externalId ? { externalId: n.externalId } : undefined,
            })),
          ],
        });
      }
      await db.importRun.update({
        where: { id: importRun.id },
        data: {
          status,
          finishedAt: new Date(),
          productsCreated,
          productsUpdated,
          offersCreated,
          offersUpdated,
          rowsRejected,
          errorSummary: rowsRejected > 0 ? summarizeErrors(errors) : null,
        },
      });
    }

    let staleDeactivated = 0;
    if (!dryRun && status === "SUCCESS" && deactivateStaleAfterHours !== undefined && scope.merchantSlugs.length > 0) {
      const merchants = await db.merchant.findMany({
        where: { slug: { in: scope.merchantSlugs } },
        select: { id: true },
      });
      const result = await deactivateStaleOffersForSource({
        source,
        merchantIds: merchants.map((m) => m.id),
        olderThanHours: deactivateStaleAfterHours,
      });
      staleDeactivated = result.deactivated;
    }

    return {
      importRunId: importRun?.id ?? null,
      dryRun,
      status,
      rowsRead: rows.length,
      productsCreated,
      productsUpdated,
      merchantsCreated,
      merchantsUpdated,
      offersCreated,
      offersUpdated,
      rowsRejected,
      errors,
      gtinRelinkNotices,
      staleDeactivated,
    };
  } finally {
    await releaseDistributedLock(lockName);
  }
}

function computeStatus(feedFetchedSuccessfully: boolean, rowsRead: number, rowsRejected: number): SyncSummary["status"] {
  if (!feedFetchedSuccessfully) return "FAILED"; // descarga fallida: siempre FAILED, sin importar rowsRead
  if (rowsRead === 0) return "SUCCESS"; // feed confirmado y vacío: válido, nunca un fallo (punto 9)
  if (rowsRejected === 0) return "SUCCESS";
  if (rowsRejected >= rowsRead) return "FAILED";
  return "PARTIAL";
}

function summarizeErrors(errors: SyncRowError[]): string {
  const preview = errors.slice(0, 3).map((e) => `fila ${e.rowIndex + 1}: ${e.code}`);
  const suffix = errors.length > 3 ? ` (+${errors.length - 3} más)` : "";
  return `${errors.length} fila(s) rechazada(s) — ${preview.join("; ")}${suffix}`.slice(0, 500);
}
