/**
 * Parser y normalizador del feed CSV estándar de productos de Awin:
 * transforma cada fila válida al contrato existente `NormalizedOfferRow`
 * (ver `types.ts`), en streaming sobre `parseCsvStream` (ver
 * `streamingCsv.ts`) — nunca carga el feed entero en memoria. Este bloque
 * se limita EXCLUSIVAMENTE a parsing y normalización: no llama a
 * `runCatalogSync`, no escribe en la base de datos, no descarga nada de
 * red y no usa credenciales — la descarga real del feed (con las
 * credenciales de la cuenta de Awin) y la orquestación periódica
 * (cron/programador) son bloques posteriores, todavía sin construir (ver
 * `syncSourceConfig.ts`).
 *
 * FUENTES CONSULTADAS (documentación oficial de Awin) y su limitación:
 * en este entorno de ejecución, el acceso directo a las páginas de
 * documentación de Awin (`developer.awin.com`, `help.awin.com`,
 * `success.awin.com`) y a varias páginas de terceros que las citan
 * (incluida `en.wikipedia.org`, usada aquí solo como control) devolvió
 * "EGRESS_BLOCKED" en todos los intentos — el proxy de salida de este
 * entorno bloquea esos dominios por completo, así que no fue posible leer
 * directamente el contenido de ninguna página oficial desde aquí. Los
 * nombres de columna de abajo combinan dos fuentes:
 *   - FRAGMENTOS DE RESULTADOS de varias búsquedas web (herramienta de
 *     búsqueda, no de lectura de página) sobre "Awin — Hosting and Column
 *     Descriptions" (help.awin.com/docs/hosting-feeds) y páginas de
 *     terceros que documentan/replican el feed (Trajekt, AffiliateFeeds.com,
 *     WISEPIM): product_id, merchant_category, price(search_price),
 *     brand_name, ean, upc, mpn, isbn, model_number, product_name,
 *     description, deep_link, image_url, currency, delivery_cost,
 *     in_stock, stock_quantity, last_updated, aw_product_id (ID propio de
 *     Awin, único en toda la plataforma), merchant_product_id (SKU del
 *     propio comercio), aw_deep_link (enlace de seguimiento/afiliado).
 *   - La página oficial "Product Feed List Download"
 *     (help.awin.com/developers/docs/product-feed-list-download), cuyo
 *     listado exacto de columnas de ejemplo fue confirmado directamente
 *     por quien encargó este bloque de trabajo (WebFetch la sigue
 *     bloqueando desde aquí, así que no se pudo releer por separado):
 *     incluye explícitamente `product_GTIN`, `ean` y `upc` como columnas
 *     de identificador de producto — `product_GTIN` SÍ está documentado,
 *     a diferencia de lo que sugerían los fragmentos de búsqueda por sí
 *     solos — y `merchant_image_url`, `aw_image_url`, `large_image` como
 *     columnas de imagen y `product_model`/`model_number` como columnas
 *     de modelo.
 *
 * ANTES DE CONECTAR UNA CUENTA REAL DE AWIN: te sigo recomendando
 * confirmar este mapeo contra un feed de muestra real, especialmente los
 * nombres que solo proceden de fragmentos de búsqueda (no de la página
 * oficial citada arriba) — ver `COLUMN_ALIASES`/`GTIN_COLUMN_PRIORITY`
 * más abajo, que centralizan todos los nombres de columna usados en un
 * único sitio, fácil de corregir sin tocar el resto del parser.
 *
 * Diseño:
 *   - `parseAwinProductFeed` es un generador asíncrono: consume un
 *     `AsyncIterable<string>` (o un `string` suelto, útil en pruebas) y
 *     produce (`yield`) un resultado POR CADA fila de datos del feed,
 *     nunca una muestra — nunca se seleccionan filas a mano.
 *   - Cada resultado se clasifica en `"valid"` (con el `NormalizedOfferRow`
 *     ya validado mediante `validateNormalizedOfferRow`, la MISMA función
 *     que usa cualquier otro adaptador) o `"invalid"` (fila rechazada con
 *     un código/mensaje, pero sin abortar el resto del feed) — igual que
 *     `RowValidationError` en el importador CSV manual.
 *   - Un problema del FICHERO/FEED entero (cabecera ausente, columnas
 *     mínimas ausentes, o la fuente de fragmentos se corta/falla a mitad)
 *     nunca se trata como una fila más: se lanza `AwinFeedFatalError` (o
 *     `StreamingCsvTruncatedError`, propagada tal cual desde
 *     `streamingCsv.ts`) y el generador aborta — quien orqueste la
 *     descarga real (bloque posterior) debe interpretar eso como
 *     `feedFetchedSuccessfully: false` en `runCatalogSync`, nunca como una
 *     descarga completa.
 *   - `merchant` (slug/nombre/URL del comercio) NUNCA se lee de columnas
 *     del CSV: el feed estándar de Awin es un fichero POR comercio/programa
 *     (una URL de feed distinta por cada uno), así que esa identidad la
 *     conoce quien pide la descarga, no el contenido del fichero — leerla
 *     de una columna que no existe sería "inventar información ausente".
 *     Se recibe como parámetro (`AwinFeedContext.merchant`).
 */
