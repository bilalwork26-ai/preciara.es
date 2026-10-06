import type { PrismaClient } from "@/generated/prisma";
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
      include: { merchant: { select: { id: true, slug: true, name: true, logoUrl: true } } },
      orderBy: { currentPrice: "asc" },
    },
  },
});

export type ProductWithOffers = Prisma.ProductGetPayload<typeof productWithOffers>;

/**
 * Orden global de "mejores chollos primero", calculado en SQL (no en JS
 * después de recortar con `take`) a propósito: con miles de productos, un
 * `ORDER BY id`/`name` + `LIMIT` de toda la vida decidiría qué productos
 * entran en el recorte por su orden de inserción o alfabético, dejando
 * fuera chollos reales que simplemente tengan un id alto o un nombre que
 * empieza por Z — el ranking tiene que decidir QUÉ entra, no solo cómo se
 * ve ya recortado. Tres niveles, en este orden:
 *   1. Tiene una oferta activa con descuento real (`previousPrice` >
 *      `currentPrice` en ALGUNA de sus ofertas activas).
 *   2. Mayor % de descuento entre esas ofertas (descendente).
 *   3. Más recientemente actualizado (`Product.updatedAt` descendente) —
 *      desempata tanto entre descuentos iguales como entre productos sin
 *      descuento, y no exige ningún campo extra: `applyNormalizedOfferRow`
 *      (`catalogSync/applyOffer.ts`) ya toca `Product.updatedAt` en cada
 *      resincronización de una oferta existente, así que refleja "visto
 *      más recientemente" sin cambios en el importador.
 * Devuelve solo los ids, en el orden final: quien llama hidrata las filas
 * completas (con ofertas/comercio incluidos) y las reordena según esta
 * lista — así el resto del código (colapsado de variantes, deduplicación
 * por comercio...) no cambia ni una línea.
 *
 * Los filtros opcionales (categoría, texto) se pasan como parámetros
 * simples (`NULL` cuando no aplican) en vez de componer la consulta con
 * fragmentos `Prisma.sql`/`Prisma.empty` interpolados dentro de este mismo
 * `$queryRaw`: bajo el bundler de Next.js (Turbopack y Webpack, confirmado
 * en ambos) ese patrón devolvía en producción/desarrollo un error de
 * sintaxis SQL real (`?` literal donde debía ir el fragmento vacío), lo
 * que hacía fallar SIEMPRE esta consulta y caer al catálogo de
 * demostración — la causa real, no una caché de Next.js, del catálogo
 * "viejo" que se seguía viendo en producción tras cada despliegue. Por el
 * mismo motivo, `requireActiveOffer` (abajo) tampoco compone un fragmento
 * `INNER`/`LEFT JOIN` condicional dentro de una sola plantilla: son dos
 * consultas completas, literales, elegidas con un `if` normal de TypeScript.
 *
 * `requireActiveOffer` decide si un producto SIN ninguna oferta activa
 * ahora mismo entra o no en el resultado:
 *   - `true` (por defecto — `/buscar` y el resto de usos): INNER JOIN con
 *     `offers`, igual que siempre. Sin oferta activa, no hay precio que
 *     mostrar ni tienda a la que enlazar, así que el producto no aparece.
 *   - `false` (solo `/categoria/[slug]`, ver `getCategoryDetail`): LEFT
 *     JOIN — el catálogo COMPLETO de la categoría, tenga o no oferta
 *     activa ahora mismo. Los que sí tienen descuento siguen ordenados
 *     primero (mismo criterio de abajo); el resto, por actualización más
 *     reciente. Un producto sin ninguna oferta llega con `offers: []` tras
 *     `hydrateRankedProducts` (mismo `include` de siempre) — la UI ya sabe
 *     tratar ese caso sin precio/tienda que mostrar (ver `CategoryProductCard`).
 */
