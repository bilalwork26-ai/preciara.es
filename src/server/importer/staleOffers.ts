import { prisma, isDatabaseConfigured } from "@/server/db/client";

export const DEFAULT_OFFER_STALE_AFTER_HOURS = 72;

/** Horas configuradas antes de considerar una oferta "vieja" (ver `.env.example`). */
export function getOfferStaleAfterHours(): number {
  const raw = process.env.OFFER_STALE_AFTER_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OFFER_STALE_AFTER_HOURS;
}

/**
 * Desactiva (no borra) las ofertas activas cuya `lastCheckedAt` supera
 * `olderThanHours`. Pensada para ejecutarse desde el runner programado
 * (`scripts/import-csv.ts --deactivate-stale`), nunca automáticamente
 * dentro de una importación normal.
 */
export async function deactivateStaleOffers(olderThanHours: number): Promise<{ deactivated: number }> {
  if (!isDatabaseConfigured() || !prisma) {
    throw new Error("No hay una base de datos configurada (falta DATABASE_URL).");
  }
  const threshold = new Date(Date.now() - olderThanHours * 3_600_000);
  const result = await prisma.offer.updateMany({
    where: { isActive: true, lastCheckedAt: { lt: threshold } },
    data: { isActive: false },
  });
  return { deactivated: result.count };
}
