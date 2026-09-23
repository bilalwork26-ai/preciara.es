import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { getActiveCategoriesWithOfferCounts } from "@/server/repositories/categories";
import { getActiveProductsWithOffers } from "@/server/repositories/products";

/**
 * Sitemap dinámico: solo páginas públicas indexables y reales. Nunca
 * incluye admin, cuenta, login, APIs, `/buscar` (búsqueda interna), ni
 * ningún dato de demostración — cada entrada de categoría/producto sale
 * directamente de la base de datos (nunca de `src/data/demo/*`). Sin
 * `DATABASE_URL` o si la consulta falla, devuelve solo las páginas
 * estáticas: nunca lanza ni deja el sitemap a medias.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/categorias`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/metodologia`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${SITE_URL}/aviso-afiliacion`, changeFrequency: "yearly", priority: 0.1 },
  ];

  const [categories, products] = await Promise.all([
    getActiveCategoriesWithOfferCounts(),
    getActiveProductsWithOffers(5000),
  ]);

  const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map((category) => ({
    url: `${SITE_URL}/categoria/${category.slug}`,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map((product) => ({
    url: `${SITE_URL}/producto/${product.slug}`,
    lastModified: product.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
