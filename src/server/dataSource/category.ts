/**
 * Datos de la ficha de una categoría (`/categoria/[slug]`). Mismo patrón
 * que `product.ts`: distingue "no existe" (404) de "servir demo", en vez
 * de usar `resolveWithFallback` (pensado para listados que SIEMPRE deben
 * responder algo, no para una página que puede no existir).
 */
import { demoCategories } from "@/data/demo/categories";
import { demoProducts } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import type { Category, Merchant, Product } from "@/types";
import { getActiveCategories, getActiveCategoriesWithOfferCounts } from "@/server/repositories/categories";
import { searchActiveProducts } from "@/server/repositories/products";
import { collapseProductVariants } from "./home";
import { extractMerchants, toLegacyCategory, toLegacyProduct } from "./transform";

/**
 * Tope de productos por categoría. A diferencia de `/supergangas`
 * (`selectAllOfertas`), esta página NUNCA exige descuento activo NI
 * siquiera que exista una oferta activa en absoluto: muestra el
 * catálogo COMPLETO de la categoría tal cual está en la tabla `Product`,
 * con o sin oferta/descuento en este momento (badge de % solo en los que
 * sí tienen descuento, precio/tienda solo en los que sí tienen alguna
 * oferta activa — ver `CategoryProductCard`). Se consigue pasando
 * `requireActiveOffer: false` a `searchActiveProducts`
 * (server/repositories/products.ts): ese flag cambia el INNER JOIN con
 * `offers` por un LEFT JOIN, así que un producto sin ninguna oferta
 * activa ahora mismo también entra (con `offers: []`) — ver el
 * comentario de `requireActiveOffer` en `getRankedProductIds` para el
 * motivo de no excluirlo.
 *
 * Tope bastante más alto que el de antes (60): con el filtro de oferta ya
 * quitado, una categoría puede tener muchos más productos en total que
 * antes con oferta activa — sigue siendo un tope técnico de seguridad
 * (una consulta nunca debe ser literalmente sin límite), no un recorte de
 * catálogo a propósito (mismo criterio que `OFERTAS_PAGE_POOL_SIZE` en
 * home.ts). `CategoryProductGrid` pagina en cliente sobre el resultado
 * completo (ver "Mostrar más" en ese componente), así que un tope alto
 * aquí no vuelca de golpe miles de tarjetas al DOM.
 */
export const CATEGORY_PRODUCTS_LIMIT = 2000;

export type CategoryDetailResult =
  | { status: "found"; source: "database" | "demo"; category: Category; products: Product[]; merchants: Merchant[] }
  | { status: "not-found" };

export async function getCategoryDetail(slug: string): Promise<CategoryDetailResult> {
  // `getActiveCategories` (nunca `getActiveCategoriesWithOfferCounts` aquí
  // a propósito): esa otra función exige que la categoría tenga al menos
  // un producto CON oferta activa, el mismo requisito que ya se quitó más
  // abajo de `searchActiveProducts` — con ella, una categoría real cuyos
  // productos aún no tienen ninguna oferta activa (pero sí existen en la
  // tabla Product) seguiría dando 404 aunque el catálogo completo ya la
  // sirviera sin problema. `getActiveCategoriesWithOfferCounts` se sigue
  // usando tal cual en `getCategoriesIndex` (más abajo) y en sitemap.ts:
  // ahí sí es la curación correcta (categorías con algún chollo real para
  // destacar en navegación), una decisión aparte de "¿resuelve esta URL?".
  const dbCategories = await getActiveCategories();
  const dbMatch = dbCategories?.find((c) => c.slug === slug);

  if (dbMatch) {
    const productRows = await searchActiveProducts({
      categorySlug: slug,
      limit: CATEGORY_PRODUCTS_LIMIT,
      // Catálogo completo de la categoría, tenga o no oferta activa ahora
      // mismo — ver el comentario de CATEGORY_PRODUCTS_LIMIT arriba.
      requireActiveOffer: false,
    });
    if (productRows && productRows.length > 0) {
      return {
        status: "found",
        source: "database",
        category: toLegacyCategory(dbMatch),
        // Sin esto, varias tallas/colores del mismo modelo (mismo caso que
        // "Bajadas destacadas" en home.ts) saldrían como tarjetas
        // repetidas seguidas en la ficha de categoría.
        products: collapseProductVariants(productRows).map((p) => toLegacyProduct(p)),
        merchants: extractMerchants(productRows),
      };
    }
  }

  const demoCategory = demoCategories.find((c) => c.slug === slug);
  if (demoCategory) {
    const products = demoProducts.filter((p) => p.categoryId === demoCategory.id);
    if (products.length > 0) {
      return { status: "found", source: "demo", category: demoCategory, products, merchants: demoMerchants };
    }
  }

  return { status: "not-found" };
}

export type CategoriesIndexResult = {
  source: "database" | "demo";
  categories: (Category & { activeProductCount: number })[];
};

/**
 * Categorías de demostración que además tienen al menos un producto demo
 * real (`src/data/demo/products.ts` no cubre las 12 categorías de
 * `src/data/demo/categories.ts` — varias, p. ej. "Salud y cuidado" o
 * "Deporte", no tienen ningún producto demo asociado). `getCategoryDetail`
 * ya trata esas como "not-found" (404) por no tener productos, así que
 * ningún listado (portada, `/categorias`) debe enlazar a ellas: se
 * filtran aquí, en el único sitio que decide qué categorías demo son
 * "reales" a efectos de navegación, para no repetir este cálculo en cada
 * listado. Mismo criterio de orden que el lado de base de datos
 * (`getActiveCategoriesWithOfferCounts`): recuento descendente, luego
 * nombre.
 */
export function getDemoCategoriesWithProductCounts(): (Category & { activeProductCount: number })[] {
  const countByCategoryId = new Map<string, number>();
  for (const product of demoProducts) {
    countByCategoryId.set(product.categoryId, (countByCategoryId.get(product.categoryId) ?? 0) + 1);
  }
  return demoCategories
    .map((category) => ({ ...category, activeProductCount: countByCategoryId.get(category.id) ?? 0 }))
    .filter((category) => category.activeProductCount > 0)
    .sort((a, b) => b.activeProductCount - a.activeProductCount || a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

/** Listado completo (sin límite de 8) para `/categorias`. */
export async function getCategoriesIndex(): Promise<CategoriesIndexResult> {
  const dbCategories = await getActiveCategoriesWithOfferCounts();
  if (dbCategories && dbCategories.length > 0) {
    return {
      source: "database",
      categories: dbCategories.map((c) => ({ ...toLegacyCategory(c), activeProductCount: c.activeProductCount })),
    };
  }
  return { source: "demo", categories: getDemoCategoriesWithProductCounts() };
}
