/**
 * Datos de la portada: un puñado de funciones, cada una con una sola
 * responsabilidad, todas pasando por `resolveWithFallback`. `src/app/(site)/page.tsx`
 * las llama en paralelo (Promise.all) para que la portada entera dispare
 * un número pequeño y fijo de consultas (hoy: 2), nunca una por
 * componente ni una por producto.
 */
import { demoDealsGrid } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import type { Category, Merchant, Product } from "@/types";
import { getActiveCategoriesWithOfferCounts } from "@/server/repositories/categories";
import { getActiveProductsWithOffers, type ProductWithOffers } from "@/server/repositories/products";
import { resolveWithFallback, type SourcedResult } from "./withFallback";
import { getDemoCategoriesWithProductCounts } from "./category";
import { extractMerchants, toLegacyCategory, toLegacyProduct } from "./transform";

/**
 * Curación histórica: este producto tenía su propio banner secundario en
 * la portada (ya retirado, sustituido por el hero estático único, ver
 * Hero.tsx) y por eso se excluye de la cuadrícula de bajadas, igual que
 * hace hoy `demoDealsGrid` con el producto de demo equivalente — se
 * mantiene la exclusión para no cambiar el catálogo que la cuadrícula
 * muestra hoy sin que se haya pedido.
 */
const SECONDARY_BANNER_PRODUCT_SLUG = "portatil-14-16gb-512gb";

/** Máximo de categorías que la portada muestra en escritorio (ver CategoryRow). */
export const HOME_CATEGORIES_LIMIT = 8;

export type HomeCategoriesBundle = {
  categories: Category[];
  /** true si hay más categorías con ofertas activas que las mostradas aquí (activa el enlace "Ver todas"). */
  hasMore: boolean;
};

export async function getHomeCategories(): Promise<SourcedResult<HomeCategoriesBundle>> {
  return resolveWithFallback<HomeCategoriesBundle>({
    fetchFromDb: async () => {
      const rows = await getActiveCategoriesWithOfferCounts();
      if (!rows) return null;
      return {
        categories: rows.slice(0, HOME_CATEGORIES_LIMIT).map(toLegacyCategory),
        hasMore: rows.length > HOME_CATEGORIES_LIMIT,
      };
    },
    demoFallback: (() => {
      // Solo categorías demo con al menos un producto demo real: las que no
      // tienen ninguno (ver getDemoCategoriesWithProductCounts) enlazarían a
      // un `/categoria/[slug]` que responde 404 — nunca se navega hacia una
      // ruta que no existe de verdad.
      const demoCategoriesWithProducts = getDemoCategoriesWithProductCounts();
      return {
        categories: demoCategoriesWithProducts.slice(0, HOME_CATEGORIES_LIMIT),
        hasMore: demoCategoriesWithProducts.length > HOME_CATEGORIES_LIMIT,
      };
    })(),
    isSufficient: (bundle) => bundle.categories.length > 0,
  });
}

/** Máximo de tarjetas que muestra "Bajadas destacadas". */
const DEALS_GRID_LIMIT = 24;

/**
 * Cuántas filas se piden a la BD antes de deduplicar/diversificar
 * (bastante más que `DEALS_GRID_LIMIT`): con un catálogo donde varias
 * filas son variantes de talla/color del mismo modelo (ver
 * `dealsGridGroupKey` más abajo), pedir solo `DEALS_GRID_LIMIT` filas
 * podría dejar la cuadrícula con muy pocos productos distintos aunque el
 * catálogo real tenga más variedad más adelante en el orden de `id`.
 */
const DEALS_GRID_POOL_SIZE = 200;

