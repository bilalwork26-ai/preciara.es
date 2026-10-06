import type { MetadataRoute } from "next";
import { SITE_URL, computeProductSitemapPageCount } from "@/lib/seo";
import { getActiveProductSitemapCount } from "@/server/repositories/products";

export const dynamic = "force-dynamic";

/**
 * Lista TODOS los sitemaps: el de páginas estáticas/categorías
 * (`/sitemap.xml`, ver `src/app/sitemap.ts`) y una entrada por cada página
 * del sitemap paginado de productos (`/producto/sitemap/<id>.xml`, ver
 * `src/app/(site)/producto/sitemap.ts`). El protocolo de sitemaps admite
 * varias líneas `Sitemap:` en robots.txt sin necesidad de un fichero
 * índice aparte — así es como Google descubre aquí los ficheros de
 * productos. El nº de páginas se calcula con `computeProductSitemapPageCount`,
 * la misma función que usa `producto/sitemap.ts` para generarlas: nunca
 * pueden divergir entre sí.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const productCount = await getActiveProductSitemapCount();
  const productSitemapPages = computeProductSitemapPageCount(productCount);
  const productSitemaps = Array.from(
    { length: productSitemapPages },
    (_, index) => `${SITE_URL}/producto/sitemap/${index}.xml`
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin, /api: zonas privadas/técnicas (ver src/proxy.ts, que además
      // añade X-Robots-Tag: noindex al panel técnico como segunda barrera).
      // /buscar: búsqueda interna, nunca una página de catálogo propia —
      // las páginas reales de categoría/producto (indexables) están en
      // /categoria/[slug] y /producto/[slug], ya en el sitemap.
      disallow: ["/admin", "/admin/", "/api/", "/buscar"],
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, ...productSitemaps],
  };
}
