/**
 * Verificación de la cabecera `X-EBAY-SIGNATURE` de las notificaciones de
 * eBay (Marketplace Account Deletion y otros topics del "Notification
 * API"), reproduciendo el procedimiento oficial documentado por eBay
 * (https://developer.ebay.com/marketplace-account-deletion). Se revisó
 * como referencia el SDK oficial `event-notification-nodejs-sdk` (paquete
 * npm publicado bajo la organización eBay en GitHub) para reproducir el
 * algoritmo exacto, pero NO se adopta como dependencia: bootstrapea su
 * propio servidor Express y exige un fichero de configuración con
 * credenciales — incompatible con una ruta de Next.js App Router
 * serverless (ver informe de la rama feat/ebay-account-deletion-endpoint).
 *
 * Procedimiento:
 *   1. La cabecera es un JSON codificado en base64: `{ kid, signature }`.
 *   2. Se obtiene la clave pública de eBay para `kid` — requiere un token
 *      OAuth de aplicación (`client_credentials`) obtenido con las
 *      credenciales propias de la app (`EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`).
 *      Tanto el token como la clave pública se cachean EN MEMORIA, de
 *      forma temporal (con caducidad), para no repetir estas llamadas en
 *      cada notificación — las claves de eBay rotan con poca frecuencia.
 *   3. Se verifica la firma con el algoritmo de eBay (SHA-1, válido tanto
 *      para claves RSA como EC), primero contra el CUERPO BRUTO de la
 *      petición tal cual se recibió. Solo si esa verificación devuelve
 *      "no coincide" (nunca si lanza una excepción), se prueba una
 *      SEGUNDA Y ÚLTIMA representación: `JSON.stringify(JSON.parse(rawBody))`
 *      — el cuerpo reserializado tras haberlo parseado como JSON, que es
 *      EXACTAMENTE lo que verifica el SDK oficial de eBay
 *      (`event-notification-nodejs-sdk`, `lib/validator.js`:
 *      `verifier.update(JSON.stringify(message))`, donde `message` es el
 *      cuerpo ya parseado por `express.json()` antes de llegar al SDK —
 *      confirmado leyendo su código fuente). Notificaciones reales pueden
 *      llegar con diferencias de formato inocuas (espacios, indentado)
 *      entre el cuerpo tal cual lo recibe este endpoint y el cuerpo sobre
 *      el que eBay calculó la firma, sin que el contenido cambie. Nunca se
 *      prueba una tercera representación ni se reordenan claves.
 *
 * Nunca hay un atajo inseguro: si algo impide completar la verificación
 * (cabecera ausente/malformada, credenciales OAuth no configuradas, fallo
 * de red al pedir la clave, firma que no verifica), el resultado es
 * SIEMPRE `verified: false` — quien llama responde 412 en todos esos
 * casos, nunca 204.
 *
 * El paso OAuth (obtener el token de aplicación) y el paso de clave
 * pública (usar ese token para pedir la clave de `kid`) distinguen su
 * motivo de fallo con precisión (`oauth_http_error`/`oauth_invalid_response`
 * frente a `public_key_http_error`/`public_key_invalid_response`) para que
 * un fallo real en producción sea diagnosticable desde los logs del
 * servidor sin necesidad de credenciales ni de reproducirlo: el status
 * HTTP se registra cuando lo hay, pero NUNCA la URL completa (que incluiría
 * `kid`), cabeceras, tokens, credenciales, cuerpos de respuesta ni el
 * payload de la notificación.
 *
 * Diagnóstico de `signature_mismatch` (rama `diagnose/ebay-signature-mismatch`):
 * tras un fallo real en producción con `signature_mismatch` (ya con OAuth,
 * clave pública y el fallback canónico de más arriba funcionando), se
 * comparó línea por línea esta implementación contra el código FUENTE real
 * de `event-notification-nodejs-sdk@1.0.3` (vendido con `npm pack`, no como
 * dependencia) y se construyó una prueba diferencial que ejecuta el SDK
 * oficial SIN MODIFICAR (solo mockeando la llamada de red que obtiene la
 * clave pública) contra los mismos `(rawBody, cabecera, clave)` para varios
 * escenarios: cuerpo crudo exacto, formato inocuo distinto, cabecera de
 * clave "pegada" sin separador, firma en base64url, claves con enteros en
 * sus nombres (que `JSON.parse`→`JSON.stringify` reordena de forma nativa
 * en JS), y firma manipulada. En TODOS los casos en los que ambas
 * implementaciones pudieron siquiera interpretar la clave, coincidieron
 * exactamente en el resultado — sin ninguna divergencia demostrable de
 * lógica. (Se descubrió además que el propio `formatKey` del SDK de
 * referencia es más frágil que nuestra normalización: solo funciona si las
 * cabeceras PEM llegan pegadas al cuerpo sin ningún separador — un detalle
 * ajeno a esta causa, documentado aquí solo por transparencia.) Al no
 * encontrarse una causa demostrable en el código, NO se cambió la lógica de
 * verificación: se añadió en su lugar `SignatureMismatchDiagnostics`, una
 * instrumentación segura y puramente estructural (longitudes, booleanos,
 * tipo/curva de clave) adjunta SOLO al motivo `signature_mismatch`, para
 * que el próximo fallo real deje evidencia estructural sin exponer nunca
 * valores, payload, firma, clave, `kid`, tokens ni credenciales.
 *
 * Sonda de algoritmo (rama `diagnose/ebay-signature-algorithm`): con un
 * diagnóstico real de producción que ya descarta diferencias de
 * formato/canonicalización, claves con enteros, pérdida de precisión y
 * tipo/curva de clave incorrectos, se añadió una comprobación de
 * diagnóstico ADICIONAL — nunca decide el resultado de verificación, que
 * sigue siendo EXCLUSIVAMENTE SHA-1 (ver `SIGNATURE_DIGEST` más abajo):
 * solo después de que SHA-1 ya falló contra el cuerpo bruto Y contra la
 * representación canónica, se prueba (únicamente con fines de registro)
 * si ECDSA con SHA-256 habría verificado contra esas mismas dos
 * representaciones (`SignatureMismatchDiagnostics.sha256RawBodyMatched`/
 * `sha256CanonicalBodyMatched`). Esta rama sigue devolviendo
 * `signature_mismatch`/412 aunque SHA-256 coincida — es pura
 * instrumentación, no una segunda vía de aceptación.
 */
