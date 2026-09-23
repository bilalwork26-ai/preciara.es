/**
 * Validación y normalización de GTIN (GS1): GTIN-8, UPC/GTIN-12, EAN-13 y
 * GTIN-14, mediante el algoritmo de dígito de control de GS1 — el mismo
 * algoritmo vale para las cuatro longitudes rellenando con ceros a la
 * izquierda hasta 14 dígitos (ver especificación GS1 "Check Digit
 * Calculator"). Nunca se hace coincidencia aproximada: un código con el
 * dígito de control incorrecto, o que no sea puramente numérico, o de una
 * longitud no reconocida, se trata como "sin GTIN" en el resto del núcleo
 * de sincronización (ver applyOffer.ts) — nunca como un error fatal de la
 * fila completa.
 */

const VALID_LENGTHS = new Set([8, 12, 13, 14]);

/** Quita espacios y guiones habituales en códigos de barras copiados a mano o exportados de hojas de cálculo. */
function stripFormatting(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

function computeCheckDigit(data13: string): number {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(data13[12 - i]); // empieza por el dígito más a la derecha
    const weight = i % 2 === 0 ? 3 : 1; // el más a la derecha de los datos pesa 3
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export type GtinValidationResult =
  | { valid: true; normalized: string; originalLength: 8 | 12 | 13 | 14 }
  | { valid: false; reason: "EMPTY" | "NOT_NUMERIC" | "INVALID_LENGTH" | "INVALID_CHECK_DIGIT" };

/**
 * Valida un GTIN de cualquiera de las cuatro longitudes reconocidas y lo
 * normaliza a su forma canónica de 14 dígitos (rellenando con ceros a la
 * izquierda) — así un mismo producto físico representado como UPC-12 desde
 * una fuente y como EAN-13/GTIN-14 desde otra se reconoce como el mismo
 * código al comparar `normalized`.
 */
export function validateGtin(raw: string): GtinValidationResult {
  const cleaned = stripFormatting(raw.trim());
  if (!cleaned) return { valid: false, reason: "EMPTY" };
  if (!/^\d+$/.test(cleaned)) return { valid: false, reason: "NOT_NUMERIC" };
  if (!VALID_LENGTHS.has(cleaned.length)) return { valid: false, reason: "INVALID_LENGTH" };

  const padded = cleaned.padStart(14, "0");
  const dataDigits = padded.slice(0, 13);
  const providedCheckDigit = Number(padded[13]);
  const expectedCheckDigit = computeCheckDigit(dataDigits);

  if (providedCheckDigit !== expectedCheckDigit) {
    return { valid: false, reason: "INVALID_CHECK_DIGIT" };
  }
  return { valid: true, normalized: padded, originalLength: cleaned.length as 8 | 12 | 13 | 14 };
}

/** Atajo: `null` si el GTIN no es válido, o su forma canónica de 14 dígitos si lo es. */
export function normalizeGtinOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const result = validateGtin(raw);
  return result.valid ? result.normalized : null;
}
