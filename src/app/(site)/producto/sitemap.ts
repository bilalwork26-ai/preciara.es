import type { MetadataRoute } from "next";
import { SITE_URL, PRODUCT_SITEMAP_CHUNK_SIZE, computeProductSitemapPageCount } from "@/lib/seo";
import { getActiveProductSitemapCount, getActiveProductSitemapPage } from "@/server/repositories/products";

/**
 * Sitemap de productos, separado del resto (`src/app/sitemap.ts`) y
 * paginado con `generateSitemaps` — convención nativa de Next.js (ver
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-sitemaps.md),
 * no un fichero propio a mano: así cada página se sirve con el content-type
 * y la caché correctos sin reimplementarlos. Cada página sale en
 * `/producto/sitemap/<id>.xml`, listada en `robots.ts` (ver ese fichero,
 * que calcula el mismo nº de páginas con `computeProductSitemapPageCount`
 * para que nunca diverjan). `force-dynamic`: el nº de páginas y su
 * contenido deben reflejar el catálogo real en cada sincronización, nunca
 * una caché de build desfasada.
 */
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  const count = await getActiveProductSitemapCount();
  const pages = computeProductSitemapPageCount(count);
  return Array.from({ length: pages }, (_, index) => ({ id: String(index) }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const pageIndex = Number(await id);
  const offset = pageIndex * PRODUCT_SITEMAP_CHUNK_SIZE;
  const products = await getActiveProductSitemapPage({ offset, limit: PRODUCT_SITEMAP_CHUNK_SIZE });

  return (products ?? []).map((product) => ({
    url: `${SITE_URL}/producto/${product.slug}`,
    lastModified: product.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));
}