import { OfferSource } from "@/generated/prisma";
import { Availability } from "@/generated/prisma";
import { parseDecimalField, RowValidationError } from "@/server/importer/validate";
import { parseCsvStream, singleChunk, StreamingCsvTruncatedError } from "./streamingCsv";
import { validateNormalizedOfferRow } from "./validation";
import { NormalizedOfferRowError, type NormalizedMerchant, type NormalizedOfferRow } from "./types";

export { StreamingCsvTruncatedError };

export class AwinFeedFatalError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export type AwinFeedContext = {
  /** Comercio al que pertenece ESTE feed completo — nunca se deduce de columnas del CSV (ver comentario de cabecera). */
  merchant: NormalizedMerchant;
  /**
   * Cuándo se obtuvo este feed (pasa a `NormalizedOfferRow.fetchedAt` en
   * TODAS las filas de esta pasada). Por defecto, el instante en que
   * arranca el parseo. Deliberadamente NO es la columna `last_updated` de
   * cada fila (que refleja la frescura del dato en Awin, no cuándo
   * Preciara lo obtuvo — ver el propio comentario de `fetchedAt` en
   * `types.ts`): esa columna no se usa en este bloque.
   */
  fetchedAt?: Date;
};

export type AwinFeedRowResult =
  | { status: "valid"; rowNumber: number; row: NormalizedOfferRow }
  | { status: "invalid"; rowNumber: number; code: string; message: string };

/**
 * Nombres de columna reconocidos por campo, en orden de prioridad (el
 * primero no vacío gana). Único sitio del fichero donde se listan — ver
 * nota de fuentes consultadas arriba sobre su fiabilidad.
 */
const COLUMN_ALIASES = {
  productId: ["aw_product_id", "merchant_product_id"],
  name: ["product_name"],
  brand: ["brand_name"],
  /**
   * `product_model` primero (nombre de columna confirmado en la página
   * oficial "Product Feed List Download" — ver nota de fuentes arriba),
   * `model_number` como alias de compatibilidad (también documentado ahí
   * mismo, y el único que habían corroborado los fragmentos de búsqueda
   * por separado).
   */
  model: ["product_model", "model_number"],
  /**
   * Prioridad de columnas de imagen, las cuatro confirmadas en la página
   * oficial "Product Feed List Download" (ver nota de fuentes arriba):
   * `merchant_image_url` primero (la imagen tal cual la aporta el propio
   * comercio, la fuente más directa), `aw_image_url` después (imagen
   * servida/alojada por Awin, un buen sustituto si el comercio no aporta
   * la suya), `large_image` como variante en mayor resolución si ninguna
   * de las dos anteriores está presente, y `image_url` SOLO como alias
   * de compatibilidad final (nombre genérico visto en otras fuentes, por
   * si algún feed real lo usa en su lugar).
   */
  imageUrl: ["merchant_image_url", "aw_image_url", "large_image", "image_url"],
  categoryText: ["merchant_category", "category_name"],
  price: ["search_price"],
  currency: ["currency"],
  shippingCost: ["delivery_cost"],
  /** URL directa/sin seguimiento, si el feed la trae por separado del enlace de afiliado. */
  merchantDeepLink: ["merchant_deep_link"],
  /** Enlace de seguimiento/afiliado. */
  affiliateDeepLink: ["aw_deep_link", "deep_link"],
  inStock: ["in_stock"],
} as const;

