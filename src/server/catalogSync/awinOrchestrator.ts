/**
 * Primer orquestador automático COMPLETO de Awin: descubre la lista de
 * feeds, selecciona automáticamente todos los `approved` (Joined),
 * los deduplica y agrupa por anunciante, y alimenta `runCatalogSync` en
 * streaming — sin selección manual de tiendas ni productos, sin cron, sin
 * variables de entorno y sin credenciales reales (la API key se recibe
 * siempre como parámetro explícito). Reutiliza tal cual el transporte
 * (`awinTransport.ts`), los parsers (`awinFeedListParser.ts`,
 * `awinFeedParser.ts`) y el núcleo de sincronización (`syncRun.ts`) ya
 * construidos en bloques anteriores — este fichero NUNCA descarga nada por
 * su cuenta ni reimplementa streaming/parsing/aplicación de filas.
 *
 * COMPROBACIÓN PREVIA (antes de escribir este bloque): `downloadAwinProductFeed`
 * exige un `AwinFeedContext.merchant: NormalizedMerchant` con `slug`,
 * `name` obligatorios y `websiteUrl`/`logoUrl` — `websiteUrl` HOY es
 * `string | null` (ver `types.ts`) precisamente porque NINGUNA de las tres
 * fuentes permitidas (metadatos de la lista de feeds, columnas reales de
 * la fila, URL directa pública del producto) aporta jamás la web de la
 * tienda de forma fiable: la lista de feeds no tiene ese campo, y las
 * columnas/URLs del feed de productos son enlaces a un producto concreto
 * (a menudo a través del dominio de seguimiento de Awin), nunca a la
 * portada del comercio. Se reportó este hallazgo antes de implementar
 * nada; la resolución acordada fue relajar `NormalizedMerchant.websiteUrl`
 * a `string | null` (con su migración Prisma correspondiente) en vez de
 * inventar un valor — ver `prisma/migrations/20260923100337_merchant_website_url_nullable/`.
 * Este orquestador, en consecuencia, SIEMPRE construye `merchant.websiteUrl: null`
 * para Awin: nunca inventa ni deriva una URL de sitio web.
 *
 * `merchant.slug` se deriva ÚNICAMENTE de `advertiserId` (`awin-<advertiserId>`,
 * ver `deriveAwinMerchantSlug`), de forma estable — nunca del `feedId`, del
 * idioma ni del vertical: varios feeds de un mismo anunciante (idiomas,
 * verticales, regiones distintas) son, a propósito, EL MISMO comercio
 * (`Merchant`), agrupados y procesados juntos, aunque conserven su propia
 * identidad de FEED (`AwinFeedListEntry.id`, ver `awinFeedListParser.ts`)
 * y sus propias `Offer` (identidad = fuente + comercio + `externalId` de
 * cada fila, nunca del feed). `merchant.name` se toma del `advertiserName`
 * de la lista de feeds (metadato, fuente permitida) — nunca inventado.
 *
 * ─────────────────────── BLOQUEO DEL CICLO COMPLETO ───────────────────────
 *
 * `runCatalogSync` ya adquiere su propio bloqueo POR FUENTE
 * (`preciara_catalog_sync:AWIN`, ver `distributedLock.ts`/`syncRun.ts`) en
 * CADA llamada — eso evita que dos aplicaciones de filas se pisen a la
 * vez, pero NO evita que dos ORQUESTADORES completos se intercalen entre
 * feeds (p. ej. dos ciclos de Awin arrancando casi a la vez: cada llamada
 * individual a `runCatalogSync` se serializaría igualmente, pero sus
 * resultados podrían entrelazarse de forma confusa, y sobre todo la
 * DESACTIVACIÓN final de un ciclo podría correr mientras el OTRO ciclo
 * todavía está aplicando filas de ese mismo anunciante). Por eso este
 * fichero añade un bloqueo EXTERIOR, propio del ciclo completo, con un
 * NOMBRE DISTINTO al de `runCatalogSync` a propósito (para no auto-
 * bloquearse: adquirir el bloqueo de ciclo nunca compite con el bloqueo
 * interno que la propia llamada a `runCatalogSync` adquiere y libera
 * dentro de este mismo ciclo):
 *
 *   AWIN_CYCLE_LOCK_NAME = "preciara_catalog_cycle:AWIN"
 *
 * Se adquiere ANTES de descargar la lista de feeds y se mantiene hasta
 * terminar TODOS los anunciantes (éxito, error o cancelación) — reutiliza
 * tal cual `acquireDistributedLock`/`releaseDistributedLock`
 * (`distributedLock.ts`), el mismo mecanismo de lease con caducidad ya
 * usado por `runCatalogSync`, sin ninguna migración nueva (el nombre es
 * solo una fila más en la misma tabla `sync_locks`, ya genérica).
 *
 * ─────────────────────── REGLA CONSERVADORA DE DESACTIVACIÓN ───────────────────────
 *
 * La desactivación de ofertas viejas de un anunciante SOLO puede ocurrir
 * en UNA ÚNICA pasada final, después de terminar TODOS sus feeds, y SOLO
 * si TODAS estas condiciones se cumplen a la vez (ver `evaluateDeactivationEligibility`):
 *   - se pidió explícitamente `deactivateStaleAfterHours` (nunca por defecto);
 *   - no es `dryRun`;
 *   - la lista GLOBAL de feeds no contenía ninguna fila `invalid` (podría
 *     esconder un feed `approved` que nunca se llegó a procesar — bloquea
 *     la desactivación de TODO el ciclo, no solo de un anunciante);
 *   - TODOS los feeds de ESE anunciante terminaron completamente (ninguno
 *     falló por transporte, parser, stream truncado, ni por rechazo de
 *     `runCatalogSync`);
 *   - ningún feed de ese anunciante produjo CERO filas válidas (un feed
 *     vacío es sospechoso de una respuesta parcial/incorrecta, nunca se
 *     usa como base para desactivar);
 *   - ninguna fila de producto de ese anunciante fue `invalid`.
 * Si cualquiera de estas condiciones falla, NINGUNA oferta de ese
 * anunciante se toca este ciclo — se conserva todo tal cual estaba, y el
 * resumen devuelve un código de razón estable y seguro (`deactivation.reason`).
 *
 * La pasada final reutiliza `runCatalogSync` con un stream de filas VACÍO
 * (`emptyRows`) y el `scope` explícito de ese único comercio — nunca
 * reaplica ninguna fila (no hay ninguna fila que aplicar) y la
 * desactivación ocurre EXACTAMENTE una vez por anunciante elegible, en
 * una llamada aparte de las que aplicaron sus feeds (nunca junto a una
 * aplicación de filas) — ver las pruebas "desactivación final no reaplica
 * productos" y "todos los feeds correctos → una sola desactivación final".
 *
 * ─────────────────────── STREAMING Y MEMORIA ───────────────────────
 *
 * La LISTA de feeds sí se agrupa en memoria (metadatos: `advertiserId`,
 * `feedId`, `language`... nunca millones de productos) — explícitamente
 * autorizado, ya que su tamaño es proporcional al número de FEEDS, no de
 * PRODUCTOS. Las FILAS de cada feed de productos, en cambio, NUNCA se
 * acumulan: `extractValidRows` entrega a `runCatalogSync` un
 * `AsyncGenerator<NormalizedOfferRow>` que transforma sobre la marcha el
 * `AsyncGenerator<AwinFeedRowResult>` de `downloadAwinProductFeed`,
 * contando filas válidas/inválidas en un acumulador de CONTADORES (no de
 * filas) según se consumen — el backpressure es el mismo que ya garantiza
 * `runCatalogSync` (`for await...of`, nunca `Array.from`/spread/`toArray`).
 *
 * ─────────────────────── AISLAMIENTO DE FALLOS ───────────────────────
 *
 *   - Un fallo al descargar/parsear la LISTA completa aborta TODO el
 *     ciclo antes de tocar ningún producto (nunca se procesa ningún
 *     anunciante) — se refleja en `listFatalError`, nunca se lanza como
 *     excepción (el resumen estructurado es siempre el resultado, salvo
 *     que el propio bloqueo de ciclo esté ocupado).
 *   - Un anunciante cuyo(s) feed(s) fallen NUNCA impide procesar otros
 *     anunciantes: el bucle exterior siempre continúa. Dentro de un mismo
 *     anunciante, TODOS sus feeds se intentan igualmente (un feed fallido
 *     no cancela los demás feeds del mismo anunciante) — así se cumple
 *     "todos los feeds Joined se procesan" incluso cuando alguno falla;
 *     el anunciante completo queda marcado `complete: false` en cuanto
 *     UNO de sus feeds falla.
 *   - Si el transporte/parser/stream de un feed falla, `runCatalogSync`
 *     YA deja ese `ImportRun` como `FAILED` con los contadores alcanzados
 *     (ver `syncRun.ts`) — este orquestador NUNCA hace una segunda
 *     llamada artificial para "registrar" el mismo fallo otra vez.
 *   - Las filas de feeds correctos ya aplicados permanecen importadas de
 *     forma idempotente, se reintente o no un anunciante en un ciclo
 *     posterior.
 *
 * ─────────────────────── RESULTADO PÚBLICO SEGURO ───────────────────────
 *
 * `AwinOrchestratorSummary` nunca incluye la API key, ningún
 * `SensitiveFeedUrl` ni su valor revelado, ninguna URL de descarga,
 * ningún mensaje crudo de excepción, ningún payload ni ninguna fila
 * completa — solo contadores, códigos de estado estables
 * (`AwinOrchestratorFeedFailureReason`/`deactivation.reason`) e
 * identificadores no sensibles (`advertiserId`, `feedId`, el propio
 * `feedIdentity` ya diseñado para no contener nunca la URL secreta,
 * `merchantSlug`, `importRunId`).
 *
 * ─────────────────────── INYECCIÓN DE DEPENDENCIAS ───────────────────────
 *
 * `AwinOrchestratorDeps` permite sustituir transporte, `runCatalogSync`,
 * adquisición/liberación del bloqueo de ciclo y el reloj — los valores por
 * defecto son las implementaciones reales de producción. Este módulo
 * NUNCA lee variables de entorno: la API key y la configuración llegan
 * siempre como parámetros explícitos de quien llama.
 */
