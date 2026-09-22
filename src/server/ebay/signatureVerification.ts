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
 *      para claves RSA como EC) contra el CUERPO BRUTO de la petición, tal
 *      cual se recibió — nunca contra una versión reserializada tras un
 *      `JSON.parse`/`JSON.stringify` (a diferencia del SDK de referencia,
 *      que sí reserializa: aquí se sigue al pie de la letra "leer el
 *      cuerpo sin alterarlo para validar la firma").
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
 */
import { createVerify } from "node:crypto";
import type { EbayOAuthCredentials } from "./config";
import { normalizeEbayPublicKey, EbayPublicKeyFormatError } from "./publicKeyFormat";

const EBAY_OAUTH_TOKEN_ENDPOINT = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_PUBLIC_KEY_ENDPOINT = "https://api.ebay.com/commerce/notification/v1/public_key/";

/** Algoritmo de firma usado por eBay para estas notificaciones. */
const SIGNATURE_DIGEST = "sha1";

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
    };

/**
 * Verifica la firma de una notificación de eBay. `rawBody` debe ser el
 * cuerpo EXACTO recibido (sin volver a serializar tras un `JSON.parse`) —
 * es lo único sobre lo que se calcula el hash de la firma.
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

  try {
    const verifier = createVerify(SIGNATURE_DIGEST);
    verifier.update(rawBody);
    const isValid = verifier.verify(publicKeyPem, parsed.signature, "base64");
    return isValid ? { verified: true } : { verified: false, reason: "signature_mismatch" };
  } catch (error) {
    const nodeErrorCode = error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string" ? (error as { code: string }).code : undefined;
    return { verified: false, reason: "verify_error", ...(nodeErrorCode !== undefined ? { nodeErrorCode } : {}) };
  }
}
