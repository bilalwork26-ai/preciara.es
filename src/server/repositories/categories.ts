import { withDb } from "@/server/db/client";

export type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
};

/**
 * Categorías activas, en orden de creación (`id` ascendente). No se ordena
 * por nombre a propósito: el orden de las categorías es una decisión de
 * curación (la primera es la que la fila de categorías marca como activa
 * por defecto), no alfabética, así que se respeta el orden en que se
 * crearon (el seed las crea en el mismo orden que `src/data/demo/categories.ts`).
 * `null` = BD no disponible (o error, ya registrado).
 */
export async function getActiveCategories(): Promise<CategoryRow[] | null> {
  const result = await withDb((db) =>
    db.category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, slug: true, name: true, description: true },
    })
  );
  return result.ok ? result.data : null;
}

export type CategoryWithOfferCount = CategoryRow & {
  /** Nº de productos activos (no demo) con al menos una oferta activa (no demo, comercio activo) en esta categoría. */
  activeProductCount: number;
};

/**
 * Categorías activas que además tienen al menos un producto real con al
 * menos una oferta activa — para la navegación automática de la portada
 * (nunca se muestra una categoría vacía o solo con catálogo inactivo/demo).
 * Ordenadas de forma determinista: primero por `activeProductCount`
 * descendente, luego por nombre (localizado, insensible a mayúsculas) para
 * desempatar. Dos únicas consultas (categorías + recuento agrupado por
 * `categoryId`), nunca una por categoría: sin N+1 aunque el catálogo crezca.
 */
export async function getActiveCategoriesWithOfferCounts(): Promise<CategoryWithOfferCount[] | null> {
  const result = await withDb(async (db) => {
    const [categories, counts] = await Promise.all([
      db.category.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true, description: true },
      }),
      db.product.groupBy({
        by: ["categoryId"],
        where: {
          isActive: true,
          isDemo: false,
          offers: { some: { isActive: true, isDemo: false, merchant: { isActive: true, isDemo: false } } },
        },
        _count: { _all: true },
      }),
    ]);

    const countByCategoryId = new Map(counts.map((c) => [c.categoryId, c._count._all]));

    return categories
      .map((category) => ({ ...category, activeProductCount: countByCategoryId.get(category.id) ?? 0 }))
      .filter((category) => category.activeProductCount > 0)
      .sort(
        (a, b) => b.activeProductCount - a.activeProductCount || a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
  });
  return result.ok ? result.data : null;
}
