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