import { OfferSource } from "@/generated/prisma";
import { SensitiveFeedUrl, type AwinFeedListEntry, type AwinFeedListResult } from "./awinFeedListParser";
import type { AwinFeedContext, AwinFeedRowResult } from "./awinFeedParser";
import { downloadAwinFeedList, downloadAwinProductFeed } from "./awinTransport";
import { acquireDistributedLock, releaseDistributedLock } from "@/server/importer/distributedLock";
import { runCatalogSync, SyncLockBusyError, SyncSetupError, SyncStreamError, type SyncSummary } from "./syncRun";
import type { NormalizedMerchant, NormalizedOfferRow } from "./types";

/** Nombre del bloqueo del CICLO completo de Awin — distinto a propósito del bloqueo interno por fuente de `runCatalogSync` (`preciara_catalog_sync:AWIN`), para no auto-bloquearse (ver comentario de cabecera). */
export const AWIN_CYCLE_LOCK_NAME = "preciara_catalog_cycle:AWIN";

/** Ya hay un ciclo completo de Awin en curso (bloqueo de ciclo ocupado) — un segundo ciclo concurrente nunca puede intercalarse con este. */
export class AwinOrchestratorLockBusyError extends Error {}

/**
 * Motivo, siempre seguro (nunca deriva de un mensaje crudo), por el que un
 * FEED concreto no se completó.
 *
 * SOLO TRES CATEGORÍAS, a propósito — no una por cada tipo de fallo de
 * transporte/parser (HTTP, gzip, timeout, truncado...): `runCatalogSync`
 * YA captura cualquier fallo de la fuente de filas (`rows`) y lo
 * reclasifica siempre como `SyncStreamError`, sin conservar el tipo ni el
 * mensaje original (ver el propio `SyncStreamError` en `syncRun.ts` — es
 * justo lo que evita que un adaptador todavía no auditado filtre una URL o
 * un token en un log). Por diseño, este orquestador NUNCA ve
 * `AwinTransportError`/`AwinFeedFatalError`/`StreamingCsvTruncatedError`
 * directamente: le llegan ya envueltos como `SyncStreamError` — intentar
 * distinguirlos aquí sería una distinción imposible de observar honestamente
 * sin debilitar esa protección de `runCatalogSync` (que este bloque no debe
 * tocar).
 *   - `FEED_STREAM_FAILED`: la fuente de filas del feed falló a mitad
 *     (transporte, parser o stream truncado — `SyncStreamError`).
 *   - `SYNC_CONTRACT_ERROR`: `runCatalogSync` rechazó la llamada por un
 *     problema de contrato/bloqueo (`SyncSetupError`/`SyncLockBusyError`)
 *     — no debería ocurrir en uso normal (este orquestador siempre
 *     construye `source`/`scope` correctamente), pero se trata igualmente
 *     como un fallo de ESTE feed, nunca como éxito.
 *   - `ROWS_REJECTED_BY_SYNC`: `runCatalogSync` terminó SIN lanzar, pero
 *     con `status !== "SUCCESS"` — alguna fila que `awinFeedParser.ts`
 *     clasificó como `valid` fue rechazada por la validación más profunda
 *     de `applyNormalizedOfferRow` (p. ej. una URL de producto que no pasa
 *     `validateNormalizedOfferRow`). Distinto de un fallo de stream: aquí
 *     sí hubo una respuesta completa y controlada, solo que con filas
 *     rechazadas — nunca se trata como éxito.
 *   - `UNEXPECTED_ERROR`: cualquier otra cosa no reconocida — fallback
 *     conservador, nunca se asume éxito ante un error inesperado.
 */
