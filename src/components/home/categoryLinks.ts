/**
 * Construcción de URLs de navegación de categorías — lógica pura, sin
 * React ni DOM, para poder probarla sin `jsdom`/`@testing-library`
 * (el proyecto no tiene esa infraestructura, ver CategoryRow.test.ts).
 *
 * Cada categoría real enlaza a su ficha indexable (`/categoria/[slug]`,
 * ver `src/app/(site)/categoria/[slug]/page.tsx`), NUNCA a
 * `/buscar?categoria=...` — `/buscar` está excluida de robots.txt por ser
 * una búsqueda interna, así que un enlace hacia ahí desde una píldora
 * "indexable" sería contradictorio (la página de destino no se indexaría).
 */

/** Ruta del índice completo de categorías ("Ver todas"). */
export const CATEGORIES_INDEX_HREF = "/categorias";

/** Ruta del listado completo de chollos reales (descuento ≥30%) — ver `getOfertasBundle` en `server/dataSource/home.ts`. Único sitio que decide esta URL: el CTA del Hero y la píldora "Supergangas" de `PRIMARY_NAV_ITEMS` enlazan aquí. */
export const OFERTAS_HREF = "/supergangas";

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

/**
 * Navegación principal fija de la portada (`CategoryRow`): antes se
 * generaba dinámicamente a partir de las categorías con ofertas activas
 * en BD, lo que en un catálogo real todavía pequeño podía dejar solo 2-3
 * píldoras (caso real reportado: "Moda, Otros, Infantil" con un hueco
 * vacío al lado). Estos 5 elementos son la identidad de navegación del
 * sitio, no un reflejo momentáneo del inventario — se muestran siempre,
 * aunque una categoría concreta esté vacía en un momento dado (su página
 * cae al catálogo de demostración, igual que cualquier `/categoria/[slug]`
 * sin catálogo real, nunca un 404).
 *
 * "Electrónica" enlaza a `tecnologia`: no existe un slug "electronica" en
 * la taxonomía (ver `src/data/demo/categories.ts`) — es la categoría real
 * más cercana. "Supergangas" no es una categoría: enlaza a `OFERTAS_HREF`.
 */
export const PRIMARY_NAV_ITEMS: readonly { label: string; href: string; icon: string }[] = [
  { label: "Deporte", href: buildCategoryHref("deporte"), icon: "Dumbbell" },
  { label: "Moda", href: buildCategoryHref("moda"), icon: "Shirt" },
  { label: "Electrónica", href: buildCategoryHref("tecnologia"), icon: "Laptop" },
  { label: "Hogar", href: buildCategoryHref("hogar"), icon: "Home" },
  { label: "Supergangas", href: OFERTAS_HREF, icon: "Flame" },
];
