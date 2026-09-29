/**
 * Datos de la portada: un puñado de funciones, cada una con una sola
 * responsabilidad, todas pasando por `resolveWithFallback`. `src/app/(site)/page.tsx`
 * las llama en paralelo (Promise.all) para que la portada entera dispare
 * un número pequeño y fijo de consultas (hoy: 4), nunca una por
 * componente ni una por producto.
 */
import { demoDealsGrid, demoFeaturedProduct } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import type { Category, Merchant, Product } from "@/types";
import { getActiveCategoriesWithOfferCounts } from "@/server/repositories/categories";
import { getActiveProductsWithOffers, getProductBySlug, type ProductWithOffers } from "@/server/repositories/products";
import { getPriceHistoryForOffer } from "@/server/repositories/priceHistory";
import { resolveWithFallback, type SourcedResult } from "./withFallback";
import { getDemoCategoriesWithProductCounts } from "./category";
import { extractMerchants, toLegacyCategory, toLegacyProduct, toPricePoint } from "./transform";

/**
 * Slug del producto destacado del panel de comparación (`ComparisonPanel`,
 * ver page.tsx). Es un hueco curado a propósito, no "la mejor oferta de lo
 * que haya": así el panel nunca muestra una foto/copy que no corresponda
 * al producto cuyo precio está enseñando. Coincide con el slug del seed.
 * (El hero de la portada es estático y genérico — ver
 * `src/components/home/Hero.tsx` — nunca muestra el precio de un único
 * producto, precisamente para no ser engañoso al representar un catálogo
 * con muchos productos de muchas categorías.)
 */
const FEATURED_PRODUCT_SLUG = "auriculares-inalambricos-pro";

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

export type FeaturedBundle = { product: Product; merchants: Merchant[] };

export async function getFeaturedBundle(): Promise<SourcedResult<FeaturedBundle>> {
  return resolveWithFallback({
    fetchFromDb: async () => {
      const dbProduct = await getProductBySlug(FEATURED_PRODUCT_SLUG);
      if (!dbProduct) return null; // null = BD no disponible; undefined = no existe todavía -> ambos caen al fallback
      if (dbProduct.offers.length === 0) return null;

      const cheapest = [...dbProduct.offers].sort((a, b) => a.currentPrice.comparedTo(b.currentPrice))[0];
      const history = await getPriceHistoryForOffer(cheapest.id, 12);

      return {
        product: toLegacyProduct(dbProduct, (history ?? []).map(toPricePoint)),
        merchants: extractMerchants([dbProduct]),
      };
    },
    demoFallback: { product: demoFeaturedProduct, merchants: demoMerchants },
    isSufficient: (bundle) => bundle.product.offers.length > 0 && bundle.product.priceHistory.length > 0,
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
 * suelta solo se quita en el rango 30-50 (tallas EU de adulto habituales
 * en zapatilla/ropa) para no confundir un número de modelo corto como el
 * "5" de "Pureboost 5", que nunca cae en ese rango; un token de una
 * letra ("M"/"L") o un número de modelo real de dos cifras dentro de ese
 * rango podría, en teoría, quitarse por error — el riesgo se acepta a
 * propósito: es mucho menos grave que repetir la misma prenda en varias
 * tarjetas.
 */
export function dealsGridGroupKey(product: Pick<ProductWithOffers, "name">): string {
  return product.name
    .replace(/\b\d{1,3}-\d{1,3}\b/g, "")
    .replace(/\b\d{1,2}\s+\d\/\d\b/g, "")
    .replace(/\b(?:3\d|4\d|50)\b/g, "")
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
 * Elige como máximo `limit` productos para "Bajadas destacadas":
 * 1. Deduplica por `dealsGridGroupKey`, quedándose con la variante de
 *    mayor descuento relativo de cada grupo — nunca dos tarjetas de la
 *    misma prenda en distinta talla/color.
 * 2. Reparte el resultado entre categorías distintas (ronda por
 *    categoría, cada una ordenada por descuento relativo descendente),
 *    para no llenar la cuadrícula con un único tipo de producto aunque
 *    hoy solo haya un anunciante real aprobado.
 * 3. Con el conjunto diverso ya decidido, lo reordena por descuento
 *    relativo descendente antes de devolverlo: el reparto por categoría de
 *    arriba decide QUÉ productos entran, pero el orden final que ve la
 *    persona (y en particular la primera tarjeta, destacada en la
 *    portada — ver `VerifiedDealsGrid`) siempre refleja la bajada de
 *    precio real, nunca el orden de intercalado por categoría.
 */
export function selectDiverseDeals(products: ProductWithOffers[], limit: number): ProductWithOffers[] {
  const bestPerGroup = new Map<string, ProductWithOffers>();
  for (const product of products) {
    const key = dealsGridGroupKey(product);
    const current = bestPerGroup.get(key);
    if (!current || bestDiscountPercent(product) > bestDiscountPercent(current)) {
      bestPerGroup.set(key, product);
    }
  }

  const byCategory = new Map<number, ProductWithOffers[]>();
  for (const product of bestPerGroup.values()) {
    const list = byCategory.get(product.categoryId) ?? [];
    list.push(product);
    byCategory.set(product.categoryId, list);
  }
  const categoryLists = [...byCategory.values()];
  for (const list of categoryLists) {
    list.sort((a, b) => bestDiscountPercent(b) - bestDiscountPercent(a));
  }

  const result: ProductWithOffers[] = [];
  for (let round = 0; result.length < limit && categoryLists.some((list) => round < list.length); round++) {
    for (const list of categoryLists) {
      if (result.length >= limit) break;
      if (round < list.length) result.push(list[round]);
    }
  }
  result.sort((a, b) => bestDiscountPercent(b) - bestDiscountPercent(a));
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
