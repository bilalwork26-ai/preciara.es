import { prisma, isDatabaseConfigured } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";

export const DEFAULT_OFFER_STALE_AFTER_HOURS = 72;

/** Horas configuradas antes de considerar una oferta "vieja" (ver `.env.example`). */
export function getOfferStaleAfterHours(): number {
  const raw = process.env.OFFER_STALE_AFTER_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OFFER_STALE_AFTER_HOURS;
}

/**
 * Desactiva (no borra) las ofertas activas de una fuente cuya
 * `lastCheckedAt` supera `olderThanHours`, acotado opcionalmente a una
 * lista de comercios. Pensada para ejecutarse SOLO después de una
 * sincronización completa y correcta de esa misma fuente/comercios (nunca
 * tras una descarga fallida o parcial, que dejaría "viejas" ofertas que en
 * realidad seguían vigentes) — ver `src/server/catalogSync/syncRun.ts`.
 * Nunca toca ofertas de otras fuentes ni de otros comercios: una
 * sincronización de eBay nunca desactiva catálogo de Awin o del CSV, ni al
 * revés.
 */
export async function deactivateStaleOffersForSource(params: {
  source: OfferSource;
  /** Si se omite, se aplica a todos los comercios de esta fuente. */
  merchantIds?: number[];
  olderThanHours: number;
}): Promise<{ deactivated: number }> {
  if (!isDatabaseConfigured() || !prisma) {
    throw new Error("No hay una base de datos configurada (falta DATABASE_URL).");
  }
  const { source, merchantIds, olderThanHours } = params;
  const threshold = new Date(Date.now() - olderThanHours * 3_600_000);
  const result = await prisma.offer.updateMany({
    where: {
      isActive: true,
      source,
      ...(merchantIds ? { merchantId: { in: merchantIds } } : {}),
      lastCheckedAt: { lt: threshold },
    },
    data: { isActive: false },
  });
  return { deactivated: result.count };
}

/**
 * Compatibilidad con el flujo CLI histórico (`scripts/import-csv.ts
 * --deactivate-stale`, sin fuente ni comercios): equivale a acotar la
 * desactivación a `source: CSV` en todos sus comercios — el mismo alcance
 * que tenía este comando antes de que existiera el campo `source` (todas
 * las ofertas de entonces eran del importador CSV), así que no cambia
 * nada para quien ya lo usa. Ahora que pueden convivir ofertas de otras
 * fuentes, mantenerlo sin acotar habría hecho que este comando desactivara
 * también catálogo de Awin/eBay, que no le corresponde.
 */
export async function deactivateStaleOffers(olderThanHours: number): Promise<{ deactivated: number }> {
  return deactivateStaleOffersForSource({ source: OfferSource.CSV, olderThanHours });
}