export type AwinOrchestratorFeedFailureReason = "FEED_STREAM_FAILED" | "SYNC_CONTRACT_ERROR" | "ROWS_REJECTED_BY_SYNC" | "UNEXPECTED_ERROR";

/** Motivo, siempre seguro y estable, por el que la desactivación final de un anunciante se ejecutó u omitió. */
export type AwinOrchestratorDeactivationReason =
  | "OK"
  | "DRY_RUN"
  | "NOT_REQUESTED"
  | "GLOBAL_LIST_HAD_INVALID_ROWS"
  | "ADVERTISER_INCOMPLETE"
  | "EMPTY_FEED_PRESENT"
  | "INVALID_ROWS_PRESENT"
  | "DEACTIVATION_CALL_FAILED";

export type AwinOrchestratorFeedOutcome = {
  advertiserId: string;
  feedId: string;
  /** `AwinFeedListEntry.id` — identidad de feed ya diseñada para no colisionar y para no contener nunca datos sensibles (ver `awinFeedListParser.ts`). */
  feedIdentity: string;
  status: "completed" | "empty" | "failed";
  validRows: number;
  invalidRows: number;
  importRunId: number | null;
  syncStatus: SyncSummary["status"] | null;
  failureReason?: AwinOrchestratorFeedFailureReason;
};

