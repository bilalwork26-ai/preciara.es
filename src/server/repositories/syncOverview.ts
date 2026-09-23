/**
 * Vistas de solo lectura para el panel técnico de sincronizaciones
 * (`/admin/sincronizacion`): agrega `ImportRun` (ya escrito por
 * `runCatalogSync`/`awinOrchestrator.ts`, ver `importRunSourceLabel` con
 * prefijo `sync:<fuente>:...`) y `SyncSourceConfig` (cadencia, todavía sin
 * ningún cron conectado). Nunca expone la API key, ninguna
 * `SensitiveFeedUrl`, payloads completos ni el error crudo de una
 * excepción: `ImportRun.errorSummary`/`ImportError.message` ya son los
 * únicos campos "seguros" que escribe el núcleo de sincronización (ver su
 * propio comentario en prisma/schema.prisma), así que esta capa solo los
 * lee tal cual, sin añadir nada nuevo.
 */
import { withDb } from "@/server/db/client";
import { OfferSource, type ImportStatus } from "@/generated/prisma";
import type { ImportRunRow } from "./importRuns";

/** Fuentes de "catálogo automático" que tiene sentido mostrar aquí — CSV es manual y ya tiene su propia sección (`/admin/importaciones`). */
export const AUTOMATIC_SOURCES = [OfferSource.AWIN, OfferSource.EBAY] as const;

export function importRunSourcePrefix(source: OfferSource): string {
  return `sync:${source.toLowerCase()}`;
}

export type SyncSourceOverview = {
  source: OfferSource;
  enabled: boolean;
  intervalMinutes: number;
  /** Ejecución real más reciente de esta fuente (o `null` si nunca se ha ejecutado). */
  lastImportRun: ImportRunRow | null;
  /** Solo se calcula si la fuente está activada Y ya hay una ejecución registrada (`SyncSourceConfig.lastRunAt`) — si no, `null` ("No programada"). Nunca se afirma un cron que no existe. */
  nextRunAt: Date | null;
  totalRuns: number;
  /** Fallidas entre las últimas 20 ejecuciones de esta fuente. */
  failedRunsRecent: number;
};

/** Resumen por fuente automática (AWIN, EBAY): una sola consulta agrupada + una por fuente, nunca una por ejecución individual. */
export async function getSyncSourcesOverview(): Promise<SyncSourceOverview[] | null> {
  const result = await withDb(async (db) => {
    const configs = await db.syncSourceConfig.findMany({
      where: { source: { in: [...AUTOMATIC_SOURCES] } },
    });

    const perSource = await Promise.all(
      AUTOMATIC_SOURCES.map(async (source) => {
        const prefix = importRunSourcePrefix(source);
        const [lastRun, totalRuns, recentRuns] = await Promise.all([
          db.importRun.findFirst({ where: { source: { startsWith: prefix } }, orderBy: { startedAt: "desc" } }),
          db.importRun.count({ where: { source: { startsWith: prefix } } }),
          db.importRun.findMany({
            where: { source: { startsWith: prefix } },
            orderBy: { startedAt: "desc" },
            take: 20,
            select: { status: true },
          }),
        ]);
        return {
          source,
          lastRun,
          totalRuns,
          failedRunsRecent: recentRuns.filter((r) => r.status === ("FAILED" as ImportStatus)).length,
        };
      })
    );

    return AUTOMATIC_SOURCES.map((source) => {
      const config = configs.find((c) => c.source === source);
      const data = perSource.find((d) => d.source === source)!;
      const enabled = config?.enabled ?? false;
      const intervalMinutes = config?.intervalMinutes ?? 1440;
      const nextRunAt =
        enabled && config?.lastRunAt ? new Date(config.lastRunAt.getTime() + intervalMinutes * 60_000) : null;

      return {
        source,
        enabled,
        intervalMinutes,
        lastImportRun: data.lastRun,
        nextRunAt,
        totalRuns: data.totalRuns,
        failedRunsRecent: data.failedRunsRecent,
      };
    });
  });
  return result.ok ? result.data : null;
}

export type SyncImportRunsPage = {
  runs: ImportRunRow[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalRuns: number;
};

const PAGE_SIZE = 20;

/** Ejecuciones de fuentes automáticas (AWIN/EBAY), más recientes primero, con paginación acotada (nunca una consulta sin límite). */
export async function getSyncImportRunsPage(params: { source?: OfferSource; page?: number }): Promise<SyncImportRunsPage | null> {
  const { source, page = 1 } = params;
  const safePage = Math.max(1, Math.trunc(page) || 1);

  const where = source
    ? { source: { startsWith: importRunSourcePrefix(source) } }
    : { OR: AUTOMATIC_SOURCES.map((s) => ({ source: { startsWith: importRunSourcePrefix(s) } })) };

  const result = await withDb(async (db) => {
    const [runs, totalRuns] = await Promise.all([
      db.importRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.importRun.count({ where }),
    ]);
    return { runs, page: safePage, pageSize: PAGE_SIZE, totalRuns, totalPages: Math.max(1, Math.ceil(totalRuns / PAGE_SIZE)) };
  });
  return result.ok ? result.data : null;
}
