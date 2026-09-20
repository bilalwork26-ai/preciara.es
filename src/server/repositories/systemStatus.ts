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
    // "Vacía" = sin ninguna oferta activa (ni siquiera demo). En cuanto hay
    // filas (aunque sean del seed de demostración) la portada ya lee de la
    // base de datos: el contenido es idéntico al fallback, pero demuestra
    // que el circuito BD -> repositorios -> componentes funciona de verdad.
    usingFallback: result.data.activeOffers === 0,
    ...result.data,
  };
}
