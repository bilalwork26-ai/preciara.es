import { withDb } from "@/server/db/client";

export type StaleOfferRow = {
  id: number;
  productName: string;
  merchantName: string;
  currentPrice: number;
  lastCheckedAt: Date;
};

/**
 * Ofertas activas cuya `lastCheckedAt` es más antigua que `olderThanHours`
 * horas: candidatas a revisar o desactivar. No las desactiva; solo las
 * detecta (la desactivación automática queda para el runner programado,
 * ver `scripts/import-csv.ts` y `OFFER_STALE_AFTER_HOURS`).
 */
export async function getStaleOffers(olderThanHours: number, limit = 100): Promise<StaleOfferRow[] | null> {
  const threshold = new Date(Date.now() - olderThanHours * 3_600_000);
  const result = await withDb((db) =>
    db.offer.findMany({
      where: { isActive: true, lastCheckedAt: { lt: threshold } },
      include: {
        product: { select: { name: true } },
        merchant: { select: { name: true } },
      },
      orderBy: { lastCheckedAt: "asc" },
      take: limit,
    })
  );
  if (!result.ok) return null;
  return result.data.map((o) => ({
    id: o.id,
    productName: o.product.name,
    merchantName: o.merchant.name,
    currentPrice: o.currentPrice.toNumber(),
    lastCheckedAt: o.lastCheckedAt,
  }));
}

export type RecentPriceChangeRow = {
  offerId: number;
  productName: string;
  merchantName: string;
  previousPrice: number | null;
  currentPrice: number;
  updatedAt: Date;
};

/** Ofertas cuyo precio cambió más recientemente (para el panel técnico). */
export async function getRecentPriceChanges(limit = 20): Promise<RecentPriceChangeRow[] | null> {
  const result = await withDb((db) =>
    db.offer.findMany({
      where: { isActive: true, previousPrice: { not: null } },
      include: {
        product: { select: { name: true } },
        merchant: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    })
  );
  if (!result.ok) return null;
  return result.data.map((o) => ({
    offerId: o.id,
    productName: o.product.name,
    merchantName: o.merchant.name,
    previousPrice: o.previousPrice ? o.previousPrice.toNumber() : null,
    currentPrice: o.currentPrice.toNumber(),
    updatedAt: o.updatedAt,
  }));
}