/**
 * Clave de agrupación para no repetir el mismo modelo en varias tarjetas:
 * quita del nombre cualquier token que tenga forma de talla y normaliza
 * espacios/mayúsculas. Cuatro formas de talla confirmadas en el catálogo
 * real de Awin:
 *   - rango numérico: "23-34" ("... 23-34 Black Mujer" / "... 24-30 Black Mujer")
 *   - número con fracción: "37 1/3", "42 2/3" ("ZAPATILLA HANDBALL SPEZIAL 37 1/3" / "... 42 2/3")
 *   - talla suelta de zapatilla/ropa EU: "42" — combinada con el nombre
 *     de color, nunca confunde el color con la talla: "38 2/3 Cloud
 *     White" y "42 Cloud White" dan la misma clave ("... Pureboost 5
 *     Running 38 2/3 Cloud White" / "... Pureboost 5 Running 42 Cloud
 *     White" → la misma "Pureboost 5 Running cloud white")
 *   - talla por letra, con prefijo numérico opcional: "XS", "S", "M", "L",
 *     "XL", "XXL", "2XL", "3XL"... ("... XS Maroon" / "... 2XL Maroon")
 * Es una heurística sobre el texto real que sirve Awin (no hay un campo
 * de "modelo base" ni de talla por separado en el feed) — nunca se
 * guarda, solo decide qué mostrar en "Bajadas destacadas". La talla
 * suelta de adulto (30-50) se quita siempre que aparece; un número de
 * modelo corto como el "5" de "Pureboost 5" nunca cae en ese rango, así
 * que no hace falta más cautela ahí. Las tallas infantiles/junior EU
 * (16-29 — caso real: "Zapatilla Tensaur Hook and Loop" en tallas 22 a
 * 27, seis tarjetas idénticas del mismo modelo en la parrilla) SÍ entran
 * en el mismo rango que usan bastantes nombres de modelo con un año o
 * versión al final ("Ultraboost 22"), así que solo se quitan cuando les
 * sigue más texto (color, género...) — el patrón real de Awin para
 * tallas sueltas ("42 Cloud White Hombre") siempre trae algo detrás; un
 * número de modelo al final del nombre, sin nada después, nunca se toca.
 */