/**
 * Prioridad determinista para el posible GTIN de una fila (punto propio
 * del bloque, ver requisitos): `product_GTIN` primero — columna
 * confirmada en la página oficial "Product Feed List Download" (ver nota
 * de fuentes arriba) como LA columna de GTIN explícita, la señal más
 * directa e inequívoca —, luego `ean` (formato GS1 ampliamente
 * reconocido, el mismo que valida `gtin.ts`, y también confirmado en esa
 * misma página), y por último `upc` (también documentado ahí, y también
 * un GTIN válido una vez rellenado con ceros a 14 dígitos, pero
 * históricamente más centrado en Norteamérica). El valor devuelto es
 * SIEMPRE el texto en bruto de la primera columna no vacía según esta
 * prioridad — nunca se valida ni se normaliza aquí: `NormalizedOfferRow.gtin`
 * se documenta como "sin validar todavía" (ver `types.ts`); esa validación
 * ocurre más adelante en el núcleo, vía `gtin.ts`.
 */
const GTIN_COLUMN_PRIORITY = ["product_GTIN", "ean", "upc"] as const;

const REQUIRED_COLUMN_GROUPS: readonly (readonly string[])[] = [COLUMN_ALIASES.productId, COLUMN_ALIASES.name, COLUMN_ALIASES.price];

function buildHeaderIndex(header: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const column of header) {
    const key = column.trim().toLowerCase();
    if (key && !index.has(key)) index.set(key, column.trim());
  }
  return index;
}

function pickField(headerIndex: Map<string, string>, record: Record<string, string>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const key = headerIndex.get(alias.toLowerCase());
    if (key === undefined) continue;
    const value = record[key];
    if (value) return value;
  }
  return "";
}

function assertRequiredColumns(headerIndex: Map<string, string>): void {
  for (const group of REQUIRED_COLUMN_GROUPS) {
    const hasAny = group.some((name) => headerIndex.has(name.toLowerCase()));
    if (!hasAny) {
      throw new AwinFeedFatalError(
        "MISSING_REQUIRED_COLUMNS",
        `La cabecera del feed no contiene ninguna de las columnas esperadas: ${group.join(" / ")}.`
      );
    }
  }
}

/** `null` si la fila tiene un número de columnas distinto al de la cabecera — nunca se alinean campos a ciegas cuando eso ocurre (fila malformada, ver `parseAwinProductFeed`). */
function recordFromRow(headerColumns: string[], row: string[]): Record<string, string> | null {
  if (row.length !== headerColumns.length) return null;
  const record: Record<string, string> = {};
  headerColumns.forEach((key, idx) => {
    record[key] = (row[idx] ?? "").trim();
  });
  return record;
}

/** Quita diacríticos, pasa a minúsculas y sustituye todo lo que no sea `a-z0-9` por guiones simples — la misma forma que exige `validateNormalizedOfferRow` para slugs. Nunca inventa contenido: solo transforma el texto ya presente en la columna de categoría. */
function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
}

function resolveAvailability(raw: string): Availability {
  const value = raw.trim();
  if (value === "1") return Availability.IN_STOCK;
  if (value === "0") return Availability.OUT_OF_STOCK;
  // Valor ausente o no reconocido (nunca visto en la documentación
  // consultada): UNKNOWN es la única respuesta honesta — nunca se asume
  // "en stock" por defecto.
  return Availability.UNKNOWN;
}

/** Traduce un `RowValidationError` de `parseDecimalField` (del importador CSV manual, reutilizado aquí tal cual — ver comentario de cabecera) al `NormalizedOfferRowError` propio de este núcleo. */
function parseDecimalOrThrow(raw: string, fieldName: string, options: { required: boolean }): number | null {
  try {
    return parseDecimalField(raw, fieldName, options);
  } catch (error) {
    if (error instanceof RowValidationError) throw new NormalizedOfferRowError(error.code, error.message);
    throw error;
  }
}

