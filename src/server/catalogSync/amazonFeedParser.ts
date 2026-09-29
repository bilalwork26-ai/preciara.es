/**
 * Normalizador de artículos de la Amazon Product Advertising API (PA-API)
 * 5.0, operación `GetItems`, al contrato existente `NormalizedOfferRow`
 * (ver `types.ts`) — el mismo contrato que ya produce `awinFeedParser.ts`
 * para Awin. Este bloque se limita EXCLUSIVAMENTE a transformar una
 * respuesta de `GetItems` YA OBTENIDA (un array de objetos JSON) en filas
 * normalizadas: no llama a la API de Amazon, no firma peticiones (AWS
 * Signature Version 4, obligatoria en PA-API), no maneja credenciales y no
 * escribe en la base de datos — igual que `awinFeedParser.ts` tampoco
 * descarga el feed de Awin. La capa que sí llamaría a PA-API en vivo
 * (autenticación, firma de peticiones, límites de cuota, orquestación
 * periódica) queda deliberadamente FUERA de este bloque: ver el aviso al
 * final de este comentario.
 *
 * FUENTES CONSULTADAS y su limitación: igual que con Awin, el proxy de
 * salida de este entorno no permite leer en vivo la documentación oficial
 * de `webservices.amazon.com` / `github.com/amzn/paapi5-*` desde aquí, así
 * que los nombres de campo de abajo proceden del conocimiento ya
 * incorporado (no de una lectura en vivo) del esquema JSON de respuesta de
 * `GetItems` de PA-API 5.0, que es público, versionado y muy estable desde
 * su lanzamiento: `ASIN`, `DetailPageURL`, `Images.Primary.Large.URL`,
 * `ItemInfo.Title.DisplayValue`, `ItemInfo.ByLineInfo.Brand.DisplayValue`,
 * `ItemInfo.Classifications.ProductGroup.DisplayValue`,
 * `ItemInfo.ExternalIds.EANs.DisplayValues[]` /
 * `ItemInfo.ExternalIds.UPCs.DisplayValues[]`,
 * `Offers.Listings[].Price.Amount` / `.Currency`,
 * `Offers.Listings[].Availability.Type`. ANTES DE CONECTAR UNA CUENTA REAL:
 * se recomienda confirmar este mapeo contra una respuesta real de
 * `GetItems` (especialmente `Availability.Type`, cuyos valores exactos no
 * se han podido verificar en vivo desde aquí) — ver `resolveAmazonAvailability`
 * más abajo, que centraliza esa traducción en un único sitio.
 *
 * Campos deliberadamente NO poblados, para no inventar información que
 * PA-API no aporta de forma fiable y genérica en todas las categorías:
 *   - `model`: PA-API no tiene un campo de "modelo" universal y fiable en
 *     `GetItems` (a diferencia de Awin, que sí documenta `product_model`) —
 *     se deja siempre en `null`, nunca se reutiliza `Brand` ni ningún otro
 *     campo como sustituto.
 *   - `shippingCost`: PA-API no expone un importe de gastos de envío
 *     discreto y fiable en `Offers.Listings` (a diferencia de la columna
 *     `delivery_cost` de Awin) — se deja siempre en `null`.
 *
 * `merchant` es SIEMPRE el mismo (`AMAZON_ES_MERCHANT`, más abajo): a
 * diferencia de Awin (un feed por comercio distinto), aquí el propio
 * Amazon.es es el único comercio posible, así que no se recibe como
 * parámetro de contexto ni se lee de ningún campo de la fila.
 *
 * AVISO — capa de llamada en vivo pendiente: construir el cliente HTTP que
 * firme y ejecute peticiones reales a PA-API 5.0 requiere credenciales
 * AWS-style (Access Key ID + Secret Key) DISTINTAS del Tag de Afiliado
 * (`NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG`) ya configurado, y PA-API impone
 * históricamente un requisito de elegibilidad de 3 ventas cualificadas en
 * los últimos 180 días para conceder/mantener el acceso — algo que una
 * cuenta de Afiliados recién activada normalmente no cumple todavía. Ese
 * bloque (autenticación, firma, cuotas, orquestación) queda fuera de este
 * cambio a propósito, pendiente de confirmar con quien encargó este
 * trabajo si ya existen esas credenciales y si la cuenta es elegible.
 */
import { Availability, OfferSource } from "@/generated/prisma";
import { buildAmazonAffiliateUrl } from "@/lib/amazon";
import { GENERIC_CATEGORY_TARGET, mapAwinCategoryText } from "./categoryMapping";
import { validateNormalizedOfferRow } from "./validation";
import { NormalizedOfferRowError, type NormalizedMerchant, type NormalizedOfferRow } from "./types";

/** Amazon.es es siempre el mismo comercio: nunca se lee de la fila ni se recibe como parámetro (ver comentario de cabecera). */
export const AMAZON_ES_MERCHANT: NormalizedMerchant = {
  slug: "amazon-es",
  name: "Amazon.es",
  websiteUrl: "https://www.amazon.es",
};

