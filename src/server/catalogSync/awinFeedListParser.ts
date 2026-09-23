/**
 * Parser y selección automática de la lista de feeds de Awin ("Product
 * Feed List Download"): transforma cada fila válida de esa lista en una
 * estructura tipada (`AwinFeedListEntry`) y selecciona automáticamente
 * SOLO los feeds con `Membership Status: Joined` — sin que ningún humano
 * elija comercios, productos ni ofertas a mano (objetivo del producto).
 * Reutiliza `parseCsvStream` de `streamingCsv.ts` (nunca un segundo parser
 * CSV) y sigue el mismo patrón que `awinFeedParser.ts`: streaming real
 * (nunca carga la lista entera en memoria), y separa con claridad un
 * problema del FICHERO entero (cabecera ausente, columnas mínimas
 * ausentes, fuente truncada) de una FILA individual inválida (se reporta
 * y se omite, sin abortar el resto de la lista).
 *
 * Este bloque se limita EXCLUSIVAMENTE a parsing, validación y selección:
 * no hace ninguna petición de red, no usa credenciales, no toca la base
 * de datos y no implementa gzip/sincronización/cron/variables de entorno
 * — eso son bloques posteriores, todavía sin construir.
 *
 * FUENTE: https://help.awin.com/developers/docs/product-feed-list-download
 * (columnas oficiales confirmadas por quien encargó este bloque de
 * trabajo — `WebFetch` sigue devolviendo "EGRESS_BLOCKED" para
 * `help.awin.com` en este entorno, igual que en los bloques anteriores,
 * así que no se pudo releer la página directamente desde aquí).
 *
 * LA COLUMNA `URL` ES UN DATO SECRETO: la URL de descarga de un feed de
 * Awin incluye el token/clave de descarga propio de la cuenta (en la
 * ruta o en la query string). Por eso, en todo este fichero:
 *   - Ningún mensaje de error de fila (`AwinFeedListRowError`) incluye
 *     jamás la URL cruda ni ningún fragmento de ella, ni siquiera cuando
 *     el problema de la fila es justo que la URL no es válida.
 *   - `redactFeedListUrl` es la ÚNICA forma pensada para representar una
 *     URL de feed en logs/diagnósticos: nunca devuelve la ruta ni la
 *     query (donde vive el token), solo el esquema y el host.
 *   - `AwinFeedListEntry.url` NO es un `string`: es una instancia de
 *     `SensitiveFeedUrl`, que encapsula la URL real en un campo privado
 *     de clase (`#raw`, sintaxis nativa de ECMAScript, no el modificador
 *     `private` de TypeScript — ese último se borra al compilar y deja
 *     una propiedad enumerable normal, visible para `JSON.stringify`,
 *     `Object.keys` o un spread; `#raw` no lo es, por diseño del
 *     lenguaje). Por defecto — `toString()`, `toJSON()`, la inspección
 *     de Node — siempre se ve la versión redactada de `redactFeedListUrl`,
 *     nunca la URL real. La única forma de obtener la URL real es la
 *     función `revealSensitiveUrlForDownload()`, nombrada a propósito
 *     como operación sensible: solo debe llamarse justo antes de la
 *     petición HTTP real de descarga (bloque posterior, todavía sin
 *     construir) — nunca para registrar, mostrar ni serializar.
 *   - Todavía no se guarda en ningún sitio (ni base de datos ni fichero):
 *     este bloque solo la deja disponible en memoria, en la estructura
 *     tipada que devuelve, para que un bloque posterior decida cómo
 *     almacenarla de forma segura.
 *
 * IDENTIDAD SIN COLISIONES: `AwinFeedListEntry.id` combina `advertiserId`,
 * `feedId`, `language`, `vertical` y `primaryRegion` — un mismo
 * anunciante/feed en un idioma, región o vertical distintos es, a
 * efectos de identidad, un feed DISTINTO, nunca se colapsan. Cada
 * componente se normaliza de forma estable (recorte de espacios,
 * normalización Unicode NFKC, minúsculas) y se codifica con un prefijo
 * de longitud antes de concatenarlo (ver `encodeIdentityComponent`): así
 * ningún carácter que pudiera aparecer dentro de un componente (incluido
 * cualquier símbolo que se hubiera usado ingenuamente como separador) se
 * puede confundir con el límite entre dos componentes, y dos
 * combinaciones distintas de los 5 campos nunca producen accidentalmente
 * el mismo identificador.
 */
import { parseCsvStream, singleChunk, StreamingCsvTruncatedError } from "./streamingCsv";

export { StreamingCsvTruncatedError };

