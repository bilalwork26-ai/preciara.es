import { withDb } from "@/server/db/client";

export type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
};

/** Categorías activas, ordenadas alfabéticamente. `null` = BD no disponible (configurar o error, ya registrado). */
export async function getActiveCategories(): Promise<CategoryRow[] | null> {
  const result = await withDb((db) =>
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, description: true },
    })
  );
  return result.ok ? result.data : null;
}
