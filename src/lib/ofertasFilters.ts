/**
 * Filtrado por categoría/tienda de `/supergangas` — lógica pura, sin
 * React ni DOM, para poder probarla aparte (mismo patrón que
 * `productType.ts`/`favorites.ts`). El componente (`OfertasCatalog.tsx`)
 * solo la envuelve en `useState`/JSX.
 */
import type { Merchant, Product } from "@/types";
import { ALL_SUBCATEGORY_RULES } from "./productType";

/** Valor del filtro que significa "sin filtrar" (las dos categorías: categoría y tienda). */
export const ALL_FILTER_VALUE = "todas";

export type FilterOption = { value: string; label: string };

// Marcas diacríticas combinantes (tildes, diéresis...) tras normalizar a NFD
// — mismo patrón que `normalizeForSearch` en `server/dataSource/search.ts`
// (no se importa de ahí: ese fichero tira de los repositorios de BD y no es
// seguro de incluir en el bundle de cliente de OfertasCatalog.tsx).
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

/** Insensible a mayúsculas y a tildes: "Batería" y "bateria" deben coincidir igual. */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

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
 * Términos adicionales a considerar coincidencia cuando `normalizedQuery`
 * reconoce una subcategoría conocida de `productType.ts` (misma
 * taxonomía que las pestañas de /categoria/[slug], reutilizada aquí como
 * vocabulario de sinónimos — ver el comentario de `ALL_SUBCATEGORY_RULES`):
 * una regla "se activa" si la query coincide (en cualquier dirección, para
 * cubrir singular/plural: "zapatillas" ⊃ "zapatilla") con su etiqueta o con
 * alguna de sus palabras clave, y entonces TODAS sus palabras clave pasan a
 * contar como coincidencia válida — así "zapatillas" también encuentra
 * "Bota de fútbol" (ambas en la regla "Zapatillas y calzado"), no solo los
 * productos que contienen literalmente "zapatillas".
 *
 * Límite real, no resuelto aquí: un modelo sin ninguna palabra de categoría
 * en su propio nombre (p. ej. "Adidas Ultraboost") no se puede enlazar con
 * "zapatillas" por este camino — haría falta el texto de
 * categoría/subcategoría que ya trae el feed del comercio (hoy
 * `categoryMapping.ts` lo reduce a la categoría principal de Preciara y
 * descarta el resto) o un diccionario de modelos mantenido a mano; ninguno
 * de los dos existe todavía.
 */
export function expandSearchSynonyms(normalizedQuery: string): string[] {
  if (!normalizedQuery) return [];
  const terms = new Set<string>();
  for (const rule of ALL_SUBCATEGORY_RULES) {
    const normalizedLabel = normalizeForSearch(rule.label);
    const matchesLabel = normalizedLabel.includes(normalizedQuery) || normalizedQuery.includes(normalizedLabel);
    const matchesKeyword = (rule.keywords ?? []).some((keyword) => {
      const normalizedKeyword = normalizeForSearch(keyword);
      return normalizedKeyword.includes(normalizedQuery) || normalizedQuery.includes(normalizedKeyword);
    });
    if (matchesLabel || matchesKeyword) {
      for (const keyword of rule.keywords ?? []) terms.add(normalizeForSearch(keyword));
    }
  }
  return [...terms];
}

/**
 * Filtra `products` por categoría, tienda y/o texto libre. `ALL_FILTER_VALUE`
 * en categoría/tienda, o `query` vacía (tras recortar espacios), significa
 * "no filtrar por ese criterio" — los tres filtros se combinan con Y, nunca
 * con O.
 *
 * La búsqueda por texto es multicampo (nombre + descripción, cuando
 * exista — ver el comentario de `description` en `src/types/index.ts`) y
 * conceptual: además de la coincidencia literal, expande la query a
 * palabras equivalentes de la misma subcategoría (ver
 * `expandSearchSynonyms`), así "zapatillas" encuentra también "Bota de
 * fútbol" o "Sneakers urbanas", no solo el texto exacto.
 */
export function filterOfertas(
  products: readonly Product[],
  { categoryId, merchantId, query = "" }: { categoryId: string; merchantId: string; query?: string }
): Product[] {
  const normalizedQuery = normalizeForSearch(query.trim());
  const synonymTerms = expandSearchSynonyms(normalizedQuery);
  return products.filter((product) => {
    if (categoryId !== ALL_FILTER_VALUE && product.categoryId !== categoryId) return false;
    if (merchantId !== ALL_FILTER_VALUE && bestOfferMerchantId(product) !== merchantId) return false;
    if (normalizedQuery) {
      const searchableText = normalizeForSearch(`${product.name} ${product.description ?? ""}`);
      const matchesDirectly = searchableText.includes(normalizedQuery);
      const matchesSynonym = synonymTerms.some((term) => searchableText.includes(term));
      if (!matchesDirectly && !matchesSynonym) return false;
    }
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