export type AwinOrchestratorAdvertiserOutcome = {
  advertiserId: string;
  merchantSlug: string;
  feedCount: number;
  feedsCompleted: number;
  feedsFailed: number;
  feedsEmpty: number;
  validRowsTotal: number;
  invalidRowsTotal: number;
  /** `true` solo si NINGUNO de sus feeds falló (por transporte, parser, stream o rechazo de `runCatalogSync`) — un feed `empty` sigue contando como "terminado", solo bloquea la desactivación, no la completitud. */
  complete: boolean;
  deactivation: {
    executed: boolean;
    reason: AwinOrchestratorDeactivationReason;
    deactivatedCount: number;
    importRunId: number | null;
  };
};

export type AwinOrchestratorSummary = {
  dryRun: boolean;
  listFatalError: boolean;
  feedsDiscovered: number;
  feedsApproved: number;
  feedsSkippedNotJoined: number;
  feedsInvalidInList: number;
  /** Cuántas entradas `approved` de la lista eran un duplicado EXACTO (mismo `id`) de una ya vista — se descargan una sola vez. */
  feedsDuplicate: number;
  advertisersProcessed: number;
  advertisersSuccessful: number;
  advertisersIncomplete: number;
  validRowsTotal: number;
  invalidRowsTotal: number;
  feedsCompleted: number;
  feedsFailed: number;
  feedsEmpty: number;
  advertisers: AwinOrchestratorAdvertiserOutcome[];
  feeds: AwinOrchestratorFeedOutcome[];
};

