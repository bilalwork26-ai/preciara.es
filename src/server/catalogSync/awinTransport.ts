/**
 * Transporte HTTP seguro para descargar, en streaming, los dos documentos
 * de Awin que el resto de este bloque ("catalog-sync-core") ya sabe
 * interpretar pero todavía no sabe traer de la red:
 *   1. la lista de feeds ("Product Feed List Download") — se entrega,
 *      fragmento a fragmento, a `parseAwinFeedList` (`awinFeedListParser.ts`);
 *   2. un feed Legacy CSV de productos de un anunciante concreto — se
 *      entrega, fragmento a fragmento, a `parseAwinProductFeed`
 *      (`awinFeedParser.ts`).
 *
 * Este bloque se limita EXCLUSIVAMENTE al transporte: construir la URL
 * oficial de la lista, hacer la petición HTTP con las protecciones de
 * seguridad descritas abajo, descomprimir/decodificar el cuerpo en
 * streaming, y entregarlo a los parsers ya existentes. NO toca la base de
 * datos, NO llama a `runCatalogSync`, NO lee variables de entorno (la API
 * key se recibe siempre como parámetro explícito — la conexión con la
 * configuración real, incluida la lectura de credenciales desde el
 * entorno, es un bloque posterior, todavía sin construir) y NO implementa
 * cron/programador.
 *
 * SIN DEPENDENCIAS NUEVAS: todo lo necesario (fetch, `AbortController`,
 * `TextDecoder`, `ReadableStream`, `node:zlib`, `node:stream`) ya es nativo
 * del runtime de Node de este proyecto (Node 22) — no se ha añadido ni se
 * necesita ningún paquete nuevo.
 *
 * ───────────────────────── SEGURIDAD ─────────────────────────
 *
 * Lista cerrada de hosts oficiales del feed Legacy de Awin (ver
 * `ALLOWED_HOSTS`): CUALQUIER URL (la inicial o el destino de una
 * redirección) cuyo host no sea EXACTAMENTE uno de estos dos se rechaza,
 * sin excepción. Al ser una comparación de igualdad exacta contra una
 * lista cerrada — nunca "termina en" ni "contiene" — esto rechaza de
 * forma automática, sin necesidad de reglas adicionales:
 *   - subdominios engañosos (`productdata.awin.com.evil.example`);
 *   - hosts parecidos (`productdata-awin.com`, `awin.com.productdata.evil`);
 *   - direcciones IP (nunca aparecen en la lista de hosts permitidos);
 *   - `localhost` y cualquier destino local/privado (tampoco en la lista);
 *   - dominios internacionalizados que se parezcan visualmente a uno
 *     permitido (`URL` los normaliza a punycode ASCII antes de comparar,
 *     así que un homógrafo produce un host ASCII distinto del permitido).
 * Además, `assertSafeUrl` exige explícitamente HTTPS, rechaza usuario/
 * contraseña embebidos en la URL y rechaza cualquier puerto que no sea el
 * estándar de HTTPS (443) — ver sus comentarios más abajo.
 *
 * Las redirecciones NUNCA se siguen automáticamente: cada petición se hace
 * con `redirect: "manual"`, y cada destino de redirección pasa por la
 * MISMA `assertSafeUrl` antes de seguirse, con un límite pequeño de saltos
 * (`maxRedirects`) para cortar bucles o cadenas excesivas.
 *
 * Ningún error público de este módulo (`AwinTransportError`) interpola
 * jamás la URL completa, la ruta, la query ni el host solicitado — sus
 * mensajes son siempre texto fijo por código, nunca construidos a partir
 * de la URL ni del mensaje crudo de un error de `fetch` (que en algunos
 * entornos puede incluir la URL solicitada): un fallo de red se reclasifica
 * siempre como `AwinTransportError("NETWORK_ERROR", …)` con un mensaje fijo,
 * descartando el mensaje original. La API key en sí solo vive en memoria,
 * el tiempo de construir la URL de la lista (`buildAwinFeedListUrl`) —
 * nunca se registra, nunca se guarda en ningún sitio.
 *
 * `SensitiveFeedUrl` (definido en `awinFeedListParser.ts`) solo se revela
 * DENTRO de este módulo, justo antes de la petición HTTP real de descarga
 * del feed de productos (`downloadAwinProductFeed`) — en ningún otro sitio
 * del código se llama a `revealSensitiveUrlForDownload()`. La URL de la
 * LISTA de feeds es igual de secreta (también lleva la API key en la
 * ruta): `buildAwinFeedListUrl` NUNCA devuelve un `URL`/`string` normal,
 * siempre un `SensitiveFeedUrl` — solo `downloadAwinFeedList`, dentro de
 * este mismo módulo, la revela justo antes de la petición.
 *
 * El timeout cubre TODA la descarga, no solo la llegada de las cabeceras:
 * además del timeout de CONEXIÓN (`timeoutMs`, ver `attemptOnce`), la
 * lectura del cuerpo tiene su propio timeout de INACTIVIDAD
 * (`idleTimeoutMs`, ver `withIdleTimeout`) que se reinicia con cada
 * fragmento recibido — así una respuesta 200 cuyo cuerpo se queda
 * colgado a mitad (sin cerrarse ni fallar nunca) también se corta, se
 * cancela/libera el stream, y se lanza un error seguro, en vez de esperar
 * para siempre.
 *
 * ─────────────────────── STREAMING Y GZIP ───────────────────────
 *
 * El cuerpo de la respuesta nunca se materializa entero en memoria: se
 * consume como `AsyncIterable<Uint8Array>` (el propio `Response.body`,
 * que en este runtime ya implementa iteración asíncrona de forma nativa),
 * se decodifica a texto con `TextDecoder` en modo `stream: true` (garantiza
 * que un carácter UTF-8 multibyte partido entre dos fragmentos se decodifica
 * igualmente bien — es la misma garantía de plataforma en la que ya confía
 * `streamingCsv.ts`, aplicada aquí un nivel más abajo, a bytes en vez de a
 * `string`), y se entrega tal cual, fragmento a fragmento, al parser
 * correspondiente.
 *
 * La detección de gzip se hace por los DOS BYTES MÁGICOS iniciales
 * (`0x1f 0x8b`), nunca solo por la cabecera `Content-Encoding` — porque
 * `fetch` puede haber descomprimido ya el cuerpo de forma transparente
 * (según el `Accept-Encoding` que negocie el propio runtime) dejando esa
 * cabecera puesta pero el cuerpo ya en texto plano; mirar solo la cabecera
 * en ese caso intentaría des-gzipear datos que ya no están comprimidos.
 * Para poder mirar esos dos bytes sin perder datos, se retienen como mucho
 * los primeros 2 bytes del cuerpo en un buffer pequeño y de tamaño fijo
 * (`detectGzipAndDecompress`) — nunca un buffer sin límite.
 *
 * Una interrupción real del stream (fallo de red a mitad de la descarga) o
 * un gzip truncado NUNCA se presentan como una descarga completa: ambos
 * casos hacen que la iteración del cuerpo lance una excepción, que se deja
 * propagar sin capturar hasta `parseCsvStream` (`streamingCsv.ts`) — que ya
 * está diseñado para convertir cualquier fallo de su fuente de fragmentos
 * en `StreamingCsvTruncatedError`, el mismo tratamiento que un CSV con una
 * comilla sin cerrar. No se duplica esa lógica aquí.
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { parseAwinFeedList, SensitiveFeedUrl, type AwinFeedListResult } from "./awinFeedListParser";
import { parseAwinProductFeed, type AwinFeedContext, type AwinFeedRowResult } from "./awinFeedParser";

/** Hosts oficiales del feed Legacy de Awin — lista cerrada, comparación EXACTA (ver comentario de cabecera sobre por qué esto basta para rechazar subdominios engañosos, IPs y destinos locales/privados). */
export const AWIN_ALLOWED_TRANSPORT_HOSTS = ["productdata.awin.com", "datafeed.api.productserve.com", "ui.awin.com"] as const;
const ALLOWED_HOSTS = new Set<string>(AWIN_ALLOWED_TRANSPORT_HOSTS);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 2_000;

