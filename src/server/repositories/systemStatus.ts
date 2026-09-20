import { isDatabaseConfigured, withDb } from "@/server/db/client";

export type SystemStatus = {
  databaseConfigured: boolean;
  databaseReachable: boolean;
  /** true si la portada está sirviendo el fallback de demostración (BD no configurada, caída, o vacía). */
  usingFallback: boolean;
  activeProducts: number;
  activeMerchants: number;
  activeOffers: number;
  demoOffers: number;
  realOffers: number;
  lastImportAt: Date | null;
};

/** Estado general del sistema para el panel técnico (y para decidir el fallback de la portada). */
export async function getSystemStatus(): Promise<SystemStatus> {
  const databaseConfigured = isDatabaseConfigured();
  if (!databaseConfigured) {
    return {
      databaseConfigured: false,
      databaseReachable: false,
      usingFallback: true,
      activeProducts: 0,
      activeMerchants: 0,
      activeOffers: 0,
      demoOffers: 0,
      realOffers: 0,
      lastImportAt: null,
    };
  }

  const result = await withDb(async (db) => {
    const [activeProducts, activeMerchants, activeOffers, demoOffers, realOffers, lastImport] = await Promise.all([
      db.product.count({ where: { isActive: true } }),
      db.merchant.count({ where: { isActive: true } }),
      db.offer.count({ where: { isActive: true } }),
      db.offer.count({ where: { isActive: true, isDemo: true } }),
      db.offer.count({ where: { isActive: true, isDemo: false } }),
      db.importRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    ]);
    return { activeProducts, activeMerchants, activeOffers, demoOffers, realOffers, lastImportAt: lastImport?.startedAt ?? null };
  });

  if (!result.ok) {
    return {
      databaseConfigured: true,
      databaseReachable: false,
      usingFallback: true,
      activeProducts: 0,
      activeMerchants: 0,
      activeOffers: 0,
      demoOffers: 0,
      realOffers: 0,
      lastImportAt: null,
    };
  }

  return {
    databaseConfigured: true,
    databaseReachable: true,
    // La portada y el buscador solo leen de la base cuando hay catálogo
    // REAL suficiente (ver src/server/dataSource/*): una base con ofertas
    // solo de demostración (p. ej. isDemo=true del seed, o de un CSV de
    // ejemplo importado por error) cuenta como "sin catálogo real todavía"
    // y debe mostrar el mismo fallback aprobado, nunca los datos demo como
    // si fueran reales.
    usingFallback: result.data.realOffers === 0,
    ...result.data,
  };
}
