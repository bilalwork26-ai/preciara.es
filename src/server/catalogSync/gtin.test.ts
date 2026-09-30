import { describe, expect, it } from "vitest";
import { normalizeGtinOrNull, validateGtin } from "./gtin";

// Valores calculados a partir del algoritmo oficial de dígito de control
// GS1 (ver gtin.ts), verificados de forma independiente antes de escribir
// estas pruebas. "036000291452" es además un UPC-12 real y de uso habitual
// en materiales de referencia de GS1/GTIN.
const VALID_GTIN_8 = "12345670";
const VALID_UPC_12 = "036000291452";
const VALID_EAN_13 = "5001234567890";
const VALID_GTIN_14 = "12345678901231";

describe("validateGtin: longitudes válidas con dígito de control correcto", () => {
  it("acepta un GTIN-8 válido y lo normaliza a 14 dígitos", () => {
    const result = validateGtin(VALID_GTIN_8);
    expect(result).toEqual({ valid: true, normalized: "00000012345670", originalLength: 8 });
  });

  it("acepta un UPC/GTIN-12 válido y lo normaliza a 14 dígitos", () => {
    const result = validateGtin(VALID_UPC_12);
    expect(result).toEqual({ valid: true, normalized: "00036000291452", originalLength: 12 });
  });

  it("acepta un EAN-13 válido y lo normaliza a 14 dígitos", () => {
    const result = validateGtin(VALID_EAN_13);
    expect(result).toEqual({ valid: true, normalized: "05001234567890", originalLength: 13 });
  });

  it("acepta un GTIN-14 válido (ya normalizado)", () => {
    const result = validateGtin(VALID_GTIN_14);
    expect(result).toEqual({ valid: true, normalized: "12345678901231", originalLength: 14 });
  });

  it("un mismo producto representado como UPC-12 o como su EAN-13/GTIN-14 equivalente normaliza igual", () => {
    // "036000291452" (UPC-12) equivale a "00036000291452" en GTIN-14/EAN-13
    // con cero inicial: deben normalizar al mismo código de 14 dígitos.
    const upc = validateGtin("036000291452");
    const gtin14Equivalent = validateGtin("00036000291452");
    expect(upc.valid && gtin14Equivalent.valid).toBe(true);
    if (upc.valid && gtin14Equivalent.valid) {
      expect(upc.normalized).toBe(gtin14Equivalent.normalized);
    }
  });
});

describe("validateGtin: rechazo estricto (nunca coincidencia aproximada)", () => {
  it("rechaza un dígito de control incorrecto", () => {
    const tamperedLastDigit = VALID_EAN_13.slice(0, -1) + String((Number(VALID_EAN_13.at(-1)) + 1) % 10);
    expect(validateGtin(tamperedLastDigit)).toEqual({ valid: false, reason: "INVALID_CHECK_DIGIT" });
  });

  it("rechaza una longitud no reconocida (ni 8, 12, 13 ni 14)", () => {
    expect(validateGtin("123456789")).toEqual({ valid: false, reason: "INVALID_LENGTH" });
    expect(validateGtin("123456")).toEqual({ valid: false, reason: "INVALID_LENGTH" });
  });

  it("rechaza contenido no numérico", () => {
    expect(validateGtin("abc1234567890")).toEqual({ valid: false, reason: "NOT_NUMERIC" });
  });

  it("rechaza una cadena vacía o solo espacios", () => {
    expect(validateGtin("")).toEqual({ valid: false, reason: "EMPTY" });
    expect(validateGtin("   ")).toEqual({ valid: false, reason: "EMPTY" });
  });

  it("nunca revienta con entradas extrañas (inyección de formato, unicode, muy largo)", () => {
    expect(() => validateGtin("'; DROP TABLE products; --")).not.toThrow();
    expect(() => validateGtin("१२३४५६७८")).not.toThrow(); // dígitos en devanagari, no ASCII
    expect(() => validateGtin("1".repeat(5000))).not.toThrow();
  });
});

describe("validateGtin: rechaza códigos placeholder de un único dígito repetido", () => {
  it("rechaza un GTIN-14 de puros ceros (el placeholder de 'sin código de barras' más habitual en feeds de comercios)", () => {
    expect(validateGtin("00000000000000")).toEqual({ valid: false, reason: "PLACEHOLDER_REPEATED_DIGIT" });
  });

  it("rechaza el mismo placeholder en las otras tres longitudes reconocidas (8, 12 y 13)", () => {
    expect(validateGtin("00000000")).toEqual({ valid: false, reason: "PLACEHOLDER_REPEATED_DIGIT" });
    expect(validateGtin("000000000000")).toEqual({ valid: false, reason: "PLACEHOLDER_REPEATED_DIGIT" });
    expect(validateGtin("0000000000000")).toEqual({ valid: false, reason: "PLACEHOLDER_REPEATED_DIGIT" });
  });

  it("rechaza también un dígito distinto de cero repetido (p. ej. puros unos), no solo ceros", () => {
    expect(validateGtin("11111111111111")).toEqual({ valid: false, reason: "PLACEHOLDER_REPEATED_DIGIT" });
  });

  it("sin esta comprobación, un GTIN de puros ceros pasaría el dígito de control (motivo del propio defecto): lo confirma directamente sobre el cálculo de dígito de control", () => {
    // Regresión explícita: antes de este fix, validateGtin aceptaba este
    // valor como válido porque la suma ponderada de puros ceros es 0, y
    // (10 - 0 % 10) % 10 también es 0 — el dígito de control "cuadra" por
    // pura coincidencia aritmética, nunca porque sea un GTIN real.
    expect(validateGtin("00000000000000").valid).toBe(false);
  });

  it("normalizeGtinOrNull también lo rechaza (null, nunca un valor inventado)", () => {
    expect(normalizeGtinOrNull("00000000000000")).toBeNull();
  });
});

describe("validateGtin: normalización de formato", () => {
  it("ignora espacios y guiones habituales al copiar/exportar códigos de barras", () => {
    const withFormatting = `${VALID_EAN_13.slice(0, 1)}-${VALID_EAN_13.slice(1, 6)} ${VALID_EAN_13.slice(6)}`;
    expect(validateGtin(withFormatting)).toEqual({ valid: true, normalized: "05001234567890", originalLength: 13 });
  });

  it("recorta espacios exteriores", () => {
    expect(validateGtin(`  ${VALID_GTIN_14}  `)).toEqual({ valid: true, normalized: VALID_GTIN_14, originalLength: 14 });
  });
});

describe("normalizeGtinOrNull", () => {
  it("devuelve la forma canónica para un GTIN válido", () => {
    expect(normalizeGtinOrNull(VALID_UPC_12)).toBe("00036000291452");
  });

  it("devuelve null para un GTIN inválido, null o ausente, sin lanzar", () => {
    expect(normalizeGtinOrNull("no-es-un-gtin")).toBeNull();
    expect(normalizeGtinOrNull(null)).toBeNull();
    expect(normalizeGtinOrNull(undefined)).toBeNull();
    expect(normalizeGtinOrNull("")).toBeNull();
  });
});
