/**
 * Validación MÍNIMA del cuerpo de una notificación de eBay, aplicada
 * DESPUÉS de verificar su firma sobre el cuerpo bruto (ver
 * `signatureVerification.ts` — una firma válida no implica que el cuerpo
 * sea el que se espera para este endpoint). Comprueba únicamente:
 *
 *   1. que el cuerpo sea JSON válido;
 *   2. que `metadata.topic` sea exactamente "MARKETPLACE_ACCOUNT_DELETION".
 *
 * Deliberadamente NO fija `metadata.schemaVersion` a un valor exacto (p.
 * ej. "1.0"): una versión de esquema compatible más nueva no debe romper
 * este endpoint. Nunca inspecciona, extrae ni registra los datos
 * personales del payload (`username`/`userId`/`eiasToken`...) — Preciara
 * no los almacena, así que no hay nada más que mirar aquí.
 */

const EXPECTED_TOPIC = "MARKETPLACE_ACCOUNT_DELETION";

export type PayloadValidationResult = { valid: true } | { valid: false; reason: "invalid_json" | "wrong_topic" };

function extractTopic(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const metadata = (parsed as Record<string, unknown>).metadata;
  if (typeof metadata !== "object" || metadata === null) return undefined;
  return (metadata as Record<string, unknown>).topic;
}

export function validateMarketplaceAccountDeletionPayload(rawBody: string): PayloadValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { valid: false, reason: "invalid_json" };
  }

  if (extractTopic(parsed) !== EXPECTED_TOPIC) {
    return { valid: false, reason: "wrong_topic" };
  }

  return { valid: true };
}
