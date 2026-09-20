import { Availability } from "@/generated/prisma";

/** Columnas obligatorias del CSV, en el orden documentado en el README. */
export const CSV_COLUMNS = [
  "category_slug",
  "category_name",
  "product_slug",
  "product_name",
  "brand",
  "model",
  "ean",
  "image_url",
  "merchant_slug",
  "merchant_name",
  "merchant_url",
  "external_offer_id",
  "price",
  "previous_price",
  "currency",
  "availability",
  "shipping_cost",
  "product_url",
  "affiliate_url",
  "last_checked_at",
  "is_demo",
] as const;

const REQUIRED_COLUMNS: (typeof CSV_COLUMNS)[number][] = [
  "category_slug",
  "product_slug",
  "product_name",
  "merchant_slug",
  "merchant_name",
  "merchant_url",
  "price",
  "availability",
  "product_url",
];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const AVAILABILITY_ALIASES: Record<string, Availability> = {
  in_stock: Availability.IN_STOCK,
  "in-stock": Availability.IN_STOCK,
  disponible: Availability.IN_STOCK,
  available: Availability.IN_STOCK,
  out_of_stock: Availability.OUT_OF_STOCK,
  "out-of-stock": Availability.OUT_OF_STOCK,
  agotado: Availability.OUT_OF_STOCK,
  sin_stock: Availability.OUT_OF_STOCK,
  unavailable: Availability.OUT_OF_STOCK,
  preorder: Availability.PREORDER,
  reserva: Availability.PREORDER,
  preventa: Availability.PREORDER,
  discontinued: Availability.DISCONTINUED,
  descatalogado: Availability.DISCONTINUED,
  unknown: Availability.UNKNOWN,
  desconocido: Availability.UNKNOWN,
};

export class RowValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** "19,99" -> 19.99 · "1.234,56" -> 1234.56 · "1,234.56" -> 1234.56 · "19.99" -> 19.99 */
export function parseDecimalField(raw: string, fieldName: string, { required }: { required: boolean }): number | null {
  const value = raw.trim();
  if (!value) {
    if (required) throw new RowValidationError("MISSING_FIELD", `Falta el campo obligatorio "${fieldName}".`);
    return null;
  }

  let normalized = value.replace(/\s/g, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastComma > lastDot) {
      // "1.234,56" -> el punto es separador de miles, la coma es el decimal.
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56" -> la coma es separador de miles.
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new RowValidationError("INVALID_NUMBER", `El campo "${fieldName}" no es un número válido: "${raw}".`);
  }
  if (parsed < 0) {
    throw new RowValidationError("NEGATIVE_PRICE", `El campo "${fieldName}" no puede ser negativo: "${raw}".`);
  }
  return parsed;
}

function parseSlug(raw: string, fieldName: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) throw new RowValidationError("MISSING_FIELD", `Falta el campo obligatorio "${fieldName}".`);
  if (!SLUG_RE.test(value)) {
    throw new RowValidationError(
      "INVALID_SLUG",
      `"${fieldName}" debe usar minúsculas, números y guiones (p. ej. "auriculares-pro"): "${raw}".`
    );
  }
  if (value.length > 150) throw new RowValidationError("FIELD_TOO_LONG", `"${fieldName}" es demasiado largo.`);
  return value;
}

function parseRequiredText(raw: string, fieldName: string, maxLength: number): string {
  const value = raw.trim();
  if (!value) throw new RowValidationError("MISSING_FIELD", `Falta el campo obligatorio "${fieldName}".`);
  if (value.length > maxLength) throw new RowValidationError("FIELD_TOO_LONG", `"${fieldName}" es demasiado largo (máx. ${maxLength}).`);
  return value;
}

function parseOptionalText(raw: string, fieldName: string, maxLength: number): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLength) throw new RowValidationError("FIELD_TOO_LONG", `"${fieldName}" es demasiado largo (máx. ${maxLength}).`);
  return value;
}

/** Solo http(s), sin `javascript:` ni otros esquemas. No se descarga ni se sigue la URL en esta fase. */
function parseUrl(raw: string, fieldName: string, { required }: { required: boolean }): string | null {
  const value = raw.trim();
  if (!value) {
    if (required) throw new RowValidationError("MISSING_FIELD", `Falta el campo obligatorio "${fieldName}".`);
    return null;
  }
  if (value.length > 700) throw new RowValidationError("FIELD_TOO_LONG", `"${fieldName}" es demasiado largo (máx. 700).`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RowValidationError("INVALID_URL", `"${fieldName}" no es una URL válida: "${raw}".`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RowValidationError("INVALID_URL", `"${fieldName}" debe empezar por http:// o https://: "${raw}".`);
  }
  return value;
}

function parseAvailability(raw: string): Availability {
  const key = raw.trim().toLowerCase();
  if (!key) throw new RowValidationError("MISSING_FIELD", 'Falta el campo obligatorio "availability".');
  const mapped = AVAILABILITY_ALIASES[key];
  if (!mapped) {
    throw new RowValidationError(
      "INVALID_AVAILABILITY",
      `"availability" no reconocido: "${raw}". Usa uno de: ${Object.keys(AVAILABILITY_ALIASES).join(", ")}.`
    );
  }
  return mapped;
}

function parseCurrency(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value) return "EUR";
  if (!CURRENCY_RE.test(value)) {
    throw new RowValidationError("INVALID_CURRENCY", `"currency" debe ser un código de 3 letras (p. ej. EUR): "${raw}".`);
  }
  return value;
}

