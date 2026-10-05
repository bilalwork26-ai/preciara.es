/**
 * Persistencia del resumen completo de un ciclo de
 * `runAwinCatalogSyncCycle` (awinOrchestrator.ts) — una fila por ciclo,
 * pensada para `/admin/sincronizacion`. Ver el comentario del modelo
 * `AwinSyncCycleRun` en schema.prisma para el porqué: antes de esto, qué
 * anunciantes se omitían (y por qué — "Not Joined", idioma distinto del
 * español) solo se veía en el log crudo del proceso de Hostinger.
 */
import { withDb } from "@/server/db/client";
import type { AwinOrchestratorAdvertiserOutcome, AwinOrchestratorSkippedFeed, AwinOrchestratorSummary } from "@/server/catalogSync/awinOrchestrator";

export type AwinSyncCycleRunRow = {
  id: number;
  startedAt: Date;
  finishedAt: Date | null;
  dryRun: boolean;
  listFatalError: boolean;
  feedsDiscovered: number;
  feedsApproved: number;
  feedsSkippedNotJoined: number;
  feedsSkippedNonSpanishLanguage: number;
  feedsInvalidInList: number;
  feedsDuplicate: number;
  advertisersProcessed: number;
  advertisersSuccessful: number;
  advertisersIncomplete: number;
  validRowsTotal: number;
  invalidRowsTotal: number;
  feedsCompleted: number;
  feedsFailed: number;
  feedsEmpty: number;
  productsCreatedTotal: number;
  productsUpdatedTotal: number;
  offersCreatedTotal: number;
  offersUpdatedTotal: number;
  staleDeactivatedTotal: number;
  skippedFeeds: AwinOrchestratorSkippedFeed[];
  advertiserOutcomes: AwinOrchestratorAdvertiserOutcome[];
};

/**
 * Guarda el resumen de un ciclo YA terminado. Se llama una única vez,
 * justo después de que `runAwinCatalogSyncCycle` resuelva, desde los dos
 * únicos sitios que lo invocan (`src/app/api/jobs/awin-sync/route.ts` y
 * `scripts/sync-awin.ts`) — nunca una segunda implementación.
 *
 * Nunca lanza: un fallo al guardar este resumen (BD caída, tabla
 * inexistente...) no debe tumbar nada — el ciclo ya terminó y sus datos
 * reales (productos/ofertas) ya se aplicaron o no con independencia de
 * esto. `withDb` ya registra el error técnico completo en el log del
 * servidor; aquí solo se añade un evento con nombre fijo para poder
 * encontrarlo fácilmente.
 */
export async function persistAwinSyncCycleRun(
  summary: AwinOrchestratorSummary,
  timing: { startedAt: Date; finishedAt: Date }
): Promise<void> {
  const result = await withDb((db) =>
    db.awinSyncCycleRun.create({
      data: {
        startedAt: timing.startedAt,
        finishedAt: timing.finishedAt,
        dryRun: summary.dryRun,
        listFatalError: summary.listFatalError,
        feedsDiscovered: summary.feedsDiscovered,
        feedsApproved: summary.feedsApproved,
        feedsSkippedNotJoined: summary.feedsSkippedNotJoined,
        feedsSkippedNonSpanishLanguage: summary.feedsSkippedNonSpanishLanguage,
        feedsInvalidInList: summary.feedsInvalidInList,
        feedsDuplicate: summary.feedsDuplicate,
        advertisersProcessed: summary.advertisersProcessed,
        advertisersSuccessful: summary.advertisersSuccessful,
        advertisersIncomplete: summary.advertisersIncomplete,
        validRowsTotal: summary.validRowsTotal,
        invalidRowsTotal: summary.invalidRowsTotal,
        feedsCompleted: summary.feedsCompleted,
        feedsFailed: summary.feedsFailed,
        feedsEmpty: summary.feedsEmpty,
        productsCreatedTotal: summary.productsCreatedTotal,
        productsUpdatedTotal: summary.productsUpdatedTotal,
        offersCreatedTotal: summary.offersCreatedTotal,
        offersUpdatedTotal: summary.offersUpdatedTotal,
        staleDeactivatedTotal: summary.staleDeactivatedTotal,
        // Prisma acepta un array como Json tal cual — nunca se serializa a mano.
        skippedFeeds: summary.skippedFeeds,
        advertiserOutcomes: summary.advertisers,
      },
    })
  );
  if (!result.ok) {
    console.error({ event: "awin_sync_cycle_run_persist_failed" });
  }
}

/** Últimos ciclos, más reciente primero — para `/admin/sincronizacion`. */
export async function getRecentAwinSyncCycleRuns(limit = 10): Promise<AwinSyncCycleRunRow[] | null> {
  const result = await withDb((db) => db.awinSyncCycleRun.findMany({ orderBy: { startedAt: "desc" }, take: limit }));
  if (!result.ok) return null;
  return result.data.map((row) => ({
    ...row,
    skippedFeeds: row.skippedFeeds as unknown as AwinOrchestratorSkippedFeed[],
    advertiserOutcomes: row.advertiserOutcomes as unknown as AwinOrchestratorAdvertiserOutcome[],
  }));
}
