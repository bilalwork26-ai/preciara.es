/**
 * Adaptadores tipados: convierten los registros de Prisma al formato
 * `Category` / `Merchant` / `Product` / `Offer` / `PricePoint` que ya
 * esperan los componentes públicos (`src/types`), para no tocar su lógica
 * de renderizado. Toda conversión Decimal -> number, id -> string y fecha
 * -> etiqueta relativa vive aquí, en un único sitio.
 */
import { Availability } from "@/generated/prisma";
import type { Category, Merchant, Offer, PricePoint, Product } from "@/types";
import type { CategoryRow } from "@/server/repositories/categories";
import type { ProductWithOffers } from "@/server/repositories/products";
import type { PriceSnapshotRow } from "@/server/repositories/priceHistory";

/** Icono por categoría (mismo criterio visual que src/data/demo/categories.ts). Los productos heredan el de su categoría: no hay foto real todavía (Fase 3). */
const CATEGORY_ICON_BY_SLUG: Record<string, string> = {
  tecnologia: "Laptop",
  hogar: "Home",
  electrodomesticos: "Refrigerator",
  "salud-cuidado": "HeartPulse",
  deporte: "Dumbbell",
  moda: "Shirt",
  infantil: "Baby",
  viajes: "Plane",
  motor: "Car",
  "jardin-bricolaje": "Hammer",
  mascotas: "PawPrint",
  "libros-ocio": "BookOpen",
};
const DEFAULT_ICON = "Tag";

export function iconForCategorySlug(slug: string): string {
  return CATEGORY_ICON_BY_SLUG[slug] ?? DEFAULT_ICON;
}

export function toLegacyCategory(row: CategoryRow): Category {
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    icon: iconForCategorySlug(row.slug),
  };
}

const MONTH_LABEL = new Intl.DateTimeFormat("es-ES", { month: "short" });

/** Fecha -> etiqueta corta de mes en español, p. ej. "Ene" (mismo formato que src/data/demo). */
function monthLabel(date: Date): string {
  const raw = MONTH_LABEL.format(date).replace(/\.$/, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function toPricePoint(snapshot: PriceSnapshotRow): PricePoint {
  return { label: monthLabel(snapshot.recordedAt), date: snapshot.recordedAt.toISOString(), price: snapshot.price };
}

/** "hace 12 min" / "hace 3 h" / "hace 2 d" a partir de una fecha real. */
export function relativeLabel(date: Date): string {
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return "justo ahora";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} d`;
}

/**
 * Enlace de afiliación con prioridad sobre el de producto (según lo
 * pedido). Se revalida aquí (además de en el importador) que sea
 * http(s): si algún registro llegara roto por otra vía, nunca se genera
 * un enlace inválido, solo "#" como último recurso neutral.
 */
export function effectiveOfferUrl(offer: { productUrl: string; affiliateUrl: string | null }): string {
  const candidate = offer.affiliateUrl ?? offer.productUrl;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return candidate;
  } catch {
    // No-op: cae al valor neutral de abajo.
  }
  return "#";
}

type OfferWithMerchant = ProductWithOffers["offers"][number];

export function toLegacyOffer(offer: OfferWithMerchant): Offer {
  return {
    id: String(offer.id),
    merchantId: offer.merchant.slug,
    price: offer.currentPrice.toNumber(),
    previousPrice: offer.previousPrice ? offer.previousPrice.toNumber() : undefined,
    currency: "EUR",
    url: effectiveOfferUrl(offer),
    inStock: offer.availability === Availability.IN_STOCK,
    // Sin proceso editorial de verificación todavía sobre datos reales (Fase 3):
    // nunca afirmamos "verificado" sobre algo que no hemos comprobado nosotros.
    verified: false,
    lastCheckedLabel: relativeLabel(offer.lastCheckedAt),
  };
}

/**
 * El feed de un comercio puede dejar más de un registro `Offer` ACTIVO
 * para el mismo comercio y el mismo producto, por dos motivos reales
 * observados:
 *   1. Reimportaciones sin limpieza previa que dejan el precio repetido
 *      (caso real: "adidas ES" ×2-3 con el mismo precio en la misma
 *      tarjeta).
 *   2. La identidad de una oferta de Awin es (source, comercio,
 *      externalId) — ver `applyNormalizedOfferRow` en
 *      `catalogSync/applyOffer.ts`. Si ese `externalId` cambia entre
 *      sincronizaciones para lo que en realidad es el mismo anuncio
 *      (listado que Awin renumera, variante que rota...), se crea una
 *      oferta NUEVA en vez de actualizarse la anterior, que queda
 *      activa con su precio antiguo hasta que el job de desactivación
 *      por antigüedad la retire — si tarda, o si
 *      `AWIN_DEACTIVATE_STALE_AFTER_HOURS` no está configurado en
 *      producción, puede quedar activa indefinidamente (caso real:
 *      "adidas ES" a la vez a 45,00 € y a 90,00 € para "Pantalón
 *      Firebird Utility").
 *
 * En ambos casos, nunca se muestran como si fueran dos tiendas
 * distintas: se conserva solo la oferta de precio más bajo por comercio.
 * Si el precio más alto del grupo (o un `previousPrice` ya registrado
 * explícitamente en la oferta que se conserva) es mayor que ese precio
 * más bajo, se usa como su `previousPrice` — es un dato real que el
 * propio comercio llegó a mostrar, nunca uno inventado; si son
 * duplicados exactos (mismo precio), no se infiere ningún descuento.
 */
function collapseOffersByMerchant(offers: Offer[]): Offer[] {
  const byMerchant = new Map<string, Offer[]>();
  for (const offer of offers) {
    const group = byMerchant.get(offer.merchantId) ?? [];
    group.push(offer);
    byMerchant.set(offer.merchantId, group);
  }

  const result: Offer[] = [];
  for (const group of byMerchant.values()) {
    const cheapest = group.reduce((a, b) => (b.price < a.price ? b : a));
    const inferredPrevious = Math.max(cheapest.previousPrice ?? 0, ...group.map((offer) => offer.price));
    result.push(inferredPrevious > cheapest.price ? { ...cheapest, previousPrice: inferredPrevious } : cheapest);
  }
  return result;
}

export function toLegacyProduct(product: ProductWithOffers, priceHistory: PricePoint[] = []): Product {
  return {
    id: product.slug,
    slug: product.slug,
    name: product.name,
    categoryId: product.category.slug,
    icon: iconForCategorySlug(product.category.slug),
    imageUrl: product.imageUrl,
    brand: product.brand,
    priceHistory,
    offers: collapseOffersByMerchant(product.offers.map(toLegacyOffer)),
  };
}

/** Deduplica los comercios que aparecen en las ofertas de una lista de productos. */
export function extractMerchants(products: ProductWithOffers[]): Merchant[] {
  const bySlug = new Map<string, Merchant>();
  for (const product of products) {
    for (const offer of product.offers) {
      if (!bySlug.has(offer.merchant.slug)) {
        bySlug.set(offer.merchant.slug, {
          id: offer.merchant.slug,
          slug: offer.merchant.slug,
          name: offer.merchant.name,
          accentColor: "var(--color-navy-500)",
        });
      }
    }
  }
  return [...bySlug.values()];
}