export type AwinOrchestratorDeps = {
  /** Por defecto, `downloadAwinFeedList` real (`awinTransport.ts`). Las pruebas sustituyen esto por un generador simulado — transporte cero. */
  downloadFeedList?: (apiKey: string) => AsyncGenerator<AwinFeedListResult>;
  /** Por defecto, `downloadAwinProductFeed` real. */
  downloadProductFeed?: (feedUrl: SensitiveFeedUrl, context: AwinFeedContext) => AsyncGenerator<AwinFeedRowResult>;
  /** Por defecto, `runCatalogSync` real (`syncRun.ts`). */
  runSync?: typeof runCatalogSync;
  /** Por defecto, `acquireDistributedLock` real. */
  acquireLock?: typeof acquireDistributedLock;
  /** Por defecto, `releaseDistributedLock` real. */
  releaseLock?: typeof releaseDistributedLock;
  /** Por defecto, `() => new Date()`. */
  now?: () => Date;
};

export type AwinOrchestratorOptions = {
  /** API key de Awin, recibida siempre explícitamente — este módulo NUNCA lee variables de entorno. */
  apiKey: string;
  /** Si se omite, ningún anunciante desactiva ofertas viejas este ciclo, sin importar lo demás. */
  deactivateStaleAfterHours?: number;
  dryRun?: boolean;
  deps?: AwinOrchestratorDeps;
};

/** `awin-<advertiserId>` — ÚNICAMENTE a partir de `advertiserId`, nunca del `feedId`/idioma/vertical: varios feeds de un mismo anunciante son, a propósito, el MISMO comercio (ver comentario de cabecera). */
export function deriveAwinMerchantSlug(advertiserId: string): string {
  return `awin-${advertiserId}`;
}

function classifyFeedFailure(error: unknown): AwinOrchestratorFeedFailureReason {
  if (error instanceof SyncStreamError) return "FEED_STREAM_FAILED";
  if (error instanceof SyncSetupError || error instanceof SyncLockBusyError) return "SYNC_CONTRACT_ERROR";
  // Fallback conservador: cualquier fallo no reconocido nunca se asume éxito.
  return "UNEXPECTED_ERROR";
}

/** Un `AsyncGenerator<NormalizedOfferRow>` que nunca produce nada — el stream vacío de la pasada final de desactivación (nunca reaplica ninguna fila, ver comentario de cabecera). */
async function* emptyRows(): AsyncGenerator<NormalizedOfferRow> {}

/**
 * Transforma el `AsyncGenerator<AwinFeedRowResult>` de un feed en el
 * `AsyncGenerator<NormalizedOfferRow>` que consume `runCatalogSync`:
 * entrega ÚNICAMENTE las filas `valid`, cuenta las `invalid` en
 * `counters` (nunca en un array — nunca se registra ni se conserva su
 * contenido) y nunca acumula filas en memoria — el backpressure de
 * `runCatalogSync` (`for await...of`) gobierna cuándo se pide la
 * siguiente fila de este generador, que a su vez gobierna cuándo se pide
 * la siguiente al transporte.
 */
async function* extractValidRows(feedResults: AsyncGenerator<AwinFeedRowResult>, counters: { valid: number; invalid: number }): AsyncGenerator<NormalizedOfferRow> {
  for await (const result of feedResults) {
    if (result.status === "valid") {
      counters.valid += 1;
      yield result.row;
    } else {
      counters.invalid += 1;
    }
  }
}

type ResolvedDeps = Required<AwinOrchestratorDeps>;

function resolveDeps(deps: AwinOrchestratorDeps | undefined): ResolvedDeps {
  return {
    downloadFeedList: deps?.downloadFeedList ?? downloadAwinFeedList,
    downloadProductFeed: deps?.downloadProductFeed ?? downloadAwinProductFeed,
    runSync: deps?.runSync ?? runCatalogSync,
    acquireLock: deps?.acquireLock ?? acquireDistributedLock,
    releaseLock: deps?.releaseLock ?? releaseDistributedLock,
    now: deps?.now ?? (() => new Date()),
  };
}