export class AwinFeedListFatalError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Motivo de rechazo de una fila — el mensaje NUNCA incluye la URL cruda ni ningún fragmento de ella (ver comentario de cabecera). */
export class AwinFeedListRowError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export type AwinFeedListEntry = {
  /**
   * Identidad determinista y SIN COLISIONES de ESTE feed — combina
   * `advertiserId`, `feedId`, `language`, `vertical` y `primaryRegion`
   * (ver `computeFeedIdentity` y el comentario de cabecera del fichero).
   * Nunca se deduce un identificador a partir solo del anunciante — un
   * mismo anunciante puede tener varios feeds (idiomas, gamas...) y cada
   * uno conserva su propia identidad, nunca se colapsan en una sola.
   */
  id: string;
  advertiserId: string;
  advertiserName: string;
  primaryRegion: string | null;
  /** Texto EXACTO tal como venía en la columna (ya recortado de espacios), conservado para diagnóstico — el filtro de selección usa una comparación normalizada aparte, ver `isJoined`. */
  membershipStatus: string;
  feedId: string;
  feedName: string;
  language: string | null;
  vertical: string | null;
  lastImported: Date | null;
  /** SECRETO, encapsulado — ver `SensitiveFeedUrl` y el comentario de cabecera del fichero. Nunca `String(...)`, interpolar ni serializar directamente para logs: usa `revealSensitiveUrlForDownload()` solo justo antes de la descarga real. */
  url: SensitiveFeedUrl;
};

export type AwinFeedListResult =
  | { status: "approved"; rowNumber: number; feed: AwinFeedListEntry }
  /** Fila estructuralmente válida, pero su `Membership Status` no es "Joined" — nunca se selecciona automáticamente, pero tampoco desaparece en silencio: se reporta para que quede constancia de que existe. */
  | { status: "skipped"; rowNumber: number; reason: "not_joined"; advertiserId: string; feedId: string; membershipStatus: string }
  | { status: "invalid"; rowNumber: number; code: string; message: string };

const COLUMN_ALIASES = {
  advertiserId: ["Advertiser ID"],
  advertiserName: ["Advertiser Name"],
  primaryRegion: ["Primary Region"],
  membershipStatus: ["Membership Status"],
  feedId: ["Feed ID"],
  feedName: ["Feed Name"],
  language: ["Language"],
  vertical: ["Vertical"],
  lastImported: ["Last Imported"],
  url: ["URL"],
} as const;

const REQUIRED_COLUMN_GROUPS: readonly (readonly string[])[] = [
  COLUMN_ALIASES.advertiserId,
  COLUMN_ALIASES.feedId,
  COLUMN_ALIASES.membershipStatus,
  COLUMN_ALIASES.url,
];

const ID_PATTERN = /^\d+$/;

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
      throw new AwinFeedListFatalError("MISSING_REQUIRED_COLUMNS", `La cabecera de la lista de feeds no contiene ninguna de las columnas esperadas: ${group.join(" / ")}.`);
    }
  }
}

/** `null` si la fila tiene un número de columnas distinto al de la cabecera — nunca se alinean campos a ciegas cuando eso ocurre. */
function recordFromRow(headerColumns: string[], row: string[]): Record<string, string> | null {
  if (row.length !== headerColumns.length) return null;
  const record: Record<string, string> = {};
  headerColumns.forEach((key, idx) => {
    record[key] = (row[idx] ?? "").trim();
  });
  return record;
}

/** Normaliza un componente de identidad de forma estable: recorta espacios, aplica NFKC (formas Unicode equivalentes por compatibilidad, no solo composición canónica) y pasa a minúsculas — `null`/ausente se trata igual que cadena vacía, igual que ya hace `pickField(...) || null` en el resto del fichero. */
function normalizeIdentityComponent(value: string | null): string {
  return (value ?? "").trim().normalize("NFKC").toLowerCase();
}

/**
 * Codifica un componente ya normalizado con un prefijo de longitud
 * ("netstring"-style: `${longitud}:${valor}`) antes de concatenarlo con
 * los demás SIN separador. Esto hace la codificación conjunta inyectiva:
 * decodificar de izquierda a derecha (leer dígitos hasta el primer `:`,
 * consumir exactamente esa cantidad de caracteres, repetir) recupera de
 * forma determinista la tupla original de componentes, así que ningún
 * carácter dentro de un componente — incluido `:`, dígitos, o cualquier
 * cosa que se hubiera usado ingenuamente como separador — puede hacer que
 * dos tuplas distintas produzcan el mismo identificador final.
 */
function encodeIdentityComponent(value: string): string {
  return `${value.length}:${value}`;
}