import { createPublicKey, createVerify } from "node:crypto";
import type { EbayOAuthCredentials } from "./config";
import { normalizeEbayPublicKey, EbayPublicKeyFormatError } from "./publicKeyFormat";

const EBAY_OAUTH_TOKEN_ENDPOINT = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_PUBLIC_KEY_ENDPOINT = "https://api.ebay.com/commerce/notification/v1/public_key/";

/** Algoritmo de firma usado por eBay para estas notificaciones — el ÚNICO que puede producir `verified: true`. */
const SIGNATURE_DIGEST = "sha1";
/** DIAGNÓSTICO ÚNICAMENTE (ver comentario de cabecera, "Sonda de algoritmo"): nunca se usa para aceptar una firma, solo para poblar `SignatureMismatchDiagnostics` tras un `signature_mismatch` real. */
const DIAGNOSTIC_ONLY_SHA256_DIGEST = "sha256";

/** Margen de seguridad para no seguir usando un token/clave justo cuando está a punto de caducar. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;
/** Caché TEMPORAL, máximo 1 hora (la documentación oficial de eBay recomienda no cachear la clave pública más tiempo que eso). */
const PUBLIC_KEY_CACHE_TTL_MS = 60 * 60 * 1000;

type CachedValue<T> = { value: T; expiresAt: number };

/** Caché en memoria del proceso — nunca persistida a disco/BD; se pierde (correctamente) al reiniciar. Clave: clientId. */
const appTokenCache = new Map<string, CachedValue<string>>();
/** Caché en memoria del proceso. Clave: kid. */
const publicKeyCache = new Map<string, CachedValue<string>>();

function isFresh<T>(entry: CachedValue<T> | undefined, now: number): entry is CachedValue<T> {
  return !!entry && entry.expiresAt > now;
}

