/**
 * Respuesta al "challenge" de validación de endpoint de eBay (GET
 * `?challenge_code=...`, ver
 * https://developer.ebay.com/marketplace-account-deletion y el SDK oficial
 * `event-notification-nodejs-sdk` — `lib/validator.js#generateChallengeResponse`,
 * cuyo procedimiento se reproduce aquí exactamente):
 *
 *   SHA-256(challengeCode + verificationToken + endpointURL)
 *
 * en ESE orden exacto, concatenados como texto plano (sin separador),
 * codificado en hexadecimal. `endpoint` debe ser la URL pública EXACTA
 * configurada en el panel de desarrollador de eBay para este endpoint
 * (protocolo, host y ruta incluidos) — un valor distinto (aunque
 * apunte al mismo sitio) produce un hash distinto y eBay rechaza la
 * validación.
 */
import { createHash } from "node:crypto";

export function computeChallengeResponse(challengeCode: string, verificationToken: string, endpoint: string): string {
  return createHash("sha256").update(challengeCode).update(verificationToken).update(endpoint).digest("hex");
}