type FeedListClassification = {
  listFatalError: boolean;
  feedsDiscovered: number;
  feedsApproved: number;
  feedsSkippedNotJoined: number;
  feedsInvalidInList: number;
  feedsDuplicate: number;
  listHadInvalidRows: boolean;
  advertiserGroups: Map<string, { advertiserName: string; feeds: AwinFeedListEntry[] }>;
};

/** Consume la lista de feeds en streaming, clasifica cada fila y agrupa los `approved` (deduplicados por `id`) por `advertiserId`. La lista SÍ se agrupa en memoria (metadatos, nunca productos — ver comentario de cabecera). Un fallo del transporte/parser de la LISTA se refleja en `listFatalError`, nunca se propaga como excepción (aborta el resto del ciclo, que comprueba esa bandera antes de tocar ningún producto). */
async function classifyFeedList(deps: ResolvedDeps, apiKey: string): Promise<FeedListClassification> {
  const seenFeedIds = new Set<string>();
  const advertiserGroups = new Map<string, { advertiserName: string; feeds: AwinFeedListEntry[] }>();
  let feedsDiscovered = 0;
  let feedsApproved = 0;
  let feedsSkippedNotJoined = 0;
  let feedsInvalidInList = 0;
  let feedsDuplicate = 0;
  let listHadInvalidRows = false;
  let listFatalError = false;

  try {
    for await (const result of deps.downloadFeedList(apiKey)) {
      feedsDiscovered += 1;
      if (result.status === "skipped") {
        feedsSkippedNotJoined += 1;
        continue;
      }
      if (result.status === "invalid") {
        feedsInvalidInList += 1;
        listHadInvalidRows = true;
        continue;
      }
      feedsApproved += 1;
      const entry = result.feed;
      if (seenFeedIds.has(entry.id)) {
        feedsDuplicate += 1;
        continue; // feed duplicado exacto: se descarga una sola vez, nunca dos.
      }
      seenFeedIds.add(entry.id);
      const group = advertiserGroups.get(entry.advertiserId) ?? { advertiserName: entry.advertiserName, feeds: [] };
      group.feeds.push(entry);
      advertiserGroups.set(entry.advertiserId, group);
    }
  } catch {
    // SEGURIDAD: el error crudo del transporte/parser de la lista NUNCA se
    // registra (mismo motivo que en syncRun.ts: podría venir de un
    // adaptador con una URL/API key/token en su mensaje). Metadatos fijos
    // y seguros únicamente.
    console.error({ event: "awin_orchestrator_list_failed", feedsDiscovered });
    listFatalError = true;
  }

  return { listFatalError, feedsDiscovered, feedsApproved, feedsSkippedNotJoined, feedsInvalidInList, feedsDuplicate, listHadInvalidRows, advertiserGroups };
}