export function dealsGridGroupKey(product: Pick<ProductWithOffers, "name">): string {
  return product.name
    .replace(/\b\d{1,3}-\d{1,3}\b/g, "")
    .replace(/\b\d{1,2}\s+\d\/\d\b/g, "")
    .replace(/\b(?:3\d|4\d|50)\b/g, "")
    .replace(/\b(?:1[6-9]|2\d)\b(?=\s)/g, "")
    .replace(/\b\d{0,2}X{0,3}(?:S|M|L)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Mayor descuento relativo (%) entre las ofertas activas del producto; 0 si ninguna tiene `previousPrice`. */
export function bestDiscountPercent(product: ProductWithOffers): number {
  let max = 0;
  for (const offer of product.offers) {
    if (!offer.previousPrice) continue;
    const previous = offer.previousPrice.toNumber();
    if (previous <= 0) continue;
    const percent = ((previous - offer.currentPrice.toNumber()) / previous) * 100;
    if (percent > max) max = percent;
  }
  return max;
}

/**
 * Deduplica por `dealsGridGroupKey`, quedándose con la variante de mayor
 * descuento relativo de cada grupo — nunca dos tarjetas de la misma
 * prenda en distinta talla/color. Reutilizado por `selectDiverseDeals`
 * (portada) y también, directamente, por `/categoria/[slug]` y `/buscar`
 * (`category.ts`/`search.ts`): esos dos listados no necesitan el reparto
 * por categoría ni el límite de abajo (muestran TODO el catálogo
 * filtrado, no un top acotado), pero sí el mismo criterio de "una sola
 * tarjeta por modelo" — repetirlo ahí sería el mismo bug de variantes
 * duplicadas que esta función ya resuelve aquí.
 *
 * El resultado se reordena por `compareByDealRank` antes de devolverlo a
 * propósito: `Map.set` sobre una clave YA existente actualiza el valor
 * pero conserva la posición de inserción ORIGINAL (la de la primera
 * variante vista de ese grupo, no la de la variante ganadora que
 * finalmente se muestra) — sin este reordenado final, `/categoria/[slug]`
 * y `/buscar` (que no vuelven a ordenar el resultado de esta función)
 * podían mostrar productos sin descuento por delante de otros con un
 * descuento real, simplemente porque su grupo se vio antes en el orden
 * de llegada. `selectDiverseDeals` ya reordenaba el suyo al final por su
 * cuenta, pero corregirlo aquí, en el origen, evita depender de que cada
 * consumidor futuro se acuerde de hacerlo también.
 */
export function collapseProductVariants(products: ProductWithOffers[]): ProductWithOffers[] {
  const bestPerGroup = new Map<string, ProductWithOffers>();
  for (const product of products) {
    const key = dealsGridGroupKey(product);
    const current = bestPerGroup.get(key);
    if (!current || bestDiscountPercent(product) > bestDiscountPercent(current)) {
      bestPerGroup.set(key, product);
    }
  }
  return [...bestPerGroup.values()].sort(compareByDealRank);
}

/**
 * Elige como máximo `limit` productos para "Bajadas destacadas":
 * 1. Deduplica variantes con `collapseProductVariants` (ver arriba).
 * 2. Reparte el resultado entre categorías distintas (ronda por
 *    categoría, cada una ordenada por descuento relativo descendente),
 *    para no llenar la cuadrícula con un único tipo de producto aunque
 *    hoy solo haya un anunciante real aprobado.
 * 3. Con el conjunto diverso ya decidido, lo reordena antes de
 *    devolverlo: el reparto por categoría de arriba decide QUÉ productos
 *    entran, pero el orden final que ve la persona (y en particular la
 *    primera tarjeta, destacada en la portada — ver `VerifiedDealsGrid`)
 *    siempre sigue la regla global de "mejores chollos primero" — mayor
 *    descuento relativo descendente y, entre descuentos iguales (o sin
 *    descuento), el producto actualizado más recientemente — nunca el
 *    orden de intercalado por categoría. Mismo criterio, y mismo motivo
 *    (que funcione igual de bien con miles de productos), que el ranking
 *    en SQL de `getRankedProductIds` (`server/repositories/products.ts`).
 */
function compareByDealRank(a: ProductWithOffers, b: ProductWithOffers): number {
  return bestDiscountPercent(b) - bestDiscountPercent(a) || b.updatedAt.getTime() - a.updatedAt.getTime();
}

export function selectDiverseDeals(products: ProductWithOffers[], limit: number): ProductWithOffers[] {
  const byCategory = new Map<number, ProductWithOffers[]>();
  for (const product of collapseProductVariants(products)) {
    const list = byCategory.get(product.categoryId) ?? [];
    list.push(product);
    byCategory.set(product.categoryId, list);
  }
  const categoryLists = [...byCategory.values()];
  for (const list of categoryLists) {
    list.sort(compareByDealRank);
  }

  const result: ProductWithOffers[] = [];
  for (let round = 0; result.length < limit && categoryLists.some((list) => round < list.length); round++) {
    for (const list of categoryLists) {
      if (result.length >= limit) break;
      if (round < list.length) result.push(list[round]);
    }
  }
  result.sort(compareByDealRank);
  return result;
}

export type DealsGridBundle = { products: Product[]; merchants: Merchant[] };

export async function getDealsGridBundle(): Promise<SourcedResult<DealsGridBundle>> {
  return resolveWithFallback({
    fetchFromDb: async () => {
      const rows = await getActiveProductsWithOffers(DEALS_GRID_POOL_SIZE);
      if (!rows) return null;
      const filtered = rows.filter((p) => p.slug !== SECONDARY_BANNER_PRODUCT_SLUG);
      const selected = selectDiverseDeals(filtered, DEALS_GRID_LIMIT);
      const products = selected.map((p) => toLegacyProduct(p));
      return { products, merchants: extractMerchants(selected) };
    },
    demoFallback: { products: demoDealsGrid, merchants: demoMerchants },
    isSufficient: (bundle) => bundle.products.length > 0,
  });
}