async function getRankedProductIds(
  db: PrismaClient,
  {
    limit,
    categoryId,
    query,
    requireActiveOffer = true,
  }: { limit: number; categoryId?: number; query?: string; requireActiveOffer?: boolean }
): Promise<number[]> {
  const categoryFilter = categoryId ?? null;
  const nameFilter = query ? `%${query}%` : null;

  if (requireActiveOffer) {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM products p
      INNER JOIN offers o ON o.productId = p.id AND o.isActive = true AND o.isDemo = false
      INNER JOIN merchants m ON m.id = o.merchantId AND m.isActive = true AND m.isDemo = false
      WHERE p.isActive = true AND p.isDemo = false
        AND (${categoryFilter} IS NULL OR p.categoryId = ${categoryFilter})
        AND (${nameFilter} IS NULL OR p.name LIKE ${nameFilter})
      GROUP BY p.id
      ORDER BY
        MAX(CASE WHEN o.previousPrice IS NOT NULL AND o.previousPrice > o.currentPrice THEN 1 ELSE 0 END) DESC,
        MAX(CASE WHEN o.previousPrice IS NOT NULL AND o.previousPrice > o.currentPrice
                 THEN (o.previousPrice - o.currentPrice) / o.previousPrice ELSE 0 END) DESC,
        p.updatedAt DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => row.id);
  }

  const rows = await db.$queryRaw<{ id: number }[]>`
    SELECT p.id
    FROM products p
    LEFT JOIN offers o ON o.productId = p.id AND o.isActive = true AND o.isDemo = false
    LEFT JOIN merchants m ON m.id = o.merchantId AND m.isActive = true AND m.isDemo = false
    WHERE p.isActive = true AND p.isDemo = false
      AND (${categoryFilter} IS NULL OR p.categoryId = ${categoryFilter})
      AND (${nameFilter} IS NULL OR p.name LIKE ${nameFilter})
    GROUP BY p.id
    ORDER BY
      MAX(CASE WHEN o.previousPrice IS NOT NULL AND o.previousPrice > o.currentPrice THEN 1 ELSE 0 END) DESC,
      MAX(CASE WHEN o.previousPrice IS NOT NULL AND o.previousPrice > o.currentPrice
               THEN (o.previousPrice - o.currentPrice) / o.previousPrice ELSE 0 END) DESC,
      p.updatedAt DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}

/** Hidrata una lista de ids de producto (ya rankeados) a filas completas, preservando ese mismo orden — `findMany({ where: { id: { in } } })` no lo garantiza por sí solo. */
async function hydrateRankedProducts(db: PrismaClient, ids: number[]): Promise<ProductWithOffers[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids } }, ...productWithOffers });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ProductWithOffers => row !== undefined);
}

/**
 * Productos activos con al menos una oferta activa, con sus ofertas y el
 * comercio de cada una ya incluidos (una sola consulta de hidratación, sin
 * N+1). Se usan para "destacados" y para la cuadrícula de bajadas: quien
 * llama decide el recorte final. Orden de "mejores chollos primero" (ver
 * `getRankedProductIds`).
 */
export async function getActiveProductsWithOffers(limit = 60): Promise<ProductWithOffers[] | null> {
  const result = await withDb(async (db) => {
    const ids = await getRankedProductIds(db, { limit });
    return hydrateRankedProducts(db, ids);
  });
  return result.ok ? result.data : null;
}

/**
 * Mismo criterio de "indexable" que el resto de este fichero (activo, no
 * demo, con al menos una oferta activa no demo de un comercio activo no
 * demo) — un producto sin ninguna oferta activa nunca debe estar en el
 * sitemap: `getProductDetail` lo trata como 404 real (ver
 * `src/app/(site)/producto/[slug]/page.tsx`), así que listarlo ahí
 * mandaría a Google a una URL que no resuelve.
 */
const indexableProductWhere = {
  isActive: true,
  isDemo: false,
  offers: { some: { isActive: true, isDemo: false, merchant: { isActive: true, isDemo: false } } },
} as const;

/** Nº total de productos indexables — para decidir cuántas páginas de sitemap hacen falta (ver `src/app/(site)/producto/sitemap.ts`). `null` = BD no disponible. */
export async function getActiveProductSitemapCount(): Promise<number | null> {
  const result = await withDb((db) => db.product.count({ where: indexableProductWhere }));
  return result.ok ? result.data : null;
}

export type ProductSitemapEntry = { slug: string; updatedAt: Date };

/**
 * Una página de productos indexables (slug + fecha de actualización,
 * nada más — el sitemap no necesita ofertas ni categoría), ordenados por
 * `id` ascendente: orden estable entre páginas consecutivas, imprescindible
 * para que `offset`/`limit` no se salten ni dupliquen productos entre una
 * petición y la siguiente aunque el catálogo cambie entre medias.
 */
export async function getActiveProductSitemapPage({
  offset,
  limit,
}: {
  offset: number;
  limit: number;
}): Promise<ProductSitemapEntry[] | null> {
  const result = await withDb((db) =>
    db.product.findMany({
      where: indexableProductWhere,
      orderBy: { id: "asc" },
      skip: offset,
      take: limit,
      select: { slug: true, updatedAt: true },
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

/**
 * Búsqueda simple por nombre (contiene, insensible a mayúsculas) y/o
 * categoría, para /buscar y /categoria/[slug]. Mismo orden de "mejores
 * chollos primero" que `getActiveProductsWithOffers` (ver
 * `getRankedProductIds`).
 *
 * `requireActiveOffer` (por defecto `true`, el comportamiento de siempre
 * para /buscar): `false` también incluye productos sin ninguna oferta
 * activa ahora mismo — usado SOLO por `getCategoryDetail` para servir el
 * catálogo completo de una categoría, no solo lo que tiene oferta. Ver el
 * comentario del mismo nombre en `getRankedProductIds`.
 */
export async function searchActiveProducts(params: {
  query?: string;
  categorySlug?: string;
  limit?: number;
  requireActiveOffer?: boolean;
}): Promise<ProductWithOffers[] | null> {
  const { query, categorySlug, limit = 60, requireActiveOffer = true } = params;
  const result = await withDb(async (db) => {
    let categoryId: number | undefined;
    if (categorySlug) {
      const category = await db.category.findUnique({ where: { slug: categorySlug }, select: { id: true } });
      if (!category) return [];
      categoryId = category.id;
    }
    const ids = await getRankedProductIds(db, { limit, categoryId, query, requireActiveOffer });
    return hydrateRankedProducts(db, ids);
  });
  return result.ok ? result.data : null;
}
