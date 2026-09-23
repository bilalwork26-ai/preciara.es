import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
