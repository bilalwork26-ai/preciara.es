/**
 * Datos de la portada: un puñado de funciones, cada una con una sola
 * responsabilidad, todas pasando por `resolveWithFallback`. `src/app/(site)/page.tsx`
 * las llama en paralelo (Promise.all) para que la portada entera dispare
 * un número pequeño y fijo de consultas (hoy: 4), nunca una por
 * componente ni una por producto.
 */
import { demoCategories } from "@/data/demo/categories";
import { demoDealsGrid, demoFeaturedProduct } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import type { Category, Merchant, Product } from "@/types";
import { getActiveCategories } from "@/server/repositories/categories";
import { getActiveProductsWithOffers, getProductBySlug } from "@/server/repositories/products";
import { getPriceHistoryForOffer } from "@/server/repositories/priceHistory";
import { resolveWithFallback, type SourcedResult } from "./withFallback";
import { extractMerchants, toLegacyCategory, toLegacyProduct, toPricePoint } from "./transform";

/**
 * Slug del producto destacado (banner principal + panel de comparación).
 * Es un hueco curado a propósito, no "la mejor oferta de lo que haya":
 * así el banner nunca muestra una foto/copy que no corresponda al
 * producto cuyo precio está enseñando. Coincide con el slug del seed.
 */
const FEATURED_PRODUCT_SLUG = "auriculares-inalambricos-pro";

/**
 * El portátil tiene su propio banner (sin datos de producto, ver
 * PromoBannerSecondary) y no vuelve a aparecer en la cuadrícula de
 * bajadas, igual que hace hoy `demoDealsGrid` con el producto de demo
 * equivalente.
 */
const SECONDARY_BANNER_PRODUCT_SLUG = "portatil-14-16gb-512gb";

export async function getHomeCategories(): Promise<SourcedResult<Category[]>> {
  return resolveWithFallback({
    fetchFromDb: async () => {
      const rows = await getActiveCategories();
      return rows ? rows.map(toLegacyCategory) : null;
    },
    demoFallback: demoCategories,
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

export type DealsGridBundle = { products: Product[]; merchants: Merchant[] };

export async function getDealsGridBundle(): Promise<SourcedResult<DealsGridBundle>> {
  return resolveWithFallback({
    fetchFromDb: async () => {
      const rows = await getActiveProductsWithOffers(24);
      if (!rows) return null;
      const filtered = rows.filter((p) => p.slug !== SECONDARY_BANNER_PRODUCT_SLUG);
      const products = filtered.map((p) => toLegacyProduct(p));
      return { products, merchants: extractMerchants(filtered) };
    },
    demoFallback: { products: demoDealsGrid, merchants: demoMerchants },
    isSufficient: (bundle) => bundle.products.length > 0,
  });
}
