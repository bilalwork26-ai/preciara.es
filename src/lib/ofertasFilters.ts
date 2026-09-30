/**
 * Filtrado por categoría/tienda de `/supergangas` — lógica pura, sin
 * React ni DOM, para poder probarla aparte (mismo patrón que
 * `productType.ts`/`favorites.ts`). El componente (`OfertasCatalog.tsx`)
 * solo la envuelve en `useState`/JSX.
 */
import type { Merchant, Product } from "@/types";

/** Valor del filtro que significa "sin filtrar" (las dos categorías: categoría y tienda). */
export const ALL_FILTER_VALUE = "todas";

export type FilterOption = { value: string; label: string };

/**
 * Comercio de la oferta MÁS BARATA de `product` (mismo criterio "mejor
 * precio" que muestra `ProductDealCard`, para que filtrar por tienda
 * coincida con lo que la propia tarjeta dice — "Mejor precio en X").
 * `null` si el producto no tiene ninguna oferta (no debería ocurrir en
 * Supergangas, pero nunca lanza).
 */
export function bestOfferMerchantId(product: Product): string | null {
  const best = [...product.offers].sort((a, b) => a.price - b.price)[0];
  return best?.merchantId ?? null;
}

/**
 * Filtra `products` por categoría y/o tienda. `ALL_FILTER_VALUE` en
 * cualquiera de los dos significa "no filtrar por ese criterio" — los
 * dos filtros se combinan con Y (categoría Y tienda), nunca con O.
 */
export function filterOfertas(
  products: readonly Product[],
  { categoryId, merchantId }: { categoryId: string; merchantId: string }
): Product[] {
  return products.filter((product) => {
    if (categoryId !== ALL_FILTER_VALUE && product.categoryId !== categoryId) return false;
    if (merchantId !== ALL_FILTER_VALUE && bestOfferMerchantId(product) !== merchantId) return false;
    return true;
  });
}

/**
 * Opciones de categoría a ofrecer en el desplegable: SOLO categorías que
 * de verdad tienen al menos un producto en `products` (nunca una opción
 * que llevaría a un resultado vacío — mismo criterio de "nunca un enlace
 * a un listado vacío" que el resto del sitio), en orden alfabético.
 * `nameByCategoryId` traduce el `categoryId` de cada producto a un
 * nombre legible; si no hay traducción, se usa el propio id tal cual
 * (nunca se descarta la opción por no tener nombre bonito).
 */
export function availableCategoryOptions(products: readonly Product[], nameByCategoryId: Record<string, string>): FilterOption[] {
  const seen = new Map<string, FilterOption>();
  for (const product of products) {
    if (!seen.has(product.categoryId)) {
      seen.set(product.categoryId, { value: product.categoryId, label: nameByCategoryId[product.categoryId] ?? product.categoryId });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/** Mismo criterio que `availableCategoryOptions`, pero por tienda (ver `bestOfferMerchantId`). */
export function availableMerchantOptions(products: readonly Product[], merchants: readonly Merchant[]): FilterOption[] {
  const nameByMerchantId = new Map(merchants.map((m) => [m.id, m.name]));
  const seen = new Map<string, FilterOption>();
  for (const product of products) {
    const merchantId = bestOfferMerchantId(product);
    if (merchantId && !seen.has(merchantId)) {
      seen.set(merchantId, { value: merchantId, label: nameByMerchantId.get(merchantId) ?? merchantId });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}