/**
 * Identidad determinista y SIN COLISIONES de un feed: combina, en este
 * orden fijo, `advertiserId`, `feedId`, `language`, `vertical` y
 * `primaryRegion` — un mismo anunciante/feed en un idioma, vertical o
 * región distintos es, a efectos de identidad, un feed DISTINTO. Cada
 * componente se normaliza (ver `normalizeIdentityComponent`) y se
 * codifica con prefijo de longitud (ver `encodeIdentityComponent`) antes
 * de concatenarse, así que la identidad resultante nunca colisiona entre
 * combinaciones distintas de los 5 campos.
 */
function computeFeedIdentity(params: { advertiserId: string; feedId: string; language: string | null; vertical: string | null; primaryRegion: string | null }): string {
  return [params.advertiserId, params.feedId, params.language, params.vertical, params.primaryRegion].map(normalizeIdentityComponent).map(encodeIdentityComponent).join("");
}

/** `true` solo si el texto, tras recortar espacios exteriores e ignorar mayúsculas/minúsculas, es exactamente "joined" — nunca una coincidencia parcial ("Not Joined" NO debe colar aquí). */
function isJoined(rawMembershipStatus: string): boolean {
  return rawMembershipStatus.trim().toLowerCase() === "joined";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Representación SEGURA de una URL de descarga de feed para logs y
 * diagnósticos: SOLO el esquema y el host, NUNCA la ruta, la query ni el
 * fragmento (que es donde vive el token/clave de descarga) — ni siquiera
 * un trozo de ellos. Si la URL ni siquiera se puede analizar, devuelve un
 * marcador genérico, nunca el texto original.
 */
export function redactFeedListUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return "[URL de feed no analizable]";
  }
}

/**
 * Envoltorio de una URL de descarga de feed que NUNCA expone su valor
 * real por accidente. El valor crudo vive en `#raw`, un campo privado
 * NATIVO de ECMAScript (no el modificador `private` de TypeScript, que
 * se borra al compilar y deja una propiedad enumerable normal): un campo
 * `#raw` no es una propiedad enumerable, no aparece en `Object.keys`,
 * `Object.entries`, `for...in` ni en un spread (`{...instancia}`), y por
 * tanto tampoco en `JSON.stringify` de un objeto que contenga esta
 * instancia salvo que se llame explícitamente a un método — que aquí
 * siempre devuelve la versión REDACTADA:
 *   - `toString()` / interpolación de plantillas (`` `${url}` ``): redactada.
 *   - `toJSON()`, usado automáticamente por `JSON.stringify`: redactada.
 *   - inspección de Node (`console.log`, `util.inspect`): redactada.
 * La ÚNICA forma de obtener la URL real es `revealSensitiveUrlForDownload()`
 * — nombrada a propósito como operación sensible, fácil de auditar/buscar
 * en el código; solo debe llamarse justo antes de la petición HTTP real
 * de descarga del feed (bloque posterior, todavía sin construir).
 */
export class SensitiveFeedUrl {
  readonly #raw: string;

  constructor(raw: string) {
    this.#raw = raw;
  }

  #redacted(): string {
    return redactFeedListUrl(this.#raw);
  }

  toString(): string {
    return this.#redacted();
  }

  toJSON(): string {
    return this.#redacted();
  }

  /** Hook de inspección de Node (`util.inspect`/`console.log`) — se usa por su nombre de Symbol bien conocido para no obligar a importar `node:util` aquí. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `SensitiveFeedUrl(${this.#redacted()})`;
  }

  /**
   * Operación SENSIBLE explícita: devuelve la URL real íntegra, con el
   * token/clave de descarga incluido. Úsala SOLO justo antes de la
   * petición HTTP real de descarga del feed — nunca para registrar,
   * mostrar, interpolar ni serializar.
   */
  revealSensitiveUrlForDownload(): string {
    return this.#raw;
  }
}

