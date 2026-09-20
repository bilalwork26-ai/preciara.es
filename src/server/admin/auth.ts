/**
 * Autenticación del panel técnico (Fase 2A): sin tabla de usuarios, una
 * única contraseña de administrador por variables de entorno y una cookie
 * de sesión firmada (HMAC-SHA256), sin bibliotecas externas.
 *
 * Requiere DOS variables (ver `.env.example`):
 * - ADMIN_PASSWORD: la contraseña a comprobar.
 * - ADMIN_SESSION_SECRET: secreto para firmar la cookie de sesión (no debe
 *   coincidir con ADMIN_PASSWORD ni con ningún otro secreto).
 *
 * Si falta cualquiera de las dos, `isAdminAuthConfigured()` devuelve
 * `false` y el resto de funciones se comportan como "acceso denegado":
 * `/admin` debe quedar cerrado, nunca abierto por defecto.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "preciara_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export function isAdminAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) && Boolean(process.env.ADMIN_SESSION_SECRET);
}

function sha256(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

/** Comparación en tiempo constante (siempre compara 32 bytes de hash, nunca la contraseña en crudo). */
export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(sha256(candidate), sha256(expected));
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Token de sesión: "<expiraEnMs>.<firmaHMAC>". `null` si la autenticación no está configurada. */
export function createSessionToken(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const payload = String(Date.now() + ADMIN_SESSION_TTL_MS);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return false;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return false;
  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  const expectedSignature = sign(payload, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}