function normalizeAwinRow(record: Record<string, string>, headerIndex: Map<string, string>, context: { merchant: NormalizedMerchant; fetchedAt: Date }): NormalizedOfferRow {
  const externalId = pickField(headerIndex, record, COLUMN_ALIASES.productId);
  if (!externalId) {
    throw new NormalizedOfferRowError("MISSING_FIELD", `Falta un identificador de producto (${COLUMN_ALIASES.productId.join(" / ")}).`);
  }

  const categoryText = pickField(headerIndex, record, COLUMN_ALIASES.categoryText);
  if (!categoryText) {
    throw new NormalizedOfferRowError("MISSING_FIELD", `Falta la categoría de la fila (${COLUMN_ALIASES.categoryText.join(" / ")}).`);
  }
  const categorySlug = slugify(categoryText);
  if (!categorySlug) {
    throw new NormalizedOfferRowError("INVALID_SLUG", `La categoría "${categoryText}" no produce un identificador válido tras normalizar el texto.`);
  }

  const name = pickField(headerIndex, record, COLUMN_ALIASES.name);

  const price = parseDecimalOrThrow(pickField(headerIndex, record, COLUMN_ALIASES.price), "search_price", { required: true })!;
  const shippingCost = parseDecimalOrThrow(pickField(headerIndex, record, COLUMN_ALIASES.shippingCost), "delivery_cost", { required: false });

  const merchantDeepLink = pickField(headerIndex, record, COLUMN_ALIASES.merchantDeepLink);
  const affiliateDeepLink = pickField(headerIndex, record, COLUMN_ALIASES.affiliateDeepLink);
  // Si el feed no trae una URL directa/sin seguimiento por separado, se
  // usa el mismo enlace de afiliado también como productUrl (obligatorio
  // en el contrato): sigue llevando al producto, y nunca se inventa una
  // URL nueva que el feed no trajera.
  const productUrl = merchantDeepLink || affiliateDeepLink;
  const affiliateUrl = affiliateDeepLink || null;

  const gtin = pickField(headerIndex, record, GTIN_COLUMN_PRIORITY) || null;

  const row: NormalizedOfferRow = {
    source: OfferSource.AWIN,
    merchant: context.merchant,
    externalId,
    gtin,
    name,
    brand: pickField(headerIndex, record, COLUMN_ALIASES.brand) || null,
    model: pickField(headerIndex, record, COLUMN_ALIASES.model) || null,
    category: { slug: categorySlug, name: categoryText },
    imageUrl: pickField(headerIndex, record, COLUMN_ALIASES.imageUrl) || null,
    price,
    shippingCost,
    currency: pickField(headerIndex, record, COLUMN_ALIASES.currency).toUpperCase(),
    availability: resolveAvailability(pickField(headerIndex, record, COLUMN_ALIASES.inStock)),
    productUrl,
    affiliateUrl,
    fetchedAt: context.fetchedAt,
  };

  // Validación genérica final — la MISMA que cualquier otro adaptador (URL,
  // slugs, longitudes, moneda...), nunca duplicada aquí.
  validateNormalizedOfferRow(row);
  return row;
}

/**
 * Parsea y normaliza un feed CSV estándar de Awin en streaming, fila a
 * fila. Nunca escribe en la base de datos ni llama a `runCatalogSync` (ver
 * comentario de cabecera): produce únicamente `NormalizedOfferRow` listos
 * para que un bloque posterior los entregue a `runCatalogSync`.
 */
export async function* parseAwinProductFeed(input: AsyncIterable<string> | string, context: AwinFeedContext): AsyncGenerator<AwinFeedRowResult> {
  const source = typeof input === "string" ? singleChunk(input) : input;
  const fetchedAt = context.fetchedAt ?? new Date();

  let headerColumns: string[] | null = null;
  let headerIndex: Map<string, string> | null = null;
  let rowNumber = 0;

  for await (const row of parseCsvStream(source)) {
    if (headerColumns === null) {
      headerColumns = row.map((h) => h.trim());
      headerIndex = buildHeaderIndex(headerColumns);
      assertRequiredColumns(headerIndex);
      continue;
    }

    rowNumber += 1;
    const record = recordFromRow(headerColumns, row);
    if (record === null) {
      yield {
        status: "invalid",
        rowNumber,
        code: "COLUMN_COUNT_MISMATCH",
        message: `La fila tiene ${row.length} columna(s), pero la cabecera declara ${headerColumns.length}.`,
      };
      continue;
    }

    try {
      const normalized = normalizeAwinRow(record, headerIndex!, { merchant: context.merchant, fetchedAt });
      yield { status: "valid", rowNumber, row: normalized };
    } catch (error) {
      if (error instanceof NormalizedOfferRowError) {
        yield { status: "invalid", rowNumber, code: error.code, message: error.message };
        continue;
      }
      // Cualquier excepción no prevista se deja propagar: nunca se
      // convierte en silencio en un simple "fila inválida" (podría
      // esconder un fallo real del propio parser).
      throw error;
    }
  }

  if (headerColumns === null) {
    throw new AwinFeedFatalError("MISSING_HEADER", "El feed no contiene ninguna fila (ni siquiera una cabecera de columnas): no se puede procesar.");
  }
}
