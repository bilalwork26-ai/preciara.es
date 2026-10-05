import { withDb } from "@/server/db/client";

export type MerchantRow = {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
};

/**
 * TODOS los comercios reales activos (nunca demo), sin exigir que tengan
 * ninguna oferta activa ahora mismo — a diferencia de `extractMerchants`
 * (`server/dataSource/transform.ts`), que solo deduplica los comercios YA
 * presentes en un listado de productos ya filtrado (p. ej. solo los que
 * tienen descuento activo en Supergangas). Pensado para listados que deben
 * mostrar TODAS las tiendas asociadas de verdad (p. ej. el desplegable de
 * "Tienda" en /supergangas — requisito de negocio: nunca ocultar un
 * comercio real solo porque no tiene ningún descuento en este momento).
 * Orden alfabético, igual que el resto de desplegables de filtro.
 */
export async function getActiveMerchants(): Promise<MerchantRow[] | null> {
  const result = await withDb((db) =>
    db.merchant.findMany({
      where: { isActive: true, isDemo: false },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, logoUrl: true },
    })
  );
  return result.ok ? result.data : null;
}
