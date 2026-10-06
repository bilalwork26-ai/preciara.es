/**
 * Ayudas SEO compartidas por las páginas públicas indexables (producto,
 * categoría, portada): URL base absoluta y constructores de datos
 * estructurados (JSON-LD) reutilizados en más de una página, para no
 * repetir la misma forma de `BreadcrumbList`/`Product` en cada una.
 */
import type { Merchant, Offer, Product } from "@/types";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://preciara.es";

/**
 * Nº de productos por fichero de sitemap (`src/app/(site)/producto/sitemap.ts`,
 * vía `generateSitemaps`) — por debajo del límite de 50.000 URLs/fichero
 * de Google, y pensado para que cada fichero individual sea ligero de
 * descargar y procesar por GoogleBot aunque el catálogo crezca a decenas
 * de miles de productos.
 */
export const PRODUCT_SITEMAP_CHUNK_SIZE = 5000;

/**
 * Nº de ficheros de sitemap de productos que hacen falta para `count`
 * productos indexables — compartido entre `producto/sitemap.ts`
 * (`generateSitemaps`, decide cuántos ids genera) y `robots.ts` (lista esa
 * misma cantidad de URLs de sitemap), para que nunca diverjan entre sí.
 * Siempre al menos 1 (un sitemap vacío es válido; cero ficheros no lo es).
 */
export function computeProductSitemapPageCount(count: number | null): number {
  return Math.max(1, Math.ceil((count ?? 0) / PRODUCT_SITEMAP_CHUNK_SIZE));
}

/**
 * Imagen de Open Graph/Twitter por defecto (ver `src/app/og/route.tsx`),
 * para cualquier página que defina su propio `openGraph`/`twitter` sin una
 * foto real propia. Necesaria porque Next.js NUNCA fusiona `openGraph`
 * entre segmentos anidados: en cuanto una página devuelve su propio objeto
 * `openGraph`, sustituye por completo (no solo actualiza) el de
 * `layout.tsx`, incluida `images` — así que cada página que defina
 * `openGraph` propio debe aportar también su propia imagen (real, si la
 * tiene, o esta por defecto).
 */
export const DEFAULT_OG_IMAGE_PATH = "/og";

export type BreadcrumbItem = { name: string; path: string };

export function buildBreadcrumbList(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, SITE_URL).toString(),
    })),
  };
}

function offerAvailability(inStock: boolean): string {
  return inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
}

function buildSingleOffer(offer: Offer, merchant: Merchant | undefined, url: string) {
  return {
    "@type": "Offer",
    url,
    priceCurrency: offer.currency,
    price: offer.price,
    availability: offerAvailability(offer.inStock),
    ...(merchant ? { seller: { "@type": "Organization", name: merchant.name } } : {}),
  };
}

/**
 * `Offer` si hay una sola oferta real, `AggregateOffer` si hay varias —
 * nunca se inventa valoración, reseña, stock ni marca: todo sale de
 * ofertas activas reales (`product.offers`, ya filtradas aguas arriba).
 */
export function buildProductJsonLd(product: Product, merchants: Merchant[], canonicalPath: string) {
  const url = new URL(canonicalPath, SITE_URL).toString();
  const offers = product.offers;
  const prices = offers.map((o) => o.price);

  const offersNode =
    offers.length === 1
      ? buildSingleOffer(offers[0], merchants.find((m) => m.id === offers[0].merchantId), url)
      : {
          "@type": "AggregateOffer",
          priceCurrency: offers[0]?.currency ?? "EUR",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: offers.length,
          offers: offers.map((offer) => buildSingleOffer(offer, merchants.find((m) => m.id === offer.merchantId), url)),
        };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    // Solo si el producto tiene una foto real: Google recomienda `image`
    // para la elegibilidad a resultados enriquecidos, pero nunca se
    // inventa una URL cuando no hay ninguna (mismo criterio que el resto
    // de este constructor: sin aggregateRating/review/brand ficticios).
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    offers: offersNode,
  };
}

/**
 * `Article` para las guías editoriales de `/guias`. Sin `datePublished`:
 * no hay una fecha real de publicación que citar, y no se inventa una.
 */
export function buildArticleJsonLd(
  input: { headline: string; description: string },
  canonicalPath: string,
) {
  const url = new URL(canonicalPath, SITE_URL).toString();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    url,
    mainEntityOfPage: url,
    publisher: { "@type": "Organization", name: "Preciara" },
  };
}

/** `AboutPage` para /sobre-preciara. */
export function buildAboutPageJsonLd(input: { name: string; description: string }, canonicalPath: string) {
  const url = new URL(canonicalPath, SITE_URL).toString();
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: input.name,
    description: input.description,
    url,
    about: { "@type": "Organization", name: "Preciara", url: SITE_URL },
  };
}

/** `WebPage` para /para-tiendas (página informativa, no un artículo editorial). */
export function buildWebPageJsonLd(input: { name: string; description: string }, canonicalPath: string) {
  const url = new URL(canonicalPath, SITE_URL).toString();
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url,
  };
}

/**
 * `ContactPage` para /contacto. `email` solo se incluye cuando hay un
 * correo real configurado (`getContactEmail()`, ya validado): nunca se
 * inventa un `contactPoint` con un correo que no existe.
 */
export function buildContactPageJsonLd(
  input: { name: string; description: string; email: string | null },
  canonicalPath: string,
) {
  const url = new URL(canonicalPath, SITE_URL).toString();
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: input.name,
    description: input.description,
    url,
    ...(input.email
      ? { mainEntity: { "@type": "Organization", name: "Preciara", email: input.email } }
      : {}),
  };
}
