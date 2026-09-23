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

/**
 * La propia fuente de filas (`rows`, cuando es un `Iterable`/`AsyncIterable`
 * en streaming) lanzó antes de agotarse por completo — p. ej. un
 * `StreamingCsvTruncatedError` o `AwinTransportError` del transporte de un
 * adaptador todavía sin auditar aquí. El mensaje es SIEMPRE fijo: nunca
 * reutiliza el mensaje del error original, que un adaptador futuro podría
 * construir con datos sensibles (ver punto 12 de la auditoría).
 *
 * A propósito, esta clase NO expone el error original en ninguna
 * propiedad (ni pública ni con el `cause` nativo de `Error`, que
 * `util.inspect`/`console.log` despliegan automáticamente imprimiendo el
 * mensaje del error anidado — el mismo problema, y la misma lección, que
 * motivó `SensitiveFeedUrl` en `awinFeedListParser.ts`). El error original
 * NUNCA se registra ni se persiste en ningún sitio, ni siquiera en el log
 * de servidor del `catch` que lo captura (ni su mensaje, ni su `.stack`,
 * ni su `.cause`, ni una serialización genérica) — ese `catch` ni siquiera
 * lo captura en una variable a propósito; el único log operativo ahí son
 * metadatos fijos y estructurados (código de evento, `source`, id del
 * `ImportRun`, `rowsRead`), nunca texto derivado de la excepción. Un
 * adaptador todavía sin auditar (Awin, eBay, futuros) podría construir su
 * mensaje de error con una URL de descarga, una API key o un token, así
 * que el error crudo queda inalcanzable en todo momento, tanto desde esta
 * excepción como desde cualquier log.
 */
export class SyncStreamError extends Error {
  constructor() {
    super("La fuente de filas se interrumpió antes de agotarse por completo; la sincronización se marca como fallida y no se desactiva ninguna oferta.");
  }
}

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
 * `rows` acepta un array (comportamiento histórico, sin cambios) o
 * cualquier `Iterable`/`AsyncIterable<NormalizedOfferRow>` — en este
 * segundo caso se consume con `for await...of`, UNA fila cada vez, sin
 * convertirlo nunca en array ni acumular nada proporcional al número de
 * filas: así un feed de millones de filas (p. ej. Awin vía
 * `awinTransport.ts`, ya en streaming) puede aplicarse con memoria
 * acotada. El backpressure es automático: la fuente nunca se "adelanta"
 * más de una fila, porque `for await...of` solo vuelve a pedir la
 * siguiente fila cuando el cuerpo del bucle (que incluye escribir la fila
 * actual) ya ha terminado.
 *
 * DIFERENCIA DE VALIDACIÓN entre array y stream (punto 9 de la auditoría),
 * documentada explícitamente aquí porque es una semántica distinta a
 * propósito:
 *   - Con un ARRAY, la validación de `source`/`scope.merchantSlugs` sigue
 *     haciéndose ENTERA por adelantado, antes de tocar el bloqueo o la
 *     base de datos — exactamente igual que siempre: una violación aquí
 *     nunca llega a escribir nada.
 *   - Con un STREAM, no se puede pre-validar sin perder el streaming (habría
 *     que consumirlo dos veces o materializarlo), así que cada fila se
 *     valida justo ANTES de aplicarla, una a una. Si una violación aparece
 *     TARDE (tras varias filas ya aplicadas), esas filas anteriores pueden
 *     haber quedado aplicadas de forma idempotente (nunca se deshacen: no
 *     hay una transacción que dure todo el feed — punto 10), pero la
 *     ejecución completa se marca `FAILED` sin excepción, nunca desactiva
 *     ofertas, dejar de consumir la fuente (cerrando su iterador vía
 *     `return()`, automático con `for await...of`) y lanza `SyncSetupError`
 *     igual que el caso "por adelantado" — mismo tipo de error, mismo
 *     mensaje de intención, distinto momento de detección.
 *
 * Si la propia fuente de filas LANZA a mitad de stream (p. ej. un feed
 * truncado o un fallo de transporte), nunca se reintenta aquí (eso es
 * responsabilidad del adaptador/transporte): se marca `FAILED` con los
 * contadores alcanzados hasta ese punto, nunca se desactiva nada, y se
 * propaga `SyncStreamError` — un error siempre seguro, que nunca reutiliza
 * el mensaje crudo del fallo original (podría venir de un adaptador
 * todavía no auditado y contener datos sensibles).
 *
 * `scope` declara EXPLÍCITAMENTE qué comercios cubre este feed — nunca se
 * deduce de los comercios que de hecho aparecen en `rows` (punto 9): así,
 * un feed válido pero vacío, o un comercio que esta vez no trajo ninguna
 * fila, siguen dentro del alcance de la desactivación de ofertas viejas.
 * Cada fila debe pertenecer a un comercio declarado en `scope.merchantSlugs`
 * — si no, se rechaza como error de configuración del adaptador
 * (`SyncSetupError`).
 *
 * `feedFetchedSuccessfully` distingue "la descarga del feed se completó
 * correctamente" (aunque no trajera filas: un feed vacío pero confirmado es
 * SUCCESS, no FAILED) de "la descarga falló" (siempre FAILED,
 * independientemente de `rows`, y nunca se procesa ninguna fila).
 *
 * La desactivación de ofertas viejas (`deactivateStaleAfterHours`, si se
 * indica) se ejecuta SOLO si la sincronización terminó en `SUCCESS`
 * (nunca si hubo una violación de contrato tardía ni si la fuente lanzó) y
 * nunca en `dryRun` — una descarga fallida, parcial o en dry-run nunca
 * desactiva catálogo: mejor dejar ofertas potencialmente viejas activas
 * que arriesgarse a apagar catálogo que en realidad sigue vigente. Se
 * acota SIEMPRE a `scope.merchantSlugs` (nunca a los comercios inferidos
 * de las filas), así que un comercio del alcance sin ninguna fila esta vez
 * también puede ver sus ofertas viejas desactivadas. La desactivación solo
 * puede dispararse DESPUÉS de que el stream se haya agotado por completo
 * sin excepciones — nunca antes, nunca en paralelo con el consumo.
 *
 * Nunca se abre una transacción de base de datos que envuelva todo el
 * feed: cada fila se aplica con su propia escritura corta
 * (`applyNormalizedOfferRow`), igual que siempre — necesario para no
 * mantener una transacción abierta durante un feed de millones de filas.
 */
