/**
 * Construcción de URLs de navegación de categorías — lógica pura, sin
 * React ni DOM, para poder probarla sin `jsdom`/`@testing-library`
 * (el proyecto no tiene esa infraestructura).
 *
 * Cada categoría real enlaza a su ficha indexable (`/categoria/[slug]`,
 * ver `src/app/(site)/categoria/[slug]/page.tsx`), NUNCA a
 * `/buscar?categoria=...` — `/buscar` está excluida de robots.txt por ser
 * una búsqueda interna, así que un enlace hacia ahí desde una píldora
 * "indexable" sería contradictorio (la página de destino no se indexaría).
 */

/** Ruta del listado completo de chollos reales (descuento real, ver `SUPERGANGAS_MIN_DISCOUNT_PERCENT`) — ver `getOfertasBundle` en `server/dataSource/home.ts`. Único sitio que decide esta URL: el CTA del Hero enlaza aquí. */
export const OFERTAS_HREF = "/supergangas";

/** Ruta del índice completo de categorías ("Ver todas las categorías") — ver `CategoryBanners.tsx`. */
export const CATEGORIES_INDEX_HREF = "/categorias";

/**
 * `encodeURIComponent` por defensa: los slugs ya se generan siempre en
 * minúsculas/con guiones (`Category.slug`, `@db.VarChar(120)`, nunca con
 * espacios ni caracteres especiales), pero un valor de fuera de este
 * fichero nunca es de fiar solo por convención — nunca se interpola sin
 * codificar en una URL.
 */
export function buildCategoryHref(slug: string): string {
  return `/categoria/${encodeURIComponent(slug)}`;
}