/** Procesa TODOS los feeds de un anunciante, secuencialmente y en orden determinista (por `id` de feed) — nunca se detiene ante el fallo de uno de ellos: todos sus feeds `Joined` se intentan igual. */
async function processAdvertiser(
  deps: ResolvedDeps,
  advertiserId: string,
  advertiserName: string,
  feeds: AwinFeedListEntry[],
  options: { dryRun: boolean }
): Promise<{ outcome: AwinOrchestratorAdvertiserOutcome; feedOutcomes: AwinOrchestratorFeedOutcome[] }> {
  const merchantSlug = deriveAwinMerchantSlug(advertiserId);
  // Nunca se inventa websiteUrl — ver comentario de cabecera y la comprobación previa.
  const merchant: NormalizedMerchant = { slug: merchantSlug, name: advertiserName, websiteUrl: null };
  const sortedFeeds = [...feeds].sort((a, b) => a.id.localeCompare(b.id));

  const feedOutcomes: AwinOrchestratorFeedOutcome[] = [];
  let advertiserComplete = true;
  let feedsCompleted = 0;
  let feedsFailed = 0;
  let feedsEmpty = 0;
  let validRowsTotal = 0;
  let invalidRowsTotal = 0;

  for (const feedEntry of sortedFeeds) {
    const counters = { valid: 0, invalid: 0 };
    const context: AwinFeedContext = { merchant, fetchedAt: deps.now() };
    let status: AwinOrchestratorFeedOutcome["status"];
    let syncStatus: SyncSummary["status"] | null = null;
    let importRunId: number | null = null;
    let failureReason: AwinOrchestratorFeedFailureReason | undefined;

    try {
      const feedResults = deps.downloadProductFeed(feedEntry.url, context);
      const summary = await deps.runSync({
        source: OfferSource.AWIN,
        rows: extractValidRows(feedResults, counters),
        scope: { merchantSlugs: [merchantSlug] },
        feedFetchedSuccessfully: true,
        dryRun: options.dryRun,
        // Nunca la URL ni la API key: solo los identificadores numéricos ya públicos del feed.
        importRunSourceLabel: `sync:awin:feed:${advertiserId}:${feedEntry.feedId}`,
      });
      syncStatus = summary.status;
      importRunId = summary.importRunId;
      if (summary.status !== "SUCCESS") {
        status = "failed";
        failureReason = "ROWS_REJECTED_BY_SYNC";
      } else if (counters.valid === 0) {
        status = "empty";
      } else {
        status = "completed";
      }
    } catch (error) {
      status = "failed";
      failureReason = classifyFeedFailure(error);
      // SEGURIDAD: nunca se registra el error crudo (ver classifyFeedList) — solo metadatos fijos y seguros.
      console.error({ event: "awin_orchestrator_feed_failed", advertiserId, feedId: feedEntry.feedId, failureReason });
    }

    validRowsTotal += counters.valid;
    invalidRowsTotal += counters.invalid;
    if (status === "failed") {
      advertiserComplete = false;
      feedsFailed += 1;
    } else if (status === "empty") {
      feedsEmpty += 1;
    } else {
      feedsCompleted += 1;
    }

    feedOutcomes.push({
      advertiserId,
      feedId: feedEntry.feedId,
      feedIdentity: feedEntry.id,
      status,
      validRows: counters.valid,
      invalidRows: counters.invalid,
      importRunId,
      syncStatus,
      failureReason,
    });
  }

  return {
    outcome: {
      advertiserId,
      merchantSlug,
      feedCount: sortedFeeds.length,
      feedsCompleted,
      feedsFailed,
      feedsEmpty,
      validRowsTotal,
      invalidRowsTotal,
      complete: advertiserComplete,
      // Se rellena en `runAwinCatalogSyncCycle`, que conoce las condiciones GLOBALES (p. ej. `listHadInvalidRows`).
      deactivation: { executed: false, reason: "NOT_REQUESTED", deactivatedCount: 0, importRunId: null },
    },
    feedOutcomes,
  };
}

/**
 * Ejecuta UN ciclo completo de sincronización automática de Awin: descubre
 * la lista de feeds, procesa automáticamente todos los anunciantes
 * `Joined` (agrupados, deduplicados, en orden determinista) y — solo para
 * los anunciantes elegibles — ejecuta una única pasada final de
 * desactivación de ofertas viejas. Ver el comentario de cabecera del
 * fichero para la arquitectura completa, el bloqueo de ciclo y la regla
 * conservadora de desactivación.
 */
