/**
 * Normaliza el campo `key` que devuelve el endpoint de clave pública de
 * eBay (`GET /commerce/notification/v1/public_key/{kid}`, ver
 * `signatureVerification.ts`) a un PEM `PUBLIC KEY` válido, sin importar en
 * qué formato exacto llegue el texto. Causa raíz del fallo real en
 * producción (`verify_error`, `ERR_OSSL_UNSUPPORTED`): la versión anterior
 * solo envolvía el cuerpo con las cabeceras PEM cuando NO las traía ya —
 * si el campo `key` llegaba con las cabeceras `BEGIN/END PUBLIC KEY` pero
 * con saltos de línea distintos a los esperados (CRLF, secuencias `\n`
 * literales en vez de saltos reales, o el cuerpo entero en una sola línea),
 * se devolvía tal cual sin limpiar — y OpenSSL rechaza ese PEM al
 * intentar usarlo para verificar la firma.
 *
 * Esta función reconstruye el PEM SIEMPRE desde cero a partir del cuerpo
 * base64 real, sea cual sea el formato de entrada:
 *   - PEM normal con saltos de línea reales;
 *   - PEM "compacto" con el cuerpo entero en una sola línea;
 *   - PEM con CRLF (`\r\n`) en vez de LF;
 *   - una cadena con saltos "escapados" literalmente (el texto contiene el
 *     carácter `\` seguido de `n`, no un salto de línea real — puede pasar
 *     si el valor atravesó una serialización adicional en algún punto);
 *   - solo el cuerpo base64 DER, sin cabeceras PEM en absoluto (el formato
 *     real que envía eBay, según se confirmó al diagnosticar este fallo).
 *
 * Solo se tocan espacios/saltos de línea DENTRO del cuerpo base64 — el
 * contenido (los propios caracteres base64) nunca se altera. El resultado
 * se valida con `crypto.createPublicKey` antes de devolverlo: si no es una
 * clave pública válida, se lanza `EbayPublicKeyFormatError` en vez de
 * devolver un PEM que fallaría más tarde, de forma menos diagnosticable,
 * dentro de `crypto.createVerify(...).verify(...)`.
 */
import { createPublicKey } from "node:crypto";

const PEM_BEGIN = "-----BEGIN PUBLIC KEY-----";
const PEM_END = "-----END PUBLIC KEY-----";
/** Ancho de línea estándar de un PEM (RFC 7468 recomienda 64 caracteres). */
const PEM_LINE_WIDTH = 64;
/** Alfabeto base64 estándar (con relleno `=` opcional) — eBay no usa base64url para este campo. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export class EbayPublicKeyFormatError extends Error {
  constructor(
    message: string,
    /** `error.code` de Node/OpenSSL cuando el fallo viene de `crypto.createPublicKey` — nunca el mensaje completo de esa excepción (podría reflejar fragmentos del contenido). */
    public readonly nodeErrorCode?: string
  ) {
    super(message);
  }
}

function extractNodeErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * Normaliza el campo `key` de la respuesta de eBay a un PEM `PUBLIC KEY`
 * válido. Lanza `EbayPublicKeyFormatError` si, tras limpiar el formato, el
 * resultado no es una clave pública válida — nunca devuelve un PEM sin
 * validar.
 */
export function normalizeEbayPublicKey(rawKey: string): string {
  let text = rawKey.trim();
  if (!text) throw new EbayPublicKeyFormatError("La clave pública de eBay está vacía.");

  // Saltos "escapados" literalmente (backslash + 'n'/'r'+'n' como texto,
  // no como bytes de salto de línea reales) -> saltos reales. Se hace
  // ANTES de normalizar CRLF/CR reales para no dejar backslashes sueltos
  // si el texto mezclara ambos casos.
  text = text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  // CRLF/CR reales -> LF.
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Si ya trae cabeceras PEM, se extrae SOLO el cuerpo entre ellas (nunca
  // se confía en que el formato entre cabeceras ya esté bien — es
  // exactamente lo que causaba el fallo real). Si no las trae, todo el
  // texto es el cuerpo base64 DER en bruto.
  const beginIndex = text.indexOf(PEM_BEGIN);
  const endIndex = text.indexOf(PEM_END);
  const body = beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex ? text.slice(beginIndex + PEM_BEGIN.length, endIndex) : text;

  // Único paso que "limpia" el contenido: quita TODO espacio/salto de
  // línea interno del cuerpo base64, sin tocar los caracteres en sí.
  const compact = body.replace(/\s+/g, "");
  if (!compact) throw new EbayPublicKeyFormatError("La clave pública de eBay no tiene cuerpo tras normalizar el formato.");
  if (!BASE64_PATTERN.test(compact)) {
    throw new EbayPublicKeyFormatError("La clave pública de eBay no es base64 válido tras normalizar el formato.");
  }

  const lines = compact.match(new RegExp(`.{1,${PEM_LINE_WIDTH}}`, "g")) ?? [compact];
  const pem = `${PEM_BEGIN}\n${lines.join("\n")}\n${PEM_END}\n`;

  try {
    createPublicKey(pem); // valida que sea una clave pública real ANTES de usarla para verificar
  } catch (error) {
    throw new EbayPublicKeyFormatError("La clave pública de eBay no es válida tras normalizar el formato.", extractNodeErrorCode(error));
  }

  return pem;
}