const IS_DEMO_TRUE_VALUES = new Set(["true", "1", "yes", "si", "sí"]);
const IS_DEMO_FALSE_VALUES = new Set(["false", "0", "no"]);

/**
 * "true"/"false" (y sinónimos habituales) estrictos: cualquier otro valor no
 * vacío se rechaza en vez de interpretarse a la ligera. Vacío o columna
 * ausente = `true` (demo) por defecto: un fichero real SIEMPRE debe marcar
 * `is_demo=false` explícitamente. Nunca se asume "real" solo porque falta
 * el dato — ver README, "Formato CSV".
 */
function parseIsDemo(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  if (!value) return true;
  if (IS_DEMO_TRUE_VALUES.has(value)) return true;
  if (IS_DEMO_FALSE_VALUES.has(value)) return false;
  throw new RowValidationError(
    "INVALID_IS_DEMO",
    `"is_demo" no reconocido: "${raw}". Usa "true" o "false" (deja la columna vacía solo si de verdad son datos de demostración).`
  );
}

function parseDate(raw: string, fieldName: string): Date | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new RowValidationError("INVALID_DATE", `"${fieldName}" no es una fecha válida (usa ISO 8601): "${raw}".`);
  }
  return parsed;
}

export type NormalizedOfferRow = {
  categorySlug: string;
  categoryName: string | null;
  productSlug: string;
  productName: string;
  brand: string | null;
  model: string | null;
  ean: string | null;
  imageUrl: string | null;
  merchantSlug: string;
  merchantName: string;
  merchantUrl: string;
  externalId: string | null;
  price: number;
  previousPrice: number | null;
  currency: string;
  availability: Availability;
  shippingCost: number | null;
  productUrl: string;
  affiliateUrl: string | null;
  lastCheckedAt: Date;
  isDemo: boolean;
};

/**
 * Valida y normaliza una fila del CSV. Lanza `RowValidationError` en el
 * primer campo inválido (la fila se rechaza entera; el resto del CSV
 * continúa). Nunca confía en el nombre del fichero ni interpreta HTML: solo
 * lee los valores de texto de las columnas documentadas.
 */
export function validateRow(record: Record<string, string>): NormalizedOfferRow {
  for (const column of REQUIRED_COLUMNS) {
    if (!(column in record)) {
      throw new RowValidationError("MISSING_COLUMN", `Falta la columna "${column}" en la cabecera del CSV.`);
    }
  }

  const now = new Date();
  return {
    categorySlug: parseSlug(record.category_slug, "category_slug"),
    categoryName: parseOptionalText(record.category_name ?? "", "category_name", 120),
    productSlug: parseSlug(record.product_slug, "product_slug"),
    productName: parseRequiredText(record.product_name, "product_name", 200),
    brand: parseOptionalText(record.brand ?? "", "brand", 100),
    model: parseOptionalText(record.model ?? "", "model", 100),
    ean: parseOptionalText(record.ean ?? "", "ean", 32),
    imageUrl: parseUrl(record.image_url ?? "", "image_url", { required: false }),
    merchantSlug: parseSlug(record.merchant_slug, "merchant_slug"),
    merchantName: parseRequiredText(record.merchant_name, "merchant_name", 120),
    merchantUrl: parseUrl(record.merchant_url, "merchant_url", { required: true })!,
    externalId: parseOptionalText(record.external_offer_id ?? "", "external_offer_id", 120),
    price: parseDecimalField(record.price, "price", { required: true })!,
    previousPrice: parseDecimalField(record.previous_price ?? "", "previous_price", { required: false }),
    currency: parseCurrency(record.currency ?? ""),
    availability: parseAvailability(record.availability),
    shippingCost: parseDecimalField(record.shipping_cost ?? "", "shipping_cost", { required: false }),
    productUrl: parseUrl(record.product_url, "product_url", { required: true })!,
    affiliateUrl: parseUrl(record.affiliate_url ?? "", "affiliate_url", { required: false }),
    lastCheckedAt: parseDate(record.last_checked_at ?? "", "last_checked_at") ?? now,
    isDemo: parseIsDemo(record.is_demo ?? ""),
  };
}
