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
 */
import { createVerify } from "node:crypto";
import type { EbayOAuthCredentials } from "./config";

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

async function fetchApplicationAccessToken(credentials: EbayOAuthCredentials): Promise<string> {
  const now = Date.now();
  const cached = appTokenCache.get(credentials.clientId);
  if (isFresh(cached, now)) return cached.value;

  const basicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetch(EBAY_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: EBAY_OAUTH_SCOPE }).toString(),
  });
  if (!response.ok) {
    throw new Error(`No se pudo obtener el token OAuth de aplicación de eBay (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("La respuesta OAuth de eBay no incluye access_token.");
  }
  const ttlMs = (data.expires_in ?? 0) * 1000;
  appTokenCache.set(credentials.clientId, {
    value: data.access_token,
    expiresAt: now + Math.max(ttlMs - EXPIRY_SAFETY_MARGIN_MS, EXPIRY_SAFETY_MARGIN_MS),
  });
  return data.access_token;
}

/** Envuelve la clave en bruto que devuelve eBay (sin cabeceras PEM) con el formato PEM estándar que espera Node `crypto`. */
function formatPublicKeyAsPem(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) return trimmed; // ya viene en PEM completo
  const body = trimmed.match(/.{1,64}/g)?.join("\n") ?? trimmed;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

async function fetchPublicKey(kid: string, credentials: EbayOAuthCredentials): Promise<string> {
  const now = Date.now();
  const cached = publicKeyCache.get(kid);
  if (isFresh(cached, now)) return cached.value;

  const accessToken = await fetchApplicationAccessToken(credentials);
  const response = await fetch(`${EBAY_PUBLIC_KEY_ENDPOINT}${encodeURIComponent(kid)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`No se pudo obtener la clave pública de eBay para kid="${kid}" (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as { key?: string };
  if (!data.key) {
    throw new Error(`La respuesta de eBay para kid="${kid}" no incluye "key".`);
  }
  const pem = formatPublicKeyAsPem(data.key);
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
      reason: "missing_header" | "malformed_header" | "oauth_not_configured" | "public_key_fetch_failed" | "signature_mismatch" | "verify_error";
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
  } catch {
    return { verified: false, reason: "public_key_fetch_failed" };
  }

  try {
    const verifier = createVerify(SIGNATURE_DIGEST);
    verifier.update(rawBody);
    const isValid = verifier.verify(publicKeyPem, parsed.signature, "base64");
    return isValid ? { verified: true } : { verified: false, reason: "signature_mismatch" };
  } catch {
    return { verified: false, reason: "verify_error" };
  }
}