/** Cualquier fallo del transporte: construcción de URL, seguridad, red, timeout, redirecciones o código HTTP final. El mensaje NUNCA incluye la URL, la ruta, la query ni la API key (ver comentario de cabecera). */
export class AwinTransportError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Códigos de `AwinTransportError` que representan un fallo TRANSITORIO (red o timeout) y por tanto sí se reintentan — todo lo demás (seguridad, redirecciones mal formadas, códigos HTTP 4xx permanentes) se considera un fallo definitivo y nunca se reintenta. */
function isTransientErrorCode(code: string): boolean {
  return code === "TIMEOUT" || code === "NETWORK_ERROR";
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export type AwinTransportWait = (attempt: number, delayMs: number) => Promise<void>;

export type AwinTransportOptions = {
  /** Implementación de `fetch` a usar — por defecto la global del runtime. Las pruebas SIEMPRE inyectan aquí un `fetch` simulado: este módulo nunca hace tráfico de red real en pruebas. */
  fetchImpl?: typeof fetch;
  /** Tiempo máximo de CONEXIÓN por intento (hasta recibir cabeceras; no acumulado entre reintentos) antes de abortar vía `AbortController`. */
  timeoutMs?: number;
  /** Tiempo máximo de INACTIVIDAD leyendo el CUERPO de una respuesta ya conectada: se reinicia con cada fragmento recibido. Si no llega ningún fragmento nuevo dentro de este plazo, se cancela el stream y se lanza `BODY_IDLE_TIMEOUT` — protege contra un servidor que responde 200 y luego deja el cuerpo colgado indefinidamente (ver comentario de cabecera). */
  idleTimeoutMs?: number;
  /** Número máximo de saltos de redirección seguidos antes de abortar con `TOO_MANY_REDIRECTS`. */
  maxRedirects?: number;
  /** Número máximo de intentos TOTALES (el primero incluido) ante fallos transitorios, 429 o 5xx. */
  maxAttempts?: number;
  /** Espera entre reintentos, inyectable en pruebas para no depender de temporizadores reales. Por defecto, espera real con backoff exponencial acotado. */
  wait?: AwinTransportWait;
};

type ResolvedOptions = Required<Pick<AwinTransportOptions, "fetchImpl" | "timeoutMs" | "idleTimeoutMs" | "maxRedirects" | "maxAttempts" | "wait">>;

function defaultWait(_attempt: number, delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function computeBackoffMs(attempt: number): number {
  return Math.min(DEFAULT_BASE_DELAY_MS * 2 ** (attempt - 1), DEFAULT_MAX_DELAY_MS);
}

function resolveOptions(options: AwinTransportOptions | undefined): ResolvedOptions {
  return {
    fetchImpl: options?.fetchImpl ?? fetch,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    idleTimeoutMs: options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    maxRedirects: options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    maxAttempts: options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    wait: options?.wait ?? defaultWait,
  };
}

/**
 * Valida que `url` cumple TODAS las condiciones de seguridad obligatorias
 * antes de usarla en cualquier petición (inicial o destino de una
 * redirección) — ver el comentario de cabecera del fichero para el
 * razonamiento completo de por qué esto basta para rechazar hosts
 * engañosos, IPs y destinos locales/privados sin reglas adicionales.
 */
function assertSafeUrl(url: URL): void {
  if (url.protocol !== "https:") {
    throw new AwinTransportError("INSECURE_SCHEME", "Solo se permiten URLs HTTPS.");
  }
  if (url.username || url.password) {
    throw new AwinTransportError("EMBEDDED_CREDENTIALS", "La URL no puede incluir usuario/contraseña embebidos.");
  }
  // `URL.port` viene vacío cuando coincide con el puerto por defecto del
  // esquema (443 en HTTPS): cualquier valor no vacío aquí es, por
  // definición, un puerto explícito distinto del estándar.
  if (url.port !== "") {
    throw new AwinTransportError("NON_STANDARD_PORT", "Solo se permite el puerto HTTPS estándar.");
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new AwinTransportError("HOST_NOT_ALLOWED", "El host de destino no está en la lista de hosts oficiales permitidos.");
  }
}

/**
 * Construye (INTERNO, nunca exportado — ver `buildAwinFeedListUrl` pública
 * más abajo) la URL oficial de descarga de la lista de feeds de Awin a
 * partir de una API key recibida explícitamente (nunca leída de variables
 * de entorno aquí — ver comentario de cabecera). La API key vive
 * únicamente en memoria mientras se construye esta URL, y se codifica
 * como UN ÚNICO segmento de ruta con `encodeURIComponent` — que escapa
 * `/`, `?`, `#` y cualquier otro carácter especial de la propia API key,
 * así que esta nunca puede inyectar un segmento de ruta ni parámetros de
 * query adicionales. Se codifica una SOLA vez, directamente sobre el
 * valor crudo recibido (nunca sobre un valor ya codificado antes): no hay
 * doble codificación posible.
 *
 * NOTA sobre la ruta exacta: se reconstruye siguiendo el mismo patrón de
 * URL de descarga por API key ya usado en `awinFeedListParser.test.ts`
 * para el feed de productos (`/apikey/{key}` en el host `productdata.awin.com`),
 * combinado con la documentación oficial de "Product Feed List Download"
 * citada en `awinFeedListParser.ts`. `WebFetch` sigue devolviendo
 * "EGRESS_BLOCKED" para `help.awin.com` en este entorno (igual que en los
 * bloques anteriores), así que esta ruta concreta no se ha podido
 * releer/confirmar directamente aquí: antes de conectar una cuenta real de
 * Awin (bloque posterior), confírmala contra el panel real de la cuenta.
 */
function buildAwinFeedListUrlInternal(apiKey: string, configuredUrl?: string): URL {
  if (configuredUrl !== undefined) {
    let url: URL;
    try {
      url = new URL(configuredUrl.trim());
    } catch {
      throw new AwinTransportError("INVALID_FEED_LIST_URL", "La URL configurada para la lista de feeds no es válida.");
    }
    assertSafeUrl(url);
    if (
      url.hostname.toLowerCase() !== "ui.awin.com" ||
      !url.pathname.startsWith("/productdata-darwin-download/publisher/") ||
      !url.pathname.endsWith("/feedlist")
    ) {
      throw new AwinTransportError("INVALID_FEED_LIST_URL", "La URL configurada no corresponde a la descarga oficial de la lista de feeds de Awin.");
    }
    return url;
  }
  if (!apiKey.trim()) {
    throw new AwinTransportError("MISSING_API_KEY", "Falta la API key para construir la URL de la lista de feeds.");
  }
  let url: URL;
  try {
    url = new URL(`https://${AWIN_ALLOWED_TRANSPORT_HOSTS[0]}/datafeed/list/apikey/${encodeURIComponent(apiKey)}`);
  } catch {
    // Nunca debería ocurrir (`encodeURIComponent` produce siempre un
    // segmento de ruta válido), pero si algún día ocurriera, el mensaje
    // NUNCA debe incluir la API key cruda — ver comentario de cabecera.
    throw new AwinTransportError("INVALID_API_KEY", "No se pudo construir una URL válida con la API key proporcionada.");
  }
  assertSafeUrl(url);
  return url;
}

/**
 * Construye la URL oficial de la lista de feeds de Awin, envuelta en
 * `SensitiveFeedUrl` — NUNCA un `URL`/`string` normal. Esta URL lleva la
 * API key en la ruta, así que es tan secreta como la de un feed de
 * productos individual (ver `SensitiveFeedUrl` en `awinFeedListParser.ts`
 * y el comentario de cabecera de este fichero): devolverla como un `URL`
 * normal permitiría que `String(url)`, la interpolación de plantillas,
 * `JSON.stringify` o la inspección de Node/`console.log` la filtraran por
 * accidente. Su valor real solo se revela DENTRO de este módulo, justo
 * antes de la petición HTTP (`downloadAwinFeedList`) — en ningún otro
 * sitio del código se llama a `revealSensitiveUrlForDownload()` sobre
 * ella.
 */
export function buildAwinFeedListUrl(apiKey: string, configuredUrl?: string): SensitiveFeedUrl {
  return new SensitiveFeedUrl(buildAwinFeedListUrlInternal(apiKey, configuredUrl).toString());
}

/** Libera/cancela el cuerpo de una respuesta que no se va a leer (redirección ya seguida, respuesta que se va a reintentar, o error final) — nunca deja un cuerpo sin drenar. Best-effort: un fallo aquí nunca debe enmascarar el error real que se esté propagando. */
async function discardBody(response: Response): Promise<void> {
  const body = response.body as unknown as { cancel?: () => Promise<void> } | null;
  if (body && typeof body.cancel === "function") {
    await body.cancel().catch(() => undefined);
  }
}

/**
 * Hace UN intento de descarga completo, siguiendo manualmente las
 * redirecciones que apunten a un destino autorizado (ver `assertSafeUrl`),
 * con un único `AbortController`/timeout para todo el intento (los saltos
 * de redirección de un mismo intento comparten presupuesto de tiempo; cada
 * REINTENTO del nivel superior obtiene un presupuesto nuevo).
 *
 * Nunca sigue una redirección insegura: cada destino se valida con
 * `assertSafeUrl` antes de seguirse, y el número de saltos está acotado
 * por `maxRedirects` — corta tanto una cadena excesiva como un bucle.
 *
 * Lanza `AwinTransportError` con código `"TIMEOUT"` o `"NETWORK_ERROR"`
 * (fallos TRANSITORIOS, ver `isTransientErrorCode`) si `fetch` falla o se
 * agota el tiempo — el mensaje original de `fetch` (que podría incluir la
 * URL) se descarta siempre, nunca se reutiliza ni se adjunta como `cause`.
 * Cualquier otro código (seguridad, redirecciones mal formadas) es
 * definitivo y no se reintenta.
 */
async function attemptOnce(initialUrl: URL, resolved: ResolvedOptions): Promise<Response> {
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, resolved.timeoutMs);

  try {
    let currentUrl = initialUrl;
    for (let hop = 0; ; hop++) {
      assertSafeUrl(currentUrl);

      let response: Response;
      try {
        response = await resolved.fetchImpl(currentUrl.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        if (timedOut) throw new AwinTransportError("TIMEOUT", "La petición superó el tiempo máximo de espera.");
        throw new AwinTransportError("NETWORK_ERROR", "Fallo de red al intentar completar la petición.");
      }

      if (!REDIRECT_STATUSES.has(response.status)) return response;

      await discardBody(response);
      if (hop >= resolved.maxRedirects) {
        throw new AwinTransportError("TOO_MANY_REDIRECTS", "Se superó el número máximo de redirecciones permitidas.");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new AwinTransportError("REDIRECT_WITHOUT_LOCATION", "El servidor respondió con una redirección sin cabecera Location.");
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new AwinTransportError("INVALID_REDIRECT_URL", "La URL de redirección recibida no es válida.");
      }
      currentUrl = nextUrl; // se valida con assertSafeUrl al volver a la cabecera del bucle, antes de seguirla.
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hace la petición con reintentos: repite `attemptOnce` ante fallos
 * TRANSITORIOS (red/timeout) o respuestas 429/5xx, con un número acotado
 * de intentos y espera inyectable (`resolved.wait`) — nunca reintenta un
 * código 4xx permanente (400/401/403/404/…) ni un fallo de seguridad o de
 * redirección, que se propagan de inmediato.
 */
async function performRequestWithRetries(url: URL, resolved: ResolvedOptions): Promise<Response> {
  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await attemptOnce(url, resolved);
    } catch (error) {
      if (!(error instanceof AwinTransportError) || !isTransientErrorCode(error.code)) throw error;
      if (attempt === resolved.maxAttempts) throw error;
      await resolved.wait(attempt, computeBackoffMs(attempt));
      continue;
    }

    if (response.status >= 200 && response.status < 300) return response;

    await discardBody(response);
    if (isRetryableStatus(response.status) && attempt < resolved.maxAttempts) {
      await resolved.wait(attempt, computeBackoffMs(attempt));
      continue;
    }
    throw new AwinTransportError(`HTTP_${response.status}`, `La descarga falló con código HTTP ${response.status}.`);
  }
  // Inalcanzable en la práctica (el bucle siempre devuelve o lanza), pero
  // TypeScript necesita una salida explícita para toda ruta de código.
  throw new AwinTransportError("RETRIES_EXHAUSTED", "Se agotaron los reintentos sin obtener una respuesta válida.");
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Detecta si el cuerpo es gzip REAL por sus dos bytes mágicos iniciales
 * (`0x1f 0x8b`) — nunca por la cabecera `Content-Encoding`, que puede
 * seguir presente aunque `fetch` ya haya descomprimido el cuerpo de forma
 * transparente (ver comentario de cabecera del fichero). Para mirar esos
 * bytes sin perder datos, retiene como mucho los primeros 2 bytes del
 * cuerpo en un buffer pequeño y de tamaño FIJO — nunca sin límite — y los
 * reintegra al principio del flujo resultante en cualquiera de los dos
 * casos.
 *
 * Si es gzip, descomprime en streaming con `node:zlib`; un gzip truncado
 * hace que la iteración lance (nunca se presenta como completo — ver
 * comentario de cabecera).
 */
async function* detectGzipAndDecompress(byteSource: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const iterator = byteSource[Symbol.asyncIterator]();
  const buffered: Uint8Array[] = [];
  let bufferedLength = 0;
  while (bufferedLength < 2) {
    const { value, done } = await iterator.next();
    if (done) break;
    if (value.length === 0) continue;
    buffered.push(value);
    bufferedLength += value.length;
  }
  const head = concatUint8Arrays(buffered);
  const isGzip = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;

  async function* rest(): AsyncGenerator<Uint8Array> {
    if (head.length > 0) yield head;
    while (true) {
      const { value, done } = await iterator.next();
      if (done) return;
      yield value;
    }
  }

  if (!isGzip) {
    yield* rest();
    return;
  }

  const gunzip = createGunzip();
  const nodeSource = Readable.from(rest());
  // `.pipe()` NO reenvía por sí solo los errores de la fuente hacia el
  // destino: hay que destruir `gunzip` explícitamente si la fuente falla
  // (p. ej. una interrupción de red a mitad de la descarga), para que ese
  // fallo se propague como un error de `gunzip` y no se pierda en silencio.
  nodeSource.on("error", (err) => gunzip.destroy(err));
  nodeSource.pipe(gunzip);
  for await (const chunk of gunzip) {
    yield chunk as Uint8Array;
  }
}

/** Decodifica bytes a texto UTF-8 en streaming: `TextDecoder` con `stream: true` garantiza que un carácter multibyte partido exactamente entre dos fragmentos (incluido un BOM partido) se decodifica igual de bien que si llegara entero — la misma garantía de plataforma en la que ya confía `streamingCsv.ts`. */
async function* bytesToText(byteSource: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  for await (const chunk of byteSource) {
    const text = decoder.decode(chunk, { stream: true });
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

/** Un `AsyncGenerator<string>` que nunca produce nada — la representación de "cuerpo vacío/sin body" que consume `parseAwinFeedList`/`parseAwinProductFeed` como un feed sin filas. */
async function* emptyTextStream(): AsyncGenerator<string> {}

/** Cancela/libera una fuente de bytes ya conectada (un `Response.body` o cualquier objeto con `.cancel()`) — el mismo tratamiento best-effort que `discardBody`, reutilizado aquí para la fuente que consume `withIdleTimeout`. Un fallo aquí nunca debe enmascarar el error real que se esté propagando. */
async function cancelByteSource(source: unknown): Promise<void> {
  const body = source as { cancel?: (reason?: unknown) => Promise<void> };
  if (typeof body?.cancel === "function") {
    await body.cancel().catch(() => undefined);
  }
}

/**
 * Envuelve una fuente de bytes ya conectada con un timeout de INACTIVIDAD
 * (`idleTimeoutMs`) que se reinicia con CADA fragmento recibido — nunca
 * un único plazo acumulado para todo el cuerpo, para no cortar un feed
 * grande que sigue avanzando correctamente aunque tarde (ver comentario
 * de cabecera del fichero). Cubre también la espera del PRIMER fragmento:
 * el temporizador arranca antes de la primera lectura.
 *
 * Si no llega ningún fragmento nuevo (ni siquiera el fin del stream)
 * dentro del plazo, cancela/libera la fuente subyacente
 * (`cancelByteSource`) y lanza `AwinTransportError("BODY_IDLE_TIMEOUT", …)`
 * — un mensaje fijo, nunca construido a partir de la URL. Ese error se
 * deja propagar tal cual hasta `parseCsvStream` (`streamingCsv.ts`), que
 * lo reinterpreta como `StreamingCsvTruncatedError` — la MISMA categoría
 * que un corte de red o un gzip truncado (ver comentario de cabecera):
 * semánticamente es exactamente eso, una descarga que se queda a medias.
 * `StreamingCsvTruncatedError` conserva el `AwinTransportError` original
 * en su propiedad `cause`, así que el código y el mensaje seguros de
 * `BODY_IDLE_TIMEOUT` no se pierden, aunque el tipo público expuesto sea
 * uniforme con el resto de truncamientos.
 *
 * Libera SIEMPRE el temporizador y la fuente al terminar (éxito, fallo, o
 * si el propio consumidor deja de iterar antes de tiempo — un `break` en
 * el `for await` del llamador cierra este generador, lo que ejecuta el
 * `finally` de abajo igual que un final normal).
 */
async function* withIdleTimeout(source: AsyncIterable<Uint8Array>, idleTimeoutMs: number): AsyncGenerator<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    while (true) {
      const nextPromise = iterator.next();
      // Si esta lectura "gana" la carrera contra el timeout más abajo, se
      // abandona sin esperarla: sin este `catch` de seguridad, un rechazo
      // tardío de una promesa que ya nadie más observa generaría una
      // advertencia de "unhandled rejection" en Node.
      nextPromise.catch(() => undefined);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const idleTimeout = new Promise<"idle-timeout">((resolve) => {
        timer = setTimeout(() => resolve("idle-timeout"), idleTimeoutMs);
      });

      let result: IteratorResult<Uint8Array> | "idle-timeout";
      try {
        result = await Promise.race([nextPromise, idleTimeout]);
      } finally {
        clearTimeout(timer);
      }

      if (result === "idle-timeout") {
        await cancelByteSource(source);
        throw new AwinTransportError("BODY_IDLE_TIMEOUT", "La descarga se detuvo: no llegaron más datos dentro del tiempo de inactividad permitido.");
      }
      if (result.done) return;
      yield result.value;
    }
  } finally {
    await cancelByteSource(source);
  }
}

/**
 * Fase de CONEXIÓN: valida la URL, hace la petición con reintentos y
 * redirecciones seguras, y — solo una vez que hay una respuesta 2xx real —
 * devuelve el generador que entregará su cuerpo como texto UTF-8
 * incremental (detectando y descomprimiendo gzip real cuando corresponda).
 *
 * Deliberadamente una función `async` normal (no un generador): TODO el
 * trabajo de conexión (seguridad, red, timeout, reintentos, código HTTP)
 * ocurre y puede fallar AQUÍ, antes de devolver nada — nunca dentro del
 * generador de texto que consumirá `parseCsvStream`. Esto importa porque
 * `parseCsvStream` (`streamingCsv.ts`) captura CUALQUIER excepción que
 * lance su fuente de fragmentos y la reinterpreta siempre como
 * `StreamingCsvTruncatedError` (fuente truncada) — correcto para una
 * interrupción real a MITAD de un cuerpo que ya empezó a llegar (gzip
 * truncado, corte de red mid-stream), pero mezclaría por error nuestros
 * códigos de `AwinTransportError` (seguridad, HTTP, timeout, reintentos
 * agotados) con esa misma categoría genérica si ocurrieran dentro del
 * generador consumido. Separar "conectar" (puede lanzar `AwinTransportError`
 * con su código real) de "leer el cuerpo ya conectado" (una interrupción
 * aquí SÍ es, genuinamente, una descarga truncada) mantiene cada fallo
 * clasificado correctamente.
 */
async function connectAwinTextStream(url: URL, options: AwinTransportOptions | undefined): Promise<AsyncGenerator<string>> {
  const resolved = resolveOptions(options);
  assertSafeUrl(url);
  const response = await performRequestWithRetries(url, resolved);
  const byteSource = response.body as unknown as AsyncIterable<Uint8Array> | null;
  if (!byteSource) return emptyTextStream(); // respuesta sin body: no hay nada que decodificar, el parser lo tratará como un feed vacío.
  const guardedByteSource = withIdleTimeout(byteSource, resolved.idleTimeoutMs);
  return bytesToText(detectGzipAndDecompress(guardedByteSource));
}

/**
 * Descarga la lista de feeds de Awin en streaming y la entrega,
 * fragmento a fragmento, a `parseAwinFeedList` — nunca materializa la
 * lista completa en memoria antes de empezar a clasificarla.
 */
export async function* downloadAwinFeedList(apiKey: string, options?: AwinTransportOptions, configuredUrl?: string): AsyncGenerator<AwinFeedListResult> {
  const listUrl = buildAwinFeedListUrl(apiKey, configuredUrl);
  const url = new URL(listUrl.revealSensitiveUrlForDownload());
  const textStream = await connectAwinTextStream(url, options);
  yield* parseAwinFeedList(textStream);
}

/**
 * Descarga un feed Legacy CSV de productos de Awin en streaming y lo
 * entrega, fragmento a fragmento, a `parseAwinProductFeed`. `feedUrl` es
 * un `SensitiveFeedUrl` ya aprobado (`status: "approved"` al parsear la
 * lista, ver `awinFeedListParser.ts`): su valor real solo se revela AQUÍ,
 * justo antes de esta petición — en ningún otro punto del código se llama
 * a `revealSensitiveUrlForDownload()`.
 */
export async function* downloadAwinProductFeed(feedUrl: SensitiveFeedUrl, context: AwinFeedContext, options?: AwinTransportOptions): AsyncGenerator<AwinFeedRowResult> {
  const url = new URL(feedUrl.revealSensitiveUrlForDownload());
  const textStream = await connectAwinTextStream(url, options);
  yield* parseAwinProductFeed(textStream, context);
}