export async function runAwinCatalogSyncCycle(options: AwinOrchestratorOptions): Promise<AwinOrchestratorSummary> {
  const { apiKey, deactivateStaleAfterHours, dryRun = false } = options;
  const deps = resolveDeps(options.deps);

  const locked = await deps.acquireLock(AWIN_CYCLE_LOCK_NAME);
  if (!locked) {
    throw new AwinOrchestratorLockBusyError(`Ya hay un ciclo completo de sincronización de Awin en curso (bloqueo "${AWIN_CYCLE_LOCK_NAME}" ocupado).`);
  }

  try {
    const classification = await classifyFeedList(deps, apiKey);

    const advertisers: AwinOrchestratorAdvertiserOutcome[] = [];
    const feeds: AwinOrchestratorFeedOutcome[] = [];

    if (!classification.listFatalError) {
      const advertiserIds = Array.from(classification.advertiserGroups.keys()).sort();
      for (const advertiserId of advertiserIds) {
        const group = classification.advertiserGroups.get(advertiserId)!;
        const { outcome, feedOutcomes } = await processAdvertiser(deps, advertiserId, group.advertiserName, group.feeds, { dryRun });
        feeds.push(...feedOutcomes);

        outcome.deactivation = await evaluateAndRunDeactivation(deps, outcome, {
          dryRun,
          deactivateStaleAfterHours,
          listHadInvalidRows: classification.listHadInvalidRows,
        });
        advertisers.push(outcome);
      }
    }

    const advertisersSuccessful = advertisers.filter((a) => a.complete).length;

    return {
      dryRun,
      listFatalError: classification.listFatalError,
      feedsDiscovered: classification.feedsDiscovered,
      feedsApproved: classification.feedsApproved,
      feedsSkippedNotJoined: classification.feedsSkippedNotJoined,
      feedsInvalidInList: classification.feedsInvalidInList,
      feedsDuplicate: classification.feedsDuplicate,
      advertisersProcessed: advertisers.length,
      advertisersSuccessful,
      advertisersIncomplete: advertisers.length - advertisersSuccessful,
      validRowsTotal: feeds.reduce((sum, f) => sum + f.validRows, 0),
      invalidRowsTotal: feeds.reduce((sum, f) => sum + f.invalidRows, 0),
      feedsCompleted: feeds.filter((f) => f.status === "completed").length,
      feedsFailed: feeds.filter((f) => f.status === "failed").length,
      feedsEmpty: feeds.filter((f) => f.status === "empty").length,
      advertisers,
      feeds,
    };
  } finally {
    await deps.releaseLock(AWIN_CYCLE_LOCK_NAME);
  }
}

/**
 * Decide si el anunciante es elegible para la pasada final de
 * desactivación (ver la regla conservadora completa en el comentario de
 * cabecera) y, solo si lo es, la ejecuta — una única llamada a
 * `runCatalogSync` con un stream VACÍO (`emptyRows`) y el `scope`
 * explícito de ese único comercio, nunca junto a una aplicación de filas.
 * Un fallo de esta llamada (p. ej. el bloqueo interno ocupado por un
 * proceso ajeno) nunca aborta el resto del ciclo: se refleja como
 * `DEACTIVATION_CALL_FAILED`, sin desactivar nada para este anunciante.
 */
async function evaluateAndRunDeactivation(
  deps: ResolvedDeps,
  advertiser: AwinOrchestratorAdvertiserOutcome,
  ctx: { dryRun: boolean; deactivateStaleAfterHours: number | undefined; listHadInvalidRows: boolean }
): Promise<AwinOrchestratorAdvertiserOutcome["deactivation"]> {
  const reason = evaluateDeactivationEligibility(advertiser, ctx);
  if (reason !== "OK") {
    return { executed: false, reason, deactivatedCount: 0, importRunId: null };
  }

  try {
    const summary = await deps.runSync({
      source: OfferSource.AWIN,
      rows: emptyRows(),
      scope: { merchantSlugs: [advertiser.merchantSlug] },
      feedFetchedSuccessfully: true,
      dryRun: false,
      deactivateStaleAfterHours: ctx.deactivateStaleAfterHours!,
      importRunSourceLabel: `sync:awin:cycle-deactivation:${advertiser.advertiserId}`,
    });
    return { executed: true, reason: "OK", deactivatedCount: summary.staleDeactivated, importRunId: summary.importRunId };
  } catch {
    console.error({ event: "awin_orchestrator_deactivation_failed", advertiserId: advertiser.advertiserId });
    return { executed: false, reason: "DEACTIVATION_CALL_FAILED", deactivatedCount: 0, importRunId: null };
  }
}

function evaluateDeactivationEligibility(
  advertiser: AwinOrchestratorAdvertiserOutcome,
  ctx: { dryRun: boolean; deactivateStaleAfterHours: number | undefined; listHadInvalidRows: boolean }
): AwinOrchestratorDeactivationReason {
  if (ctx.dryRun) return "DRY_RUN";
  if (ctx.deactivateStaleAfterHours === undefined) return "NOT_REQUESTED";
  if (ctx.listHadInvalidRows) return "GLOBAL_LIST_HAD_INVALID_ROWS";
  if (!advertiser.complete) return "ADVERTISER_INCOMPLETE";
  if (advertiser.feedsEmpty > 0) return "EMPTY_FEED_PRESENT";
  if (advertiser.invalidRowsTotal > 0) return "INVALID_ROWS_PRESENT";
  return "OK";
}
