/**
 * Datos de la ficha de un producto (`/producto/[slug]`). Mismo patrón
 * BD-o-demo que el resto de `src/server/dataSource/*`, pero SIN el
 * fallback automático de `resolveWithFallback`: aquí "no existe en la BD"
 * y "no existe en absoluto" son casos distintos que la página debe poder
 * diferenciar (404 real vs. servir el equivalente de demostración).
 */
import { demoProducts, demoSupergangas } from "@/data/demo/products";
import { demoMerchants } from "@/data/demo/merchants";
import type { Merchant, Product } from "@/types";
import { getProductBySlug } from "@/server/repositories/products";
import { getPriceHistoryForOffer } from "@/server/repositories/priceHistory";
import { extractMerchants, toLegacyProduct, toPricePoint } from "./transform";

export type ProductDetailResult =
  | { status: "found"; source: "database" | "demo"; product: Product; merchants: Merchant[] }
  | { status: "not-found" };

export async function getProductDetail(slug: string): Promise<ProductDetailResult> {
  const dbProduct = await getProductBySlug(slug);

  // `dbProduct` con `offers.length === 0` es "insuficiente" con el mismo
  // criterio que el resto de `src/server/dataSource/*` (ver
  // `getSupergangasBundle` en home.ts): puede ser un producto real ya sin
  // ofertas activas, o la fila del propio seed de demostración (marcada
  // `isDemo: true`, con el mismo slug que `src/data/demo/products.ts` a
  // propósito) cuyas ofertas demo quedaron fuera del filtro de
  // `getProductBySlug`. En ambos casos se prueba con el equivalente de
  // demostración antes de dar 404, igual que el resto de la portada.
  if (dbProduct && dbProduct.offers.length > 0) {
    const cheapest = [...dbProduct.offers].sort((a, b) => a.currentPrice.comparedTo(b.currentPrice))[0];
    const history = await getPriceHistoryForOffer(cheapest.id, 12);
    return {
      status: "found",
      source: "database",
      product: toLegacyProduct(dbProduct, (history ?? []).map(toPricePoint)),
      merchants: extractMerchants([dbProduct]),
    };
  }

  // `demoSupergangas` (src/data/demo/products.ts) es un catálogo demo
  // SEPARADO de `demoProducts`, con sus propios slugs (ver el comentario
  // de ese fichero) — sin buscar también ahí, cualquier tarjeta demo de
  // "Supergangas" en la Home llevaría a un 404 real al pulsarla, caso
  // real detectado en producción (sin catálogo real todavía, la Home
  // sirve 100% demo) el mismo día que se desplegó ese bloque.
  const demoProduct = [...demoProducts, ...demoSupergangas].find((p) => p.slug === slug);
  if (demoProduct) {
    return { status: "found", source: "demo", product: demoProduct, merchants: demoMerchants };
  }

  return { status: "not-found" };
}
