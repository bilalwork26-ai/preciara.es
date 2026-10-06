import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { guides } from "@/data/guides";
import { getActiveCategoriesWithProductCounts } from "@/server/repositories/categories";

/**
 * Sitemap de páginas estáticas y categorías — solo páginas públicas
 * indexables y reales. Nunca incluye admin, cuenta, login, APIs, `/buscar`
 * (búsqueda interna), ni ningún dato de demostración — cada entrada de
 * categoría sale directamente de la base de datos (nunca de
 * `src/data/demo/*`). Sin `DATABASE_URL` o si la consulta falla, devuelve
 * solo las páginas estáticas: nunca lanza ni deja el sitemap a medias.
 *
 * Los productos (potencialmente miles, y creciendo con cada sincronización)
 * tienen su propio sitemap paginado, separado a propósito para no saturar
 * a GoogleBot con un único fichero gigante — ver
 * `src/app/(site)/producto/sitemap.ts` (`generateSitemaps`,
 * `/producto/sitemap/<id>.xml`) y `robots.ts`, que lista ambos.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/supergangas`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/categorias`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/guias`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/sobre-preciara`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/para-tiendas`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contacto`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/metodologia`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/aviso-afiliacion`, changeFrequency: "yearly", priority: 0.1 },
    ...guides.map((guide) => ({
      url: `${SITE_URL}/guias/${guide.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];

  // `getActiveCategoriesWithProductCounts`, no `...WithOfferCounts`: el
  // sitemap debe listar toda categoría que de verdad resuelve con
  // contenido real (200), y desde que /categoria/[slug] sirve el
  // catálogo completo (con o sin oferta activa, ver getCategoryDetail)
  // esos dos criterios ya no coinciden — una categoría sin ningún
  // producto con oferta activa, pero con productos reales, resuelve
  // igualmente y debe estar aquí.
  const categories = await getActiveCategoriesWithProductCounts();

  const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map((category) => ({
    url: `${SITE_URL}/categoria/${category.slug}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries];
}
