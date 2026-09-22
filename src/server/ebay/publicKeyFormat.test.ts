import { describe, expect, it } from "vitest";
import { createPublicKey, createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { EbayPublicKeyFormatError, normalizeEbayPublicKey } from "./publicKeyFormat";

// EC P-256 (prime256v1) real: el tipo de clave que usan las notificaciones
// ACTUALES de eBay (ver signatureVerification.test.ts).
const { publicKey: ecPem, privateKey: ecPrivateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** El cuerpo base64 "puro" del PEM anterior, sin cabeceras ni saltos de línea. */
const ecCompactBody = ecPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, "");

function derBytes(pem: string): Buffer {
  return createPublicKey(pem).export({ type: "spki", format: "der" });
}

function signAndVerify(pem: string, body: string): boolean {
  const signer = createSign("sha1");
  signer.update(body);
  const signature = signer.sign(ecPrivateKey, "base64");
  const verifier = createVerify("sha1");
  verifier.update(body);
  return verifier.verify(pem, signature, "base64");
}

describe("normalizeEbayPublicKey", () => {
  it("PEM normal con saltos de línea reales: se acepta y verifica una firma real", () => {
    const pem = normalizeEbayPublicKey(ecPem);
    expect(() => createPublicKey(pem)).not.toThrow();
    expect(signAndVerify(pem, "cuerpo de prueba")).toBe(true);
  });

  it("PEM compacto (cuerpo entero en una sola línea, sin saltos): se acepta y verifica", () => {
    const compactPem = `-----BEGIN PUBLIC KEY-----\n${ecCompactBody}\n-----END PUBLIC KEY-----`;
    const pem = normalizeEbayPublicKey(compactPem);
    expect(signAndVerify(pem, "cuerpo de prueba")).toBe(true);
  });

  it("PEM con CRLF (\\r\\n) en vez de LF: se acepta y verifica", () => {
    const crlfPem = ecPem.replace(/\n/g, "\r\n");
    const pem = normalizeEbayPublicKey(crlfPem);
    expect(signAndVerify(pem, "cuerpo de prueba")).toBe(true);
  });

  it('cadena con saltos "literales" (el texto contiene backslash+n, no un salto real): se acepta y verifica — este es el caso que causaba el fallo real en producción (ERR_OSSL_UNSUPPORTED)', () => {
    const literalNewlinePem = ecPem.replace(/\n/g, "\\n");
    expect(literalNewlinePem.includes("\n")).toBe(false); // confirma que de verdad no hay saltos reales, solo texto "\n"
    const pem = normalizeEbayPublicKey(literalNewlinePem);
    expect(signAndVerify(pem, "cuerpo de prueba")).toBe(true);
  });

  it("cuerpo base64 DER en bruto, sin cabeceras PEM en absoluto (el formato real que envía eBay): se acepta y verifica", () => {
    const pem = normalizeEbayPublicKey(ecCompactBody);
    expect(signAndVerify(pem, "cuerpo de prueba")).toBe(true);
  });

  it("con espacios sueltos adicionales alrededor y dentro del cuerpo: se acepta y verifica", () => {
    const withSpaces = `  \n  ${ecCompactBody.slice(0, 20)} ${ecCompactBody.slice(20)}  \n  `;
    const pem = normalizeEbayPublicKey(withSpaces);
    expect(signAndVerify(pem, "cuerpo de prueba")).toBe(true);
  });

  it("nunca altera el CONTENIDO de la clave, solo el formato: el DER decodificado es idéntico en todas las variantes", () => {
    const expectedDer = derBytes(ecPem);
    const variants = [ecPem, `-----BEGIN PUBLIC KEY-----\n${ecCompactBody}\n-----END PUBLIC KEY-----`, ecPem.replace(/\n/g, "\r\n"), ecPem.replace(/\n/g, "\\n"), ecCompactBody];
    for (const variant of variants) {
      const pem = normalizeEbayPublicKey(variant);
      expect(derBytes(pem).equals(expectedDer)).toBe(true);
    }
  });

  it("genera líneas de 64 caracteres (ancho PEM estándar) en el cuerpo, salvo la última", () => {
    const pem = normalizeEbayPublicKey(ecCompactBody);
    const lines = pem.trim().split("\n").slice(1, -1); // sin las cabeceras BEGIN/END
    for (const line of lines.slice(0, -1)) {
      expect(line.length).toBe(64);
    }
    expect(lines.at(-1)!.length).toBeLessThanOrEqual(64);
  });

  it("clave inválida (no es base64): lanza EbayPublicKeyFormatError, nunca deja pasar un PEM sin validar", () => {
    expect(() => normalizeEbayPublicKey("esto-no-es-base64-!!!")).toThrow(EbayPublicKeyFormatError);
  });

  it("clave inválida (base64 válido pero no es una clave DER real): lanza EbayPublicKeyFormatError con nodeErrorCode de OpenSSL", () => {
    // Base64 sintácticamente válido (32 bytes de ceros) pero sin ninguna
    // estructura DER de clave pública reconocible.
    const bogusBase64 = Buffer.alloc(32, 0).toString("base64");
    let caught: unknown;
    try {
      normalizeEbayPublicKey(bogusBase64);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EbayPublicKeyFormatError);
    expect((caught as EbayPublicKeyFormatError).nodeErrorCode).toBeDefined();
    // El mensaje nunca debe contener el contenido de la clave.
    expect((caught as EbayPublicKeyFormatError).message).not.toContain(bogusBase64);
  });

  it("cadena vacía o solo espacios: lanza EbayPublicKeyFormatError", () => {
    expect(() => normalizeEbayPublicKey("")).toThrow(EbayPublicKeyFormatError);
    expect(() => normalizeEbayPublicKey("   \n  ")).toThrow(EbayPublicKeyFormatError);
  });

  it("cabeceras PEM presentes pero sin cuerpo entre ellas: lanza EbayPublicKeyFormatError", () => {
    expect(() => normalizeEbayPublicKey("-----BEGIN PUBLIC KEY-----\n\n-----END PUBLIC KEY-----")).toThrow(EbayPublicKeyFormatError);
  });

  describe("equivalencia sha1 vs ssl3-sha1 (el algoritmo del SDK oficial de eBay)", () => {
    it("'sha1' y 'ssl3-sha1' verifican de forma idéntica la misma firma EC real", () => {
      const body = "cuerpo de prueba para comparar algoritmos";
      const signer = createSign("sha1");
      signer.update(body);
      const signature = signer.sign(ecPrivateKey, "base64");

      const verifySha1 = createVerify("sha1");
      verifySha1.update(body);
      const resultSha1 = verifySha1.verify(ecPem, signature, "base64");

      const verifySsl3Sha1 = createVerify("ssl3-sha1");
      verifySsl3Sha1.update(body);
      const resultSsl3Sha1 = verifySsl3Sha1.verify(ecPem, signature, "base64");

      expect(resultSha1).toBe(true);
      expect(resultSsl3Sha1).toBe(true);
      expect(resultSha1).toBe(resultSsl3Sha1); // mismo resultado con ambos nombres de algoritmo
    });

    it("ambos algoritmos coinciden también al RECHAZAR una firma que no corresponde", () => {
      const signedBody = "cuerpo original";
      const otherBody = "cuerpo distinto";
      const signer = createSign("sha1");
      signer.update(signedBody);
      const signature = signer.sign(ecPrivateKey, "base64");

      const verifySha1 = createVerify("sha1");
      verifySha1.update(otherBody);
      const resultSha1 = verifySha1.verify(ecPem, signature, "base64");

      const verifySsl3Sha1 = createVerify("ssl3-sha1");
      verifySsl3Sha1.update(otherBody);
      const resultSsl3Sha1 = verifySsl3Sha1.verify(ecPem, signature, "base64");

      expect(resultSha1).toBe(false);
      expect(resultSsl3Sha1).toBe(false);
    });
  });
});
