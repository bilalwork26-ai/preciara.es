/**
 * Acceso a la configuración de cadencia por fuente (`SyncSourceConfig`,
 * ver prisma/schema.prisma). Deliberadamente sin ningún cron ni tarea
 * programada todavía — esto es solo el punto de lectura/escritura que
 * usará quien orqueste las ejecuciones (fase posterior, al conectar Awin y
 * eBay de verdad). `enabled` es `false` mientras no exista una fila
 * explícita: nunca se asume que una fuente debe sincronizarse por omisión.
 */
import { withDb } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";

export type SyncSourceConfigRow = {
  source: OfferSource;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt: Date | null;
};

const DEFAULT_INTERVAL_MINUTES = 1440; // 24h: valor de arranque genérico, no una cadencia recomendada para ninguna fuente real.

/** `null` = sin fila todavía (o BD no disponible): se trata como "desactivada" con el intervalo por defecto. */
export async function getSyncSourceConfig(source: OfferSource): Promise<SyncSourceConfigRow | null> {
  const result = await withDb((db) => db.syncSourceConfig.findUnique({ where: { source } }));
  if (!result.ok) return null;
  if (!result.data) return { source, intervalMinutes: DEFAULT_INTERVAL_MINUTES, enabled: false, lastRunAt: null };
  return result.data;
}

/** Crea o actualiza la configuración de una fuente. Nunca activa una fuente por su cuenta: `enabled` siempre lo decide quien llama explícitamente. */
export async function upsertSyncSourceConfig(params: {
  source: OfferSource;
  intervalMinutes: number;
  enabled: boolean;
}): Promise<SyncSourceConfigRow | null> {
  const { source, intervalMinutes, enabled } = params;
  const result = await withDb((db) =>
    db.syncSourceConfig.upsert({
      where: { source },
      update: { intervalMinutes, enabled },
      create: { source, intervalMinutes, enabled },
    })
  );
  return result.ok ? result.data : null;
}

/** Marca el momento de la última ejecución (con éxito o no) para esa fuente. */
export async function recordSyncSourceRun(source: OfferSource, at: Date = new Date()): Promise<void> {
  await withDb((db) =>
    db.syncSourceConfig.upsert({
      where: { source },
      update: { lastRunAt: at },
      create: { source, lastRunAt: at, intervalMinutes: DEFAULT_INTERVAL_MINUTES, enabled: false },
    })
  );
}

/** ¿Ha pasado ya el intervalo configurado desde la última ejecución (o nunca se ha ejecutado)? Solo es "true" si además está `enabled`. */
export function isSyncDue(config: SyncSourceConfigRow, now: Date = new Date()): boolean {
  if (!config.enabled) return false;
  if (!config.lastRunAt) return true;
  const elapsedMinutes = (now.getTime() - config.lastRunAt.getTime()) / 60_000;
  return elapsedMinutes >= config.intervalMinutes;
}