/**
 * Forma mínima de un elemento de `GetItems` que este normalizador necesita
 * — un subconjunto deliberadamente pequeño del esquema real (que trae
 * muchos más campos no usados aquí), para no acoplar este bloque a
 * ninguna librería cliente concreta de PA-API.
 */
export type AmazonPaapiItem = {
  ASIN: string;
  DetailPageURL?: string;
  Images?: { Primary?: { Large?: { URL?: string } } };
  ItemInfo?: {
    Title?: { DisplayValue?: string };
    ByLineInfo?: { Brand?: { DisplayValue?: string } };
    Classifications?: { ProductGroup?: { DisplayValue?: string } };
    ExternalIds?: {
      EANs?: { DisplayValues?: string[] };
      UPCs?: { DisplayValues?: string[] };
    };
  };
  Offers?: {
    Listings?: Array<{
      Price?: { Amount?: number; Currency?: string };
      Availability?: { Type?: string; Message?: string };
    }>;
  };
};

export type AmazonItemResult =
  | { status: "valid"; asin: string; row: NormalizedOfferRow }
  | { status: "invalid"; asin: string; code: string; message: string };

/**
 * Traduce `Offers.Listings[].Availability.Type` a `Availability`. Nunca
 * asume "en stock" por defecto ante un valor ausente o no reconocido —
 * mismo criterio conservador que `resolveAvailability` en
 * `awinFeedParser.ts`.
 */
function resolveAmazonAvailability(availability: { Type?: string } | undefined): Availability {
  const type = availability?.Type?.trim();
  if (type === "Now") return Availability.IN_STOCK;
  if (type === "OutOfStock") return Availability.OUT_OF_STOCK;
  return Availability.UNKNOWN;
}

function normalizeAmazonItem(item: AmazonPaapiItem, fetchedAt: Date): NormalizedOfferRow {
  const asin = item.ASIN?.trim();
  if (!asin) {
    throw new NormalizedOfferRowError("MISSING_FIELD", "Falta el ASIN del artículo.");
  }

  const name = item.ItemInfo?.Title?.DisplayValue?.trim();
  if (!name) {
    throw new NormalizedOfferRowError("MISSING_FIELD", `Falta el título del artículo (ASIN ${asin}).`);
  }

  const listing = item.Offers?.Listings?.[0];
  if (!listing || listing.Price?.Amount === undefined || listing.Price.Amount === null) {
    // Sin oferta comprable, nunca se inventa un precio: se rechaza esta
    // fila (igual que Awin rechaza una fila sin `search_price`).
    throw new NormalizedOfferRowError("MISSING_FIELD", `El artículo no tiene ninguna oferta con precio (ASIN ${asin}).`);
  }

  const categoryText = item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue?.trim();
  const category = categoryText ? mapAwinCategoryText(categoryText) : GENERIC_CATEGORY_TARGET;

  const productUrl = item.DetailPageURL?.trim() || `https://www.amazon.es/dp/${asin}`;
  const gtin = item.ItemInfo?.ExternalIds?.EANs?.DisplayValues?.[0] ?? item.ItemInfo?.ExternalIds?.UPCs?.DisplayValues?.[0] ?? null;

  const row: NormalizedOfferRow = {
    source: OfferSource.AMAZON,
    merchant: AMAZON_ES_MERCHANT,
    externalId: asin,
    gtin,
    name,
    brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue?.trim() || null,
    model: null, // ver comentario de cabecera: PA-API no tiene un campo de modelo fiable/universal
    category,
    imageUrl: item.Images?.Primary?.Large?.URL?.trim() || null,
    price: listing.Price.Amount,
    shippingCost: null, // ver comentario de cabecera
    currency: (listing.Price.Currency || "EUR").toUpperCase(),
    availability: resolveAmazonAvailability(listing.Availability),
    productUrl,
    affiliateUrl: buildAmazonAffiliateUrl(asin),
    fetchedAt,
  };

  // Validación genérica final — la MISMA que usa cualquier otro adaptador
  // (Awin incluido), nunca duplicada aquí.
  validateNormalizedOfferRow(row);
  return row;
}

/**
 * Normaliza un lote de artículos de `GetItems` (hasta 10 por llamada real
 * a PA-API, límite que no se aplica aquí: este bloque no llama a la API,
 * solo transforma lo que ya se le entrega). Un artículo inválido se
 * clasifica como `"invalid"` sin interrumpir el resto del lote — igual que
 * `parseAwinProductFeed`.
 */
export function parseAmazonItems(items: readonly AmazonPaapiItem[], context: { fetchedAt?: Date } = {}): AmazonItemResult[] {
  const fetchedAt = context.fetchedAt ?? new Date();
  return items.map((item): AmazonItemResult => {
    try {
      const row = normalizeAmazonItem(item, fetchedAt);
      return { status: "valid", asin: item.ASIN, row };
    } catch (error) {
      if (error instanceof NormalizedOfferRowError) {
        return { status: "invalid", asin: item.ASIN, code: error.code, message: error.message };
      }
      // Cualquier excepción no prevista se deja propagar: nunca se
      // convierte en silencio en un simple "artículo inválido".
      throw error;
    }
  });
}