/** Motivo específico de un fallo al obtener el token OAuth o la clave pública — ver `SignatureVerificationResult`. */
type EbayFetchErrorReason =
  | "oauth_http_error"
  | "oauth_invalid_response"
  | "public_key_http_error"
  | "public_key_invalid_response"
  | "public_key_normalization_error";

/**
 * Error interno con el motivo ya clasificado y, si los hay, el status HTTP
 * y/o el `error.code` de Node/OpenSSL (nunca la URL, cabeceras, cuerpo,
 * credenciales, clave ni el mensaje completo de una excepción de
 * `crypto`) — permite a `verifyEbaySignature` devolver un `reason` preciso
 * sin tener que inspeccionar el error genérico que lanzaría
 * `fetch`/`response.json()`/`crypto.createPublicKey`.
 */
class EbayFetchError extends Error {
  constructor(
    public readonly reason: EbayFetchErrorReason,
    message: string,
    public readonly httpStatus?: number,
    public readonly nodeErrorCode?: string
  ) {
    super(message);
  }
}

async function fetchApplicationAccessToken(credentials: EbayOAuthCredentials): Promise<string> {
  const now = Date.now();
  const cached = appTokenCache.get(credentials.clientId);
  if (isFresh(cached, now)) return cached.value;

  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  // application/x-www-form-urlencoded: URLSearchParams aplica el
  // porcentaje-escape estándar (":" -> "%3A", "/" -> "%2F"...) — produce
  // exactamente la misma cadena que `querystring.stringify` del SDK
  // OAuth oficial de eBay (`ebay-oauth-nodejs-client`), verificado byte a
  // byte al diagnosticar este fallo.
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: EBAY_OAUTH_SCOPE }).toString();

  let response: Response;
  try {
    response = await fetch(EBAY_OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    // Fallo de red/DNS/TLS antes de recibir ninguna respuesta: no hay status HTTP que registrar.
    throw new EbayFetchError("oauth_http_error", "Fallo de red al pedir el token OAuth de aplicación de eBay.");
  }

  if (!response.ok) {
    throw new EbayFetchError("oauth_http_error", `Token OAuth de eBay: respuesta no exitosa (HTTP ${response.status}).`, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new EbayFetchError("oauth_invalid_response", "La respuesta OAuth de eBay no es JSON válido.");
  }

  const accessToken = (data as { access_token?: unknown } | null)?.access_token;
  const expiresIn = (data as { expires_in?: unknown } | null)?.expires_in;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new EbayFetchError("oauth_invalid_response", "La respuesta OAuth de eBay no incluye access_token.");
  }

  const ttlMs = (typeof expiresIn === "number" ? expiresIn : 0) * 1000;
  appTokenCache.set(credentials.clientId, {
    value: accessToken,
    expiresAt: now + Math.max(ttlMs - EXPIRY_SAFETY_MARGIN_MS, EXPIRY_SAFETY_MARGIN_MS),
  });
  return accessToken;
}

