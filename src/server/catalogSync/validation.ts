/**
 * Validación defensiva de un `NormalizedOfferRow` ya construido por un
 * adaptador (Awin, eBay...). El núcleo nunca confía ciegamente en lo que
 * entrega un adaptador — los mismos criterios de solidez que ya aplica el
 * importador CSV (src/server/importer/validate.ts), adaptados a la forma
 * canónica. Una fila inválida se rechaza entera (NormalizedOfferRowError)
 * y quien orquesta el lote decide cómo registrarla, sin interrumpir el
 * resto del lote — igual que hace runCsvImport con RowValidationError.
 */
import { NormalizedOfferRowError, type NormalizedOfferRow } from "./types";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function requireSlug(value: string, field: string): void {
  if (!SLUG_RE.test(value)) {
    throw new NormalizedOfferRowError("INVALID_SLUG", `"${field}" debe usar minúsculas, números y guiones: "${value}".`);
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new NormalizedOfferRowError("MISSING_FIELD", `Falta el campo obligatorio "${field}".`);
  }
}

function requireHttpUrl(value: string, field: string): void {
  if (!isHttpUrl(value)) {
    throw new NormalizedOfferRowError("INVALID_URL", `"${field}" debe ser una URL http(s) válida: "${value}".`);
  }
}

/** Lanza `NormalizedOfferRowError` en el primer problema encontrado; no modifica `row`. */
export function validateNormalizedOfferRow(row: NormalizedOfferRow): void {
  requireNonEmpty(row.externalId, "externalId");
  if (row.externalId.length > 120) {
    throw new NormalizedOfferRowError("FIELD_TOO_LONG", `"externalId" es demasiado largo (máx. 120).`);
  }

  requireSlug(row.merchant.slug, "merchant.slug");
  requireNonEmpty(row.merchant.name, "merchant.name");
  if (row.merchant.websiteUrl) requireHttpUrl(row.merchant.websiteUrl, "merchant.websiteUrl");
  if (row.merchant.logoUrl) requireHttpUrl(row.merchant.logoUrl, "merchant.logoUrl");

  requireSlug(row.category.slug, "category.slug");
  requireNonEmpty(row.category.name, "category.name");

  requireNonEmpty(row.name, "name");
  if (row.name.length > 200) {
    throw new NormalizedOfferRowError("FIELD_TOO_LONG", `"name" es demasiado largo (máx. 200).`);
  }

  if (row.imageUrl) requireHttpUrl(row.imageUrl, "imageUrl");

  if (!Number.isFinite(row.price) || row.price < 0) {
    throw new NormalizedOfferRowError("INVALID_PRICE", `"price" debe ser un número no negativo: ${row.price}.`);
  }
  if (row.shippingCost !== null && (!Number.isFinite(row.shippingCost) || row.shippingCost < 0)) {
    throw new NormalizedOfferRowError("INVALID_SHIPPING_COST", `"shippingCost" debe ser un número no negativo: ${row.shippingCost}.`);
  }
  if (!CURRENCY_RE.test(row.currency)) {
    throw new NormalizedOfferRowError("INVALID_CURRENCY", `"currency" debe ser un código de 3 letras: "${row.currency}".`);
  }

  requireHttpUrl(row.productUrl, "productUrl");
  if (row.affiliateUrl) requireHttpUrl(row.affiliateUrl, "affiliateUrl");

  if (Number.isNaN(row.fetchedAt.getTime())) {
    throw new NormalizedOfferRowError("INVALID_DATE", `"fetchedAt" no es una fecha válida.`);
  }
}