function normalizeFeedListRow(record: Record<string, string>, headerIndex: Map<string, string>): AwinFeedListEntry {
  const advertiserId = pickField(headerIndex, record, COLUMN_ALIASES.advertiserId);
  if (!advertiserId) throw new AwinFeedListRowError("MISSING_FIELD", 'Falta "Advertiser ID".');
  if (!ID_PATTERN.test(advertiserId)) throw new AwinFeedListRowError("INVALID_ADVERTISER_ID", '"Advertiser ID" no es un identificador numérico válido.');

  const feedId = pickField(headerIndex, record, COLUMN_ALIASES.feedId);
  if (!feedId) throw new AwinFeedListRowError("MISSING_FIELD", 'Falta "Feed ID".');
  if (!ID_PATTERN.test(feedId)) throw new AwinFeedListRowError("INVALID_FEED_ID", '"Feed ID" no es un identificador numérico válido.');

  const advertiserName = pickField(headerIndex, record, COLUMN_ALIASES.advertiserName);
  if (!advertiserName) throw new AwinFeedListRowError("MISSING_FIELD", 'Falta "Advertiser Name".');

  const feedName = pickField(headerIndex, record, COLUMN_ALIASES.feedName);
  if (!feedName) throw new AwinFeedListRowError("MISSING_FIELD", 'Falta "Feed Name".');

  const membershipStatus = pickField(headerIndex, record, COLUMN_ALIASES.membershipStatus);
  if (!membershipStatus) throw new AwinFeedListRowError("MISSING_FIELD", 'Falta "Membership Status".');

  const rawUrl = pickField(headerIndex, record, COLUMN_ALIASES.url);
  if (!rawUrl) throw new AwinFeedListRowError("MISSING_FIELD", 'Falta "URL".');
  // El mensaje de error NUNCA incluye `rawUrl` ni ningún fragmento suyo,
  // ni siquiera aquí, donde el problema es justo que la URL es inválida.
  if (!isHttpUrl(rawUrl)) throw new AwinFeedListRowError("INVALID_URL", '"URL" no es una URL http(s) válida.');

  const rawLastImported = pickField(headerIndex, record, COLUMN_ALIASES.lastImported);
  let lastImported: Date | null = null;
  if (rawLastImported) {
    const parsed = new Date(rawLastImported);
    if (Number.isNaN(parsed.getTime())) {
      throw new AwinFeedListRowError("INVALID_DATE", `"Last Imported" no es una fecha válida.`);
    }
    lastImported = parsed;
  }

  const primaryRegion = pickField(headerIndex, record, COLUMN_ALIASES.primaryRegion) || null;
  const language = pickField(headerIndex, record, COLUMN_ALIASES.language) || null;
  const vertical = pickField(headerIndex, record, COLUMN_ALIASES.vertical) || null;

  return {
    id: computeFeedIdentity({ advertiserId, feedId, language, vertical, primaryRegion }),
    advertiserId,
    advertiserName,
    primaryRegion,
    membershipStatus,
    feedId,
    feedName,
    language,
    vertical,
    lastImported,
    url: new SensitiveFeedUrl(rawUrl),
  };
}

/**
 * Parsea la lista de feeds de Awin en streaming, fila a fila, y clasifica
 * cada una en `"approved"` (Joined, lista para un bloque posterior),
 * `"skipped"` (válida pero no Joined — nunca se selecciona sola) o
 * `"invalid"` (fila rechazada, con código/mensaje que NUNCA incluye la
 * URL). Nunca escribe en la base de datos ni hace ninguna petición de
 * red: produce únicamente la clasificación en memoria.
 */
export async function* parseAwinFeedList(input: AsyncIterable<string> | string): AsyncGenerator<AwinFeedListResult> {
  const source = typeof input === "string" ? singleChunk(input) : input;

  let headerColumns: string[] | null = null;
  let headerIndex: Map<string, string> | null = null;
  let rowNumber = 0;

  for await (const rawRow of parseCsvStream(source)) {
    if (headerColumns === null) {
      headerColumns = rawRow.map((h) => h.trim());
      headerIndex = buildHeaderIndex(headerColumns);
      assertRequiredColumns(headerIndex);
      continue;
    }

    rowNumber += 1;
    const record = recordFromRow(headerColumns, rawRow);
    if (record === null) {
      yield {
        status: "invalid",
        rowNumber,
        code: "COLUMN_COUNT_MISMATCH",
        message: `La fila tiene ${rawRow.length} columna(s), pero la cabecera declara ${headerColumns.length}.`,
      };
      continue;
    }

    try {
      const feed = normalizeFeedListRow(record, headerIndex!);
      if (isJoined(feed.membershipStatus)) {
        yield { status: "approved", rowNumber, feed };
      } else {
        yield { status: "skipped", rowNumber, reason: "not_joined", advertiserId: feed.advertiserId, feedId: feed.feedId, membershipStatus: feed.membershipStatus };
      }
    } catch (error) {
      if (error instanceof AwinFeedListRowError) {
        yield { status: "invalid", rowNumber, code: error.code, message: error.message };
        continue;
      }
      // Cualquier excepción no prevista se deja propagar: nunca se
      // convierte en silencio en una simple fila inválida.
      throw error;
    }
  }

  if (headerColumns === null) {
    throw new AwinFeedListFatalError("MISSING_HEADER", "La lista de feeds no contiene ninguna fila (ni siquiera una cabecera de columnas): no se puede procesar.");
  }
}