async function fetchPublicKey(kid: string, credentials: EbayOAuthCredentials): Promise<string> {
  const now = Date.now();
  const cached = publicKeyCache.get(kid);
  if (isFresh(cached, now)) return cached.value;

  // Puede lanzar EbayFetchError con reason "oauth_http_error"/"oauth_invalid_response":
  // se deja propagar tal cual, sin envolverlo en un motivo distinto.
  const accessToken = await fetchApplicationAccessToken(credentials);

  let response: Response;
  try {
    response = await fetch(`${EBAY_PUBLIC_KEY_ENDPOINT}${encodeURIComponent(kid)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new EbayFetchError("public_key_http_error", "Fallo de red al pedir la clave pública de eBay.");
  }

  if (!response.ok) {
    throw new EbayFetchError("public_key_http_error", `Clave pública de eBay: respuesta no exitosa (HTTP ${response.status}).`, response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new EbayFetchError("public_key_invalid_response", "La respuesta de la clave pública de eBay no es JSON válido.");
  }

  const key = (data as { key?: unknown } | null)?.key;
  if (typeof key !== "string" || !key) {
    throw new EbayFetchError("public_key_invalid_response", 'La respuesta de la clave pública de eBay no incluye "key".');
  }

  let pem: string;
  try {
    pem = normalizeEbayPublicKey(key);
  } catch (error) {
    if (error instanceof EbayPublicKeyFormatError) {
      throw new EbayFetchError("public_key_normalization_error", error.message, undefined, error.nodeErrorCode);
    }
    throw error;
  }

  publicKeyCache.set(kid, { value: pem, expiresAt: now + PUBLIC_KEY_CACHE_TTL_MS });
  return pem;
}

function extractNodeErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Resultado de UN intento de verificación criptográfica contra una representación concreta del cuerpo. */
type VerifyAttempt = { threw: false; matched: boolean } | { threw: true; nodeErrorCode?: string };

function attemptVerify(body: string, publicKeyPem: string, signatureBase64: string, digest: string = SIGNATURE_DIGEST): VerifyAttempt {
  try {
    const verifier = createVerify(digest);
    verifier.update(body);
    return { threw: false, matched: verifier.verify(publicKeyPem, signatureBase64, "base64") };
  } catch (error) {
    return { threw: true, nodeErrorCode: extractNodeErrorCode(error) };
  }
}

/**
 * Metadatos PURAMENTE ESTRUCTURALES de un `signature_mismatch` real —
 * longitudes, booleanos y nombres de tipo/curva de clave — para poder
 * diagnosticar la próxima vez sin registrar jamás valores, payload, firma,
 * clave, `kid`, tokens ni credenciales. Ver comentario de cabecera del
 * fichero (sección "Diagnóstico de signature_mismatch").
 */
export type SignatureMismatchDiagnostics = {
  /** Longitud en caracteres del cuerpo bruto recibido. */
  rawBodyLength: number;
  /** Si `rawBody` es JSON válido (si no, el fallback canónico ni se intenta). */
  rawBodyIsValidJson: boolean;
  /** Si se llegó a construir la representación canónica `JSON.stringify(JSON.parse(rawBody))`. */
  canonicalFallbackAttempted: boolean;
  /** Si el cuerpo bruto y la representación canónica son, de hecho, la MISMA cadena (ninguna diferencia de formato entre ambas). */
  rawBodyEqualsCanonicalBody: boolean;
  /** Si el cuerpo parseado contiene, en cualquier nivel, alguna clave con forma de entero (p. ej. "2", "10") — JS reordena esas claves de forma nativa en un JSON.parse→JSON.stringify, lo que podría romper la fidelidad de la representación canónica frente a lo que eBay firmó realmente. */
  containsIntegerLikeKeys: boolean;
  /** Si el cuerpo bruto contiene algún literal numérico JSON de 16+ dígitos — puede perder precisión al pasar por JSON.parse (IEEE-754), alterando la representación canónica. */
  containsLargeIntegerLiteral: boolean;
  /** Longitud en bytes de la firma, ya decodificada de base64 (ayuda a distinguir, p. ej., firmas de tamaño RSA frente a EC). `null` si no se pudo decodificar. */
  signatureByteLength: number | null;
  /** Tipo de la clave pública usada para verificar (p. ej. "ec", "rsa"), nunca su contenido. `null` si no se pudo determinar. */
  publicKeyType: string | null;
  /** Curva de la clave pública cuando es EC (p. ej. "prime256v1"), nunca su contenido. `null` si no aplica o no se pudo determinar. */
  publicKeyCurve: string | null;
  /** DIAGNÓSTICO ÚNICAMENTE — nunca decide el resultado de verificación (que sigue siendo EXCLUSIVAMENTE SHA-1): si una firma ECDSA con SHA-256 habría verificado contra el cuerpo bruto. */
  sha256RawBodyMatched: boolean;
  /** DIAGNÓSTICO ÚNICAMENTE — igual que `sha256RawBodyMatched`, pero contra la representación canónica `JSON.stringify(JSON.parse(rawBody))`. `false` si esa representación ni siquiera se pudo construir (JSON inválido). */
  sha256CanonicalBodyMatched: boolean;
};

function containsIntegerLikeKeys(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsIntegerLikeKeys(item, seen));
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (/^(0|[1-9]\d*)$/.test(key)) return true;
    if (containsIntegerLikeKeys((value as Record<string, unknown>)[key], seen)) return true;
  }
  return false;
}

/** Literal numérico JSON (no dentro de una cadena) de 16 o más dígitos — umbral de posible pérdida de precisión IEEE-754 en JSON.parse. */
const LARGE_INTEGER_LITERAL_PATTERN = /[:,[]\s*-?\d{16,}(?:\.\d+)?\s*(?=[,}\]])/;

function buildSignatureMismatchDiagnostics(rawBody: string, signatureBase64: string, publicKeyPem: string): SignatureMismatchDiagnostics {
  let rawBodyIsValidJson = false;
  let canonicalBody: string | undefined;
  let containsIntegerLike = false;
  try {
    const parsedForDiagnostics: unknown = JSON.parse(rawBody);
    rawBodyIsValidJson = true;
    canonicalBody = JSON.stringify(parsedForDiagnostics);
    containsIntegerLike = containsIntegerLikeKeys(parsedForDiagnostics);
  } catch {
    // rawBody no es JSON válido: se dejan los valores por defecto.
  }

  let signatureByteLength: number | null;
  try {
    signatureByteLength = Buffer.from(signatureBase64, "base64").length;
  } catch {
    signatureByteLength = null;
  }

  let publicKeyType: string | null = null;
  let publicKeyCurve: string | null = null;
  try {
    const keyObject = createPublicKey(publicKeyPem);
    publicKeyType = keyObject.asymmetricKeyType ?? null;
    const details = keyObject.asymmetricKeyDetails as { namedCurve?: string } | undefined;
    publicKeyCurve = details?.namedCurve ?? null;
  } catch {
    // No debería ocurrir aquí (la clave ya se usó para verificar sin lanzar antes de llegar a este punto).
  }

  // DIAGNÓSTICO ÚNICAMENTE ("Sonda de algoritmo", ver comentario de
  // cabecera del fichero): esta función solo se invoca desde el `return`
  // de `signature_mismatch`, es decir, DESPUÉS de que SHA-1 ya falló
  // contra el cuerpo bruto y contra la representación canónica — se
  // prueba aquí, solo para informar (nunca para decidir), si ECDSA con
  // SHA-256 habría verificado contra esas mismas dos representaciones.
  // El resultado de esta función nunca influye en `verified`.
  const sha256RawBodyAttempt = attemptVerify(rawBody, publicKeyPem, signatureBase64, DIAGNOSTIC_ONLY_SHA256_DIGEST);
  const sha256RawBodyMatched = !sha256RawBodyAttempt.threw && sha256RawBodyAttempt.matched;

  const sha256CanonicalAttempt = canonicalBody !== undefined ? attemptVerify(canonicalBody, publicKeyPem, signatureBase64, DIAGNOSTIC_ONLY_SHA256_DIGEST) : undefined;
  const sha256CanonicalBodyMatched = sha256CanonicalAttempt !== undefined && !sha256CanonicalAttempt.threw && sha256CanonicalAttempt.matched;

  return {
    rawBodyLength: rawBody.length,
    rawBodyIsValidJson,
    canonicalFallbackAttempted: canonicalBody !== undefined,
    rawBodyEqualsCanonicalBody: canonicalBody !== undefined && rawBody === canonicalBody,
    containsIntegerLikeKeys: containsIntegerLike,
    containsLargeIntegerLiteral: LARGE_INTEGER_LITERAL_PATTERN.test(rawBody),
    signatureByteLength,
    publicKeyType,
    publicKeyCurve,
    sha256RawBodyMatched,
    sha256CanonicalBodyMatched,
  };
}

type ParsedSignatureHeader = { kid: string; signature: string };

function parseSignatureHeader(signatureHeader: string): ParsedSignatureHeader | null {
  try {
    const json = Buffer.from(signatureHeader, "base64").toString("ascii");
    const parsed = JSON.parse(json) as Partial<ParsedSignatureHeader>;
    if (typeof parsed.kid !== "string" || typeof parsed.signature !== "string" || !parsed.kid || !parsed.signature) {
      return null;
    }
    return { kid: parsed.kid, signature: parsed.signature };
  } catch {
    return null;
  }
}

export type SignatureVerificationResult =
  | { verified: true }
  | {
      verified: false;
      /** Motivo técnico, SOLO para logs del servidor — nunca se expone al cliente ni contiene datos del cuerpo. */
      reason: "missing_header" | "malformed_header" | "oauth_not_configured" | EbayFetchErrorReason | "signature_mismatch" | "verify_error";
      /** Solo presente en los motivos `*_http_error`: el status HTTP devuelto por eBay. Nunca va acompañado de la URL, cabeceras ni cuerpo de la respuesta. */
      httpStatus?: number;
      /** Solo presente en `public_key_normalization_error`/`verify_error` cuando `crypto` lanza con un `.code`: el código de error de Node/OpenSSL (p. ej. "ERR_OSSL_UNSUPPORTED"). Nunca el mensaje completo de la excepción, ni la clave, firma o cuerpo. */
      nodeErrorCode?: string;
      /** Solo presente en `signature_mismatch`: metadatos puramente estructurales (longitudes, booleanos, tipo/curva de clave) para diagnosticar sin exponer nunca valores, payload, firma, clave, `kid`, tokens ni credenciales. */
      diagnostics?: SignatureMismatchDiagnostics;
    };

/**
 * Verifica la firma de una notificación de eBay. `rawBody` debe ser el
 * cuerpo EXACTO recibido, sin ninguna transformación previa — es la
 * primera representación que se intenta, y si el emisor firmó exactamente
 * esos bytes (caso normal), es la única que se necesita. Solo si esa
 * verificación devuelve "no coincide" se intenta, como único fallback,
 * `JSON.stringify(JSON.parse(rawBody))` (ver comentario de cabecera del
 * fichero).
 */
export async function verifyEbaySignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  oauthCredentials: EbayOAuthCredentials | null;
}): Promise<SignatureVerificationResult> {
  const { rawBody, signatureHeader, oauthCredentials } = params;

  if (!signatureHeader) return { verified: false, reason: "missing_header" };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { verified: false, reason: "malformed_header" };

  if (!oauthCredentials) return { verified: false, reason: "oauth_not_configured" };

  let publicKeyPem: string;
  try {
    publicKeyPem = await fetchPublicKey(parsed.kid, oauthCredentials);
  } catch (error) {
    if (error instanceof EbayFetchError) {
      return {
        verified: false,
        reason: error.reason,
        ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
        ...(error.nodeErrorCode !== undefined ? { nodeErrorCode: error.nodeErrorCode } : {}),
      };
    }
    // No debería ocurrir (fetchPublicKey solo lanza EbayFetchError), pero
    // ante cualquier excepción no prevista se falla cerrado igualmente.
    return { verified: false, reason: "public_key_http_error" };
  }

  // 1º intento: el cuerpo bruto tal cual se recibió.
  const rawBodyAttempt = attemptVerify(rawBody, publicKeyPem, parsed.signature);
  if (rawBodyAttempt.threw) {
    return { verified: false, reason: "verify_error", ...(rawBodyAttempt.nodeErrorCode !== undefined ? { nodeErrorCode: rawBodyAttempt.nodeErrorCode } : {}) };
  }
  if (rawBodyAttempt.matched) return { verified: true };

  // 2º y ÚLTIMO intento — SOLO porque el 1º devolvió "no coincide" (nunca
  // si lanzó una excepción): la representación que usa el SDK oficial de
  // eBay, `JSON.stringify(JSON.parse(rawBody))`. Ningún JSON válido ->
  // no hay segunda representación que probar, se falla cerrado más abajo.
  let canonicalBody: string | undefined;
  try {
    canonicalBody = JSON.stringify(JSON.parse(rawBody));
  } catch {
    canonicalBody = undefined;
  }

  if (canonicalBody !== undefined) {
    const canonicalAttempt = attemptVerify(canonicalBody, publicKeyPem, parsed.signature);
    if (canonicalAttempt.threw) {
      return { verified: false, reason: "verify_error", ...(canonicalAttempt.nodeErrorCode !== undefined ? { nodeErrorCode: canonicalAttempt.nodeErrorCode } : {}) };
    }
    if (canonicalAttempt.matched) return { verified: true };
  }

  return { verified: false, reason: "signature_mismatch", diagnostics: buildSignatureMismatchDiagnostics(rawBody, parsed.signature, publicKeyPem) };
}
