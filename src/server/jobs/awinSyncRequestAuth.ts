import { createHmac, timingSafeEqual } from "node:crypto";

export const AWIN_SYNC_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export type VerifyAwinSyncSignatureInput = {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowMs?: number;
};

/**
 * Verifica una petición firmada sin transmitir la clave de Awin.
 *
 * La firma cubre timestamp + cuerpo exacto y solo se acepta durante cinco
 * minutos, de modo que una petición capturada no pueda reutilizarse más tarde.
 * Esta función no registra ni devuelve nunca el secreto.
 */
export function verifyAwinSyncSignature({
  secret,
  timestamp,
  signature,
  body,
  nowMs = Date.now(),
}: VerifyAwinSyncSignatureInput): boolean {
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(timestampNumber)) return false;

  // GitHub envía segundos Unix. Se tolera también milisegundos para que la
  // comprobación sea explícita y no dependa de la longitud del entero.
  const timestampMs = timestamp.length > 10 ? timestampNumber : timestampNumber * 1000;
  const ageMs = Math.abs(nowMs - timestampMs);
  if (ageMs > AWIN_SYNC_SIGNATURE_MAX_AGE_SECONDS * 1000) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
