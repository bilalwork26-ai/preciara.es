import { withDb } from "@/server/db/client";

export type PriceSnapshotRow = {
  price: number;
  recordedAt: Date;
};

/** Historial de precios de una oferta, ordenado cronológicamente. */
export async function getPriceHistoryForOffer(offerId: number, sinceMonths?: number): Promise<PriceSnapshotRow[] | null> {
  const since = sinceMonths ? new Date(Date.now() - sinceMonths * 30 * 86_400_000) : undefined;
  const result = await withDb((db) =>
    db.priceSnapshot.findMany({
      where: { offerId, ...(since ? { recordedAt: { gte: since } } : {}) },
      orderBy: { recordedAt: "asc" },
      select: { price: true, recordedAt: true },
    })
  );
  if (!result.ok) return null;
  return result.data.map((s) => ({ price: s.price.toNumber(), recordedAt: s.recordedAt }));
}
