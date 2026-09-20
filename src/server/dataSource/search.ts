/**
 * Datos de /buscar: misma regla de fallback centralizada que la portada.
 * La normalización de tildes/mayúsculas para el fallback demo vive en la
 * propia página (ya la tenía); aquí solo se añade la ruta de base de
 * datos, que delega la coincidencia en la collation `utf8mb4_unicode_ci`
 * de MySQL (insensible a mayúsculas y a tildes de forma nativa).
 */
import { demoCategories } from "@/data/demo/categories";
import { demoProducts } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import type { Category, Merchant, Product } from "@/types";
import { getActiveCategories } from "@/server/repositories/categories";
import { searchActiveProducts } from "@/server/repositories/products";
import { resolveWithFallback, type SourcedResult } from "./withFallback";
import { extractMerchants, toLegacyCategory, toLegacyProduct } from "./transform";

export const SEARCH_QUERY_MAX_LENGTH = 200;
export const SEARCH_RESULTS_LIMIT = 60;

/** Recorta y limita la query de búsqueda a un tamaño razonable; nunca confía en la entrada del visitante sin acotarla. */
export function sanitizeSearchQuery(raw: string): string {
  return raw.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
}

// Marcas diacríticas combinantes (tildes, diéresis...) tras normalizar a NFD.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

export type SearchBundle = { products: Product[]; categories: Category[]; merchants: Merchant[] };

export async function searchHomeProducts(params: { query: string; categorySlug: string }): Promise<SourcedResult<SearchBundle>> {
  const query = sanitizeSearchQuery(params.query);
  const categorySlug = params.categorySlug.trim().slice(0, 100);

  const demoCategory = demoCategories.find((c) => c.slug === categorySlug);
  const demoResults = demoProducts.filter((product) => {
    const matchesQuery = query ? normalizeForSearch(product.name).includes(normalizeForSearch(query)) : true;
    const matchesCategory = demoCategory ? product.categoryId === demoCategory.id : true;
    return matchesQuery && matchesCategory;
  });

  return resolveWithFallback({
    fetchFromDb: async () => {
      const [categoryRows, productRows] = await Promise.all([
        getActiveCategories(),
        searchActiveProducts({ query: query || undefined, categorySlug: categorySlug || undefined, limit: SEARCH_RESULTS_LIMIT }),
      ]);
      if (!categoryRows || !productRows) return null;
      return {
        products: productRows.map((p) => toLegacyProduct(p)),
        categories: categoryRows.map(toLegacyCategory),
        merchants: extractMerchants(productRows),
      };
    },
    demoFallback: { products: demoResults, categories: demoCategories, merchants: demoMerchants },
    // "Suficiente" distingue dos vacíos muy distintos: (a) sin filtro y
    // catálogo real todavía vacío -> haría falta un listado en blanco, así
    // que se usa demo; (b) con filtro (query o categoría) y cero
    // coincidencias -> es un resultado real y válido, se respeta tal cual
    // en lugar de sustituirlo por resultados de demostración.
    isSufficient: (bundle) => {
      if (bundle.categories.length === 0) return false;
      const hasFilter = query.length > 0 || categorySlug.length > 0;
      if (!hasFilter && bundle.products.length === 0) return false;
      return true;
    },
  });
}
