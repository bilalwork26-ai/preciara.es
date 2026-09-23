import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { computeChallengeResponse } from "./challengeResponse";

describe("computeChallengeResponse", () => {
  it("coincide con un valor de referencia fijo (SHA-256 de challengeCode+verificationToken+endpoint, en ese orden)", () => {
    // Vector de prueba fijo: si alguien cambia el orden de concatenación o
    // el algoritmo, este hash deja de coincidir aunque el resto de
    // pruebas (que recalculan con la misma lógica) sigan "pasando".
    const challengeCode = "d1596732-2c28-4107-9865-1af0da09e6f5";
    const verificationToken = "preciara-verification-token-fixture-32chars";
    const endpoint = "https://preciara.es/api/ebay/marketplace-account-deletion";
    expect(computeChallengeResponse(challengeCode, verificationToken, endpoint)).toBe(
      "d0279388ace8b4963022ef2a23a8d8733259e5ef8a69fa1718f8f7654e64e256"
    );
  });

  it("reproduce SHA-256(challengeCode + verificationToken + endpoint) para cualquier entrada", () => {
    const challengeCode = "abc123";
    const verificationToken = "mi-token-de-verificacion-de-ejemplo";
    const endpoint = "https://preciara.es/api/ebay/marketplace-account-deletion";
    const expected = createHash("sha256")
      .update(challengeCode)
      .update(verificationToken)
      .update(endpoint)
      .digest("hex");
    expect(computeChallengeResponse(challengeCode, verificationToken, endpoint)).toBe(expected);
  });

  it("el orden de los tres valores importa: concatenarlos en otro orden da un hash distinto", () => {
    const a = computeChallengeResponse("x", "y", "z");
    const b = computeChallengeResponse("y", "x", "z");
    const c = computeChallengeResponse("x", "z", "y");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("un endpoint distinto (aunque apunte al mismo sitio) produce un hash distinto", () => {
    const withSlash = computeChallengeResponse("code", "token", "https://preciara.es/api/ebay/marketplace-account-deletion/");
    const withoutSlash = computeChallengeResponse("code", "token", "https://preciara.es/api/ebay/marketplace-account-deletion");
    expect(withSlash).not.toBe(withoutSlash);
  });

  it("devuelve siempre 64 caracteres hexadecimales en minúsculas (SHA-256)", () => {
    const result = computeChallengeResponse("code", "token", "https://example.invalid/endpoint");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("es determinista: la misma entrada siempre produce la misma salida", () => {
    const args = ["challenge-1", "verification-token-1", "https://preciara.es/api/ebay/marketplace-account-deletion"] as const;
    expect(computeChallengeResponse(...args)).toBe(computeChallengeResponse(...args));
  });
});
