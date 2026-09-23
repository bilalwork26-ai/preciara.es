/**
 * Ayudas SEO compartidas por las páginas públicas indexables (producto,
 * categoría, portada): URL base absoluta y constructores de datos
 * estructurados (JSON-LD) reutilizados en más de una página, para no
 * repetir la misma forma de `BreadcrumbList`/`Product` en cada una.
 */
import type { Merchant, Offer, Product } from "@/types";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://preciara.es";

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
    offers: offersNode,
  };
}
