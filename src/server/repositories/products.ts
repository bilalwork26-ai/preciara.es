import { withDb } from "@/server/db/client";
import { Prisma } from "@/generated/prisma";

/**
 * `isDemo: false` en la oferta y en el comercio: las funciones de este
 * fichero alimentan exclusivamente la capa pública
 * (`src/server/dataSource/*`), que nunca debe mostrar datos de
 * demostración como si fueran catálogo real. El panel técnico usa sus
 * propias consultas (`src/server/repositories/admin.ts`), sin este
 * filtro, para poder listar también lo demo con su etiqueta.
 */
const productWithOffers = Prisma.validator<Prisma.ProductDefaultArgs>()({
  include: {
    category: { select: { id: true, slug: true, name: true } },
    offers: {
      where: { isActive: true, isDemo: false, merchant: { isActive: true, isDemo: false } },
      include: { merchant: { select: { id: true, slug: true, name: true } } },
      orderBy: { currentPrice: "asc" },
    },
  },
});

export type ProductWithOffers = Prisma.ProductGetPayload<typeof productWithOffers>;

/**
 * Productos activos con al menos una oferta activa, con sus ofertas y el
 * comercio de cada una ya incluidos (una sola consulta, sin N+1). Se usan
 * para "destacados" y para la cuadrícula de bajadas: quien llama decide el
 * recorte final. Orden por `id` ascendente (orden de creación) a
 * propósito: es estable y predecible (no cambia cada vez que se actualiza
 * un precio, como pasaría con `updatedAt`), y coincide con el orden de
 * `src/data/demo/products.ts` para los datos sembrados por el seed.
 */
export async function getActiveProductsWithOffers(limit = 60): Promise<ProductWithOffers[] | null> {
  const result = await withDb((db) =>
    db.product.findMany({
      where: {
        isActive: true,
        isDemo: false,
        offers: { some: { isActive: true, isDemo: false, merchant: { isActive: true, isDemo: false } } },
      },
      ...productWithOffers,
      orderBy: { id: "asc" },
      take: limit,
    })
  );
  return result.ok ? result.data : null;
}

/** Un producto por slug, con sus ofertas activas incluidas. `undefined` = no existe; `null` = BD no disponible. */
export async function getProductBySlug(slug: string): Promise<ProductWithOffers | null | undefined> {
  const result = await withDb((db) =>
    db.product.findUnique({
      where: { slug },
      ...productWithOffers,
    })
  );
  if (!result.ok) return null;
  return result.data ?? undefined;
}

/** Búsqueda simple por nombre (contiene, insensible a mayúsculas) y/o categoría, para /buscar. */
export async function searchActiveProducts(params: {
  query?: string;
  categorySlug?: string;
  limit?: number;
}): Promise<ProductWithOffers[] | null> {
  const { query, categorySlug, limit = 60 } = params;
  const result = await withDb((db) =>
    db.product.findMany({
      where: {
        isActive: true,
        isDemo: false,
        offers: { some: { isActive: true, isDemo: false, merchant: { isActive: true, isDemo: false } } },
        ...(query ? { name: { contains: query } } : {}),
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      },
      ...productWithOffers,
      orderBy: { name: "asc" },
      take: limit,
    })
  );
  return result.ok ? result.data : null;
}
