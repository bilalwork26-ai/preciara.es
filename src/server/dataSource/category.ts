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
import { getActiveCategoriesWithOfferCounts } from "@/server/repositories/categories";
import { searchActiveProducts } from "@/server/repositories/products";
import { extractMerchants, toLegacyCategory, toLegacyProduct } from "./transform";

export const CATEGORY_PRODUCTS_LIMIT = 60;

export type CategoryDetailResult =
  | { status: "found"; source: "database" | "demo"; category: Category; products: Product[]; merchants: Merchant[] }
  | { status: "not-found" };

export async function getCategoryDetail(slug: string): Promise<CategoryDetailResult> {
  const dbCategories = await getActiveCategoriesWithOfferCounts();
  const dbMatch = dbCategories?.find((c) => c.slug === slug);

  if (dbMatch) {
    const productRows = await searchActiveProducts({ categorySlug: slug, limit: CATEGORY_PRODUCTS_LIMIT });
    if (productRows && productRows.length > 0) {
      return {
        status: "found",
        source: "database",
        category: toLegacyCategory(dbMatch),
        products: productRows.map((p) => toLegacyProduct(p)),
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
