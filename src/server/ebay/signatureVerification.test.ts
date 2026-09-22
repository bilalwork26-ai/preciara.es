import { afterEach, describe, expect, it, vi } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";
import { verifyEbaySignature } from "./signatureVerification";
import type { EbayOAuthCredentials } from "./config";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// eBay firma sus notificaciones ACTUALES con claves EC (curva prime256v1 /
// P-256, ECDSA) — el par RSA de arriba se conserva solo por la cobertura
// adicional que aporta (Node `crypto.createVerify`/`.verify()` es genérico
// frente al tipo de clave del PEM), pero la prueba obligatoria es la EC de
// más abajo, con el tipo de clave que eBay usa de verdad.
const { publicKey: ecPublicKey, privateKey: ecPrivateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function signBody(body: string, key: string = privateKey): string {
  const signer = createSign("sha1");
  signer.update(body);
  return signer.sign(key, "base64");
}

function buildSignatureHeader(kid: string, signatureBase64: string): string {
  return Buffer.from(JSON.stringify({ kid, signature: signatureBase64 })).toString("base64");
}

/** Cuenta llamadas por URL para distinguir el POST del token OAuth del GET de la clave pública. */
function mockFetchSequence(params: { tokenResponse?: { status: number; body: unknown }; keyResponse?: { status: number; body: unknown } }) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    if (url.includes("/oauth2/token")) {
      const { status = 200, body = { access_token: "fake-app-token", expires_in: 7200 } } = params.tokenResponse ?? {};
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/public_key/")) {
      const { status = 200, body = { key: publicKey } } = params.keyResponse ?? {};
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`URL inesperada en la prueba: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

// La caché del token OAuth de aplicación se indexa por clientId (ver
// signatureVerification.ts): cada prueba usa un clientId propio para que
// el resultado cacheado de una prueba nunca "contamine" la siguiente
// (igual que el kid, más abajo, para la caché de la clave pública).
let credentialsCounter = 0;
function freshCredentials(): EbayOAuthCredentials {
  credentialsCounter += 1;
  return { clientId: `test-client-id-${credentialsCounter}`, clientSecret: "test-client-secret" };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyEbaySignature", () => {
  it("firma válida (RSA-SHA1 sobre el cuerpo bruto, clave pública en PEM completo): verified: true", async () => {
    const rawBody = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: {} } });
    const signature = signBody(rawBody);
    const header = buildSignatureHeader("kid-valid-1", signature);
    mockFetchSequence({});

    const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: true });
  });

  it("firma válida con la clave pública en formato 'en bruto' (sin cabeceras PEM, como la envía eBay de verdad)", async () => {
    const rawBody = "cuerpo de prueba para la clave en bruto";
    const signature = signBody(rawBody);
    const header = buildSignatureHeader("kid-valid-raw", signature);
    const rawKeyBody = publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, "");
    mockFetchSequence({ keyResponse: { status: 200, body: { key: rawKeyBody } } });

    const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: true });
  });

  it("firma inválida (el cuerpo verificado no coincide con el firmado): verified: false, reason: signature_mismatch", async () => {
    const signedBody = "cuerpo original firmado";
    const tamperedBody = "cuerpo alterado después de firmar";
    const signature = signBody(signedBody);
    const header = buildSignatureHeader("kid-invalid-1", signature);
    mockFetchSequence({});

    const result = await verifyEbaySignature({ rawBody: tamperedBody, signatureHeader: header, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: false, reason: "signature_mismatch" });
  });

  describe("clave EC (prime256v1 / P-256, ECDSA) — el tipo de clave que usan las notificaciones ACTUALES de eBay", () => {
    it("firma real EC+SHA-1 sobre el cuerpo JSON bruto exacto: verified: true", async () => {
      const rawBody = JSON.stringify({
        metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
        notification: { notificationId: "n-1", eventDate: "2026-09-22T00:00:00.000Z", data: {} },
      });
      const signature = signBody(rawBody, ecPrivateKey); // firma real con la clave privada EC
      const header = buildSignatureHeader("kid-ec-valid", signature); // base64(JSON.stringify({kid, signature})), formato real
      mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } }); // getPublicKey devuelve la clave pública EC

      const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: true });
    });

    it("el mismo cuerpo con UN SOLO byte modificado tras firmar: verified: false, reason: signature_mismatch", async () => {
      const rawBody = JSON.stringify({
        metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
        notification: { notificationId: "n-2", eventDate: "2026-09-22T00:00:00.000Z", data: {} },
      });
      const signature = signBody(rawBody, ecPrivateKey);
      const header = buildSignatureHeader("kid-ec-tampered", signature);

      // Un solo carácter distinto (mismo largo, mismo JSON válido) respecto
      // al cuerpo realmente firmado: la firma ECDSA es sensible a cualquier
      // cambio, por mínimo que sea.
      const tamperedBody = rawBody.replace('"n-2"', '"n-3"');
      expect(tamperedBody).not.toBe(rawBody);
      expect(tamperedBody.length).toBe(rawBody.length); // confirma que el cambio es mínimo, no una reescritura

      mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
      const result = await verifyEbaySignature({ rawBody: tamperedBody, signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "signature_mismatch" });
    });

    it("también funciona con la clave pública EC 'en bruto' (sin cabeceras PEM, como la envía eBay de verdad)", async () => {
      const rawBody = "cuerpo de prueba EC en formato de clave en bruto";
      const signature = signBody(rawBody, ecPrivateKey);
      const header = buildSignatureHeader("kid-ec-raw", signature);
      const rawEcKeyBody = ecPublicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n/g, "");
      mockFetchSequence({ keyResponse: { status: 200, body: { key: rawEcKeyBody } } });

      const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: true });
    });
  });

  it("sin cabecera X-EBAY-SIGNATURE: verified: false, reason: missing_header (nunca intenta red)", async () => {
    const { fetchMock } = mockFetchSequence({});
    const result = await verifyEbaySignature({ rawBody: "cualquier cuerpo", signatureHeader: null, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: false, reason: "missing_header" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cabecera que no es base64+JSON válido: verified: false, reason: malformed_header", async () => {
    const { fetchMock } = mockFetchSequence({});
    const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: "no-es-base64-json-válido!!", oauthCredentials: freshCredentials() });
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toBe("malformed_header");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cabecera decodificable pero sin kid/signature: verified: false, reason: malformed_header", async () => {
    const header = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64");
    const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: false, reason: "malformed_header" });
  });

  it("sin credenciales OAuth configuradas: verified: false, reason: oauth_not_configured (nunca intenta red)", async () => {
    const header = buildSignatureHeader("kid-no-oauth", signBody("cuerpo"));
    const { fetchMock } = mockFetchSequence({});
    const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: null });
    expect(result).toEqual({ verified: false, reason: "oauth_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fallo al obtener el token OAuth de eBay: verified: false, reason: public_key_fetch_failed", async () => {
    const header = buildSignatureHeader("kid-oauth-fail", signBody("cuerpo"));
    mockFetchSequence({ tokenResponse: { status: 401, body: { error: "invalid_client" } } });
    const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: false, reason: "public_key_fetch_failed" });
  });

  it("fallo al obtener la clave pública de eBay: verified: false, reason: public_key_fetch_failed", async () => {
    const header = buildSignatureHeader("kid-key-fail", signBody("cuerpo"));
    mockFetchSequence({ keyResponse: { status: 404, body: { error: "not found" } } });
    const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
    expect(result).toEqual({ verified: false, reason: "public_key_fetch_failed" });
  });

  it("cachea el token OAuth y la clave pública: dos verificaciones con el mismo kid solo llaman a la red una vez cada una", async () => {
    const kid = "kid-cache-test";
    const bodyA = "primera notificación";
    const bodyB = "segunda notificación";
    const { fetchMock, calls } = mockFetchSequence({});
    // A propósito, las MISMAS credenciales en ambas llamadas (a diferencia
    // del resto de pruebas): es justo lo que se quiere comprobar — que
    // reutilizar el mismo clientId/kid sí reutiliza la caché.
    const sharedCredentials = freshCredentials();

    const resultA = await verifyEbaySignature({ rawBody: bodyA, signatureHeader: buildSignatureHeader(kid, signBody(bodyA)), oauthCredentials: sharedCredentials });
    const resultB = await verifyEbaySignature({ rawBody: bodyB, signatureHeader: buildSignatureHeader(kid, signBody(bodyB)), oauthCredentials: sharedCredentials });

    expect(resultA).toEqual({ verified: true });
    expect(resultB).toEqual({ verified: true });
    expect(calls.filter((u) => u.includes("/oauth2/token"))).toHaveLength(1); // token cacheado: solo se pide una vez
    expect(calls.filter((u) => u.includes("/public_key/"))).toHaveLength(1); // clave cacheada: solo se pide una vez
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 token + 1 clave, nunca más pese a 2 verificaciones
  });

  describe("caché de la clave pública: TTL máximo de 1 hora", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("reutiliza la clave pública cacheada dentro de la hora de vigencia (no vuelve a pedirla)", async () => {
      vi.useFakeTimers();
      const kid = "kid-ttl-reuse";
      const bodyA = "cuerpo A";
      const bodyB = "cuerpo B";
      const { calls } = mockFetchSequence({});
      const sharedCredentials = freshCredentials();

      const resultA = await verifyEbaySignature({ rawBody: bodyA, signatureHeader: buildSignatureHeader(kid, signBody(bodyA)), oauthCredentials: sharedCredentials });
      vi.advanceTimersByTime(59 * 60 * 1000); // 59 minutos: todavía dentro de la hora de caché
      const resultB = await verifyEbaySignature({ rawBody: bodyB, signatureHeader: buildSignatureHeader(kid, signBody(bodyB)), oauthCredentials: sharedCredentials });

      expect(resultA).toEqual({ verified: true });
      expect(resultB).toEqual({ verified: true });
      expect(calls.filter((u) => u.includes("/public_key/"))).toHaveLength(1); // sigue sin volver a pedirla
    });

    it("pide una clave pública nueva cuando ha pasado más de 1 hora desde que se cacheó", async () => {
      vi.useFakeTimers();
      const kid = "kid-ttl-expire";
      const bodyA = "cuerpo A";
      const bodyB = "cuerpo B";
      const { calls } = mockFetchSequence({});
      const sharedCredentials = freshCredentials();

      const resultA = await verifyEbaySignature({ rawBody: bodyA, signatureHeader: buildSignatureHeader(kid, signBody(bodyA)), oauthCredentials: sharedCredentials });
      vi.advanceTimersByTime(61 * 60 * 1000); // 61 minutos: ya caducó (máximo 1 hora)
      const resultB = await verifyEbaySignature({ rawBody: bodyB, signatureHeader: buildSignatureHeader(kid, signBody(bodyB)), oauthCredentials: sharedCredentials });

      expect(resultA).toEqual({ verified: true });
      expect(resultB).toEqual({ verified: true });
      expect(calls.filter((u) => u.includes("/public_key/"))).toHaveLength(2); // caducó -> se pidió de nuevo
      // El token OAuth de aplicación se mockea con expires_in: 7200s (2h):
      // a los 61 minutos sigue vigente, así que solo la clave se repite.
      expect(calls.filter((u) => u.includes("/oauth2/token"))).toHaveLength(1);
    });
  });
});