export async function runCatalogSync(params: {
  source: NormalizedOfferRow["source"];
  rows: Iterable<NormalizedOfferRow> | AsyncIterable<NormalizedOfferRow>;
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

  const scopeSlugs = new Set(scope.merchantSlugs);

  // ARRAY: validación completa por adelantado, exactamente igual que
  // siempre — antes de tocar el bloqueo o la base de datos (rama "array"
  // del punto 9, ver comentario de cabecera). Un `Iterable`/`AsyncIterable`
  // genérico (streaming) NO se prevalida así a propósito: exigiría
  // consumirlo dos veces o materializarlo entero, justo lo que este bloque
  // debe evitar — se valida fila a fila dentro del bucle principal.
  const isArrayInput = Array.isArray(rows);
  if (isArrayInput) {
    const mismatched = rows.find((r) => r.source !== source);
    if (mismatched) {
      throw new SyncSetupError(
        `El lote declara la fuente "${source}" pero contiene una fila con source="${mismatched.source}". Cada sincronización debe ser de una sola fuente.`
      );
    }
    const outOfScope = rows.find((r) => !scopeSlugs.has(r.merchant.slug));
    if (outOfScope) {
      throw new SyncSetupError(
        `La fila del comercio "${outOfScope.merchant.slug}" no está declarada en scope.merchantSlugs de esta sincronización. El adaptador debe declarar explícitamente qué comercios cubre el feed.`
      );
    }
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
    let rowsRead = 0;

    const importRun = dryRun
      ? null
      : await db.importRun.create({
          data: {
            source: importRunSourceLabel ?? `sync:${source.toLowerCase()}`,
            status: "RUNNING",
            // Contador SEGURO al crear (punto 4): para un stream no se
            // conoce el total por adelantado sin perder el streaming — se
            // actualiza al valor real en `finalizeImportRun`, más abajo.
            rowsRead: 0,
          },
        });

    /** Escribe los `ImportError` acumulados y el estado final del `ImportRun` con los contadores alcanzados hasta ahora — se llama exactamente una vez por ejecución, tanto si el stream se agotó bien como si falló a mitad (con lo alcanzado hasta ese punto). No hace nada en `dryRun` (nunca escribe nada), igual que siempre. */
    async function finalizeImportRun(finalStatus: SyncSummary["status"]): Promise<void> {
      if (dryRun || !importRun) return;
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
          status: finalStatus,
          finishedAt: new Date(),
          rowsRead,
          productsCreated,
          productsUpdated,
          offersCreated,
          offersUpdated,
          rowsRejected: errors.length,
          errorSummary: errors.length > 0 ? summarizeErrors(errors) : null,
        },
      });
    }

    /** `null` mientras no haya violación; si una fila de un STREAM llega fuera de `source`/`scope` (punto 9), se guarda aquí y se deja de consumir la fuente — nunca se lanza en el momento, para poder primero finalizar el `ImportRun` como FAILED con los contadores alcanzados. */
    let midStreamContractViolation: SyncSetupError | null = null;

    // Una descarga fallida nunca se procesa: no hay filas de las que fiarse
    // (aunque `rows` no esté vacío, p. ej. un feed truncado a mitad).
    if (feedFetchedSuccessfully) {
      try {
        for await (const row of rows) {
          rowsRead += 1;
          const index = rowsRead - 1;

          if (!isArrayInput) {
            // STREAM: valida esta fila justo antes de aplicarla (punto 9).
            // Una violación aquí NO es un rechazo de fila ordinario: es un
            // fallo de contrato del adaptador, descubierto tarde — las
            // filas anteriores de este lote pueden haber quedado ya
            // aplicadas de forma idempotente (nunca se deshacen: no hay
            // una transacción que envuelva todo el feed). Se deja de
            // consumir la fuente (el `break` cierra el iterador vía
            // `return()`, automático con `for await...of`) y la ejecución
            // completa se marca FAILED más abajo, sin desactivar nada.
            if (row.source !== source) {
              midStreamContractViolation = new SyncSetupError(
                `El lote declara la fuente "${source}" pero la fila #${index + 1} del stream trae source="${row.source}". Cada sincronización debe ser de una sola fuente. Las filas anteriores de este lote pueden haber quedado ya aplicadas de forma idempotente; esta ejecución se marca FAILED y no desactiva ninguna oferta.`
              );
              break;
            }
            if (!scopeSlugs.has(row.merchant.slug)) {
              midStreamContractViolation = new SyncSetupError(
                `La fila #${index + 1} del stream, del comercio "${row.merchant.slug}", no está declarada en scope.merchantSlugs de esta sincronización. Las filas anteriores de este lote pueden haber quedado ya aplicadas de forma idempotente; esta ejecución se marca FAILED y no desactiva ninguna oferta.`
              );
              break;
            }
          }

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
      } catch {
        // La propia FUENTE de filas lanzó (punto 7) — nunca una fila
        // individual, que ya se captura arriba sin escapar jamás del
        // bucle. Nunca se reintenta el stream aquí (punto 8): se marca
        // FAILED con los contadores alcanzados hasta ahora y se propaga un
        // error siempre seguro.
        //
        // SEGURIDAD: el error crudo de la fuente NUNCA se registra ni se
        // persiste — ni siquiera se captura en una variable (`catch` sin
        // parámetro, a propósito): ni su `.message`, ni su `.stack`, ni su
        // `.cause`, ni una serialización genérica (`String(...)`,
        // `JSON.stringify(...)`, `util.inspect(...)` lo habrían impreso
        // igual — la misma lección de `SensitiveFeedUrl`/`SyncStreamError`
        // más arriba). Viene de un `Iterable`/`AsyncIterable` aportado por
        // un adaptador todavía sin auditar (Awin, eBay, futuros) que
        // podría construir su mensaje de error con una URL de descarga,
        // una API key o un token — el ÚNICO log operativo permitido aquí
        // son metadatos fijos y estructurados, nunca texto derivado de la
        // excepción ni datos de fila.
        console.error({
          event: "catalog_sync_stream_failed",
          source,
          importRunId: importRun?.id ?? null,
          rowsRead,
        });
        await finalizeImportRun("FAILED");
        throw new SyncStreamError();
      }
    }

    const rowsRejected = errors.length;
    const status = midStreamContractViolation ? "FAILED" : computeStatus(feedFetchedSuccessfully, rowsRead, rowsRejected);
    await finalizeImportRun(status);

    // La desactivación SOLO puede dispararse tras agotar el stream por
    // completo sin excepciones y sin violación de contrato (puntos 6 y 9).
    let staleDeactivated = 0;
    if (!midStreamContractViolation && !dryRun && status === "SUCCESS" && deactivateStaleAfterHours !== undefined && scope.merchantSlugs.length > 0) {
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

    if (midStreamContractViolation) {
      throw midStreamContractViolation;
    }

    return {
      importRunId: importRun?.id ?? null,
      dryRun,
      status,
      rowsRead,
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
