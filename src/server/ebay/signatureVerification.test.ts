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

type RecordedCall = { url: string; method: string; headers: Record<string, string>; body?: string };

/**
 * Registra CADA petición saliente (URL, método, cabeceras y cuerpo exactos)
 * para poder comprobar la forma exacta de la petición OAuth y de la
 * petición de clave pública — no solo el resultado final. `tokenResponse`/
 * `keyResponse` aceptan `rawBody` para simular una respuesta que NO es
 * JSON válido (p. ej. una página de error de un proxy/WAF intermedio).
 * `networkFailure` simula un fallo de red (fetch rechaza la promesa) antes
 * de recibir ninguna respuesta.
 */
function mockFetchSequence(params: {
  tokenResponse?: { status: number; body?: unknown; rawBody?: string };
  keyResponse?: { status: number; body?: unknown; rawBody?: string };
  networkFailureOn?: "oauth" | "public_key";
}) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) new Headers(init.headers).forEach((value, key) => (headers[key] = value));
    calls.push({ url, method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : undefined });

    if (url.includes("/oauth2/token")) {
      if (params.networkFailureOn === "oauth") throw new TypeError("fetch failed (simulado)");
      const { status = 200, body = { access_token: "fake-app-token", expires_in: 7200 }, rawBody } = params.tokenResponse ?? {};
      return new Response(rawBody ?? JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/public_key/")) {
      if (params.networkFailureOn === "public_key") throw new TypeError("fetch failed (simulado)");
      const { status = 200, body = { key: publicKey }, rawBody } = params.keyResponse ?? {};
      return new Response(rawBody ?? JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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

    it("REGRESIÓN del fallo real en producción: clave EC con cabeceras PEM pero saltos de línea 'escapados' literalmente (texto backslash+n, no saltos reales) ahora verifica correctamente", async () => {
      // Antes de esta rama, `formatPublicKeyAsPem` devolvía la clave TAL
      // CUAL en cuanto detectaba "BEGIN PUBLIC KEY" en el texto, sin
      // limpiar el formato — Node/OpenSSL rechazaba ese PEM al verificar
      // (ERR_OSSL_UNSUPPORTED), lo que producía exactamente el fallo real
      // reportado: reason "verify_error". Esta prueba reproduce esa forma
      // exacta de clave y confirma que `normalizeEbayPublicKey` la corrige.
      const rawBody = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n-regresion", data: {} } });
      const signature = signBody(rawBody, ecPrivateKey);
      const header = buildSignatureHeader("kid-ec-literal-newline-regresion", signature);
      const keyWithLiteralNewlines = ecPublicKey.replace(/\n/g, "\\n");
      expect(keyWithLiteralNewlines.includes("\n")).toBe(false); // confirma que de verdad no hay saltos reales

      mockFetchSequence({ keyResponse: { status: 200, body: { key: keyWithLiteralNewlines } } });
      const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: true });
    });

    it("REGRESIÓN: clave EC con cabeceras PEM pero CRLF en vez de LF también verifica correctamente", async () => {
      const rawBody = "cuerpo de prueba con clave EC en CRLF";
      const signature = signBody(rawBody, ecPrivateKey);
      const header = buildSignatureHeader("kid-ec-crlf-regresion", signature);
      const keyWithCrlf = ecPublicKey.replace(/\n/g, "\r\n");

      mockFetchSequence({ keyResponse: { status: 200, body: { key: keyWithCrlf } } });
      const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: true });
    });

    it("clave pública realmente inválida (no es una clave DER real): verified: false, reason: public_key_normalization_error, con nodeErrorCode", async () => {
      const header = buildSignatureHeader("kid-ec-invalid-key", signBody("cuerpo"));
      const bogusBase64 = Buffer.alloc(32, 0).toString("base64");
      mockFetchSequence({ keyResponse: { status: 200, body: { key: bogusBase64 } } });

      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result.verified).toBe(false);
      if (!result.verified) {
        expect(result.reason).toBe("public_key_normalization_error");
        expect(result.nodeErrorCode).toBeDefined();
        expect(typeof result.nodeErrorCode).toBe("string");
      }
    });

    describe("investigación del punto 9: ¿necesita el campo 'signature' de la cabecera normalización base64/base64url?", () => {
      it("una firma real codificada en base64url (sin relleno, '-'/'_' en vez de '+'/'/') verifica igual de bien que en base64 estándar — Node decodifica ambas con 'base64' sin cambios de código", async () => {
        const rawBody = "cuerpo de prueba para investigar base64url";
        // ECDSA firma con un nonce aleatorio en cada llamada: se reintenta
        // sobre el MISMO cuerpo (todas las firmas resultantes son
        // igualmente válidas) hasta obtener una que de verdad contenga
        // algún carácter especial de base64 estándar (+, / o relleno =)
        // — si no, la transformación a base64url sería un no-op y la
        // prueba no demostraría nada. Con ~96 caracteres de firma, la
        // probabilidad de necesitar más de un intento es baja, pero no
        // nula: sin este reintento la prueba era intermitente.
        let standardBase64Signature = signBody(rawBody, ecPrivateKey);
        for (let attempts = 0; !/[+/=]/.test(standardBase64Signature) && attempts < 20; attempts++) {
          standardBase64Signature = signBody(rawBody, ecPrivateKey);
        }
        expect(standardBase64Signature).toMatch(/[+/=]/); // si esto falla, algo va realmente mal (extremadamente improbable)

        const base64UrlSignature = standardBase64Signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        expect(base64UrlSignature).not.toBe(standardBase64Signature); // confirma que de verdad son formas distintas del mismo valor

        const header = buildSignatureHeader("kid-base64url-investigacion", base64UrlSignature);
        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });

        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        // Conclusión de la investigación (punto 9): NO se justifica tocar
        // el análisis de `signature` — Node ya la acepta en ambos
        // formatos sin ningún cambio de código, así que no se modifica.
        expect(result).toEqual({ verified: true });
      });
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

  describe("obtención OAuth / clave pública: forma exacta de las peticiones y motivos específicos de fallo", () => {
    it("la petición OAuth es exactamente POST .../identity/v1/oauth2/token con Basic auth, form-urlencoded y el body correctamente codificado", async () => {
      const credentials = freshCredentials();
      const header = buildSignatureHeader("kid-oauth-shape", signBody("cuerpo"));
      const { calls } = mockFetchSequence({});

      await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: credentials });

      const tokenCall = calls.find((c) => c.url.includes("/oauth2/token"));
      expect(tokenCall).toBeDefined();
      expect(tokenCall!.url).toBe("https://api.ebay.com/identity/v1/oauth2/token");
      expect(tokenCall!.method).toBe("POST");
      expect(tokenCall!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
      const expectedBasicAuth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
      expect(tokenCall!.headers.authorization).toBe(`Basic ${expectedBasicAuth}`);
      // scope=https://api.ebay.com/oauth/api_scope correctamente codificado
      // (":" -> "%3A", "/" -> "%2F"), idéntico a querystring.stringify del
      // SDK OAuth oficial de eBay (verificado por separado).
      expect(tokenCall!.body).toBe("grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope");
    });

    it("la petición de clave pública es exactamente GET .../public_key/{kid} con Bearer auth y el kid codificado de forma segura", async () => {
      const kidWithSpecialChars = "kid with spaces/slashes?and=query&chars";
      const header = buildSignatureHeader(kidWithSpecialChars, signBody("cuerpo"));
      const { calls } = mockFetchSequence({ tokenResponse: { status: 200, body: { access_token: "el-token-de-aplicacion", expires_in: 7200 } } });

      await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });

      const keyCall = calls.find((c) => c.url.includes("/public_key/"));
      expect(keyCall).toBeDefined();
      expect(keyCall!.url).toBe(`https://api.ebay.com/commerce/notification/v1/public_key/${encodeURIComponent(kidWithSpecialChars)}`);
      expect(keyCall!.url).not.toContain(" "); // nunca un espacio literal sin codificar en la URL
      expect(keyCall!.method).toBe("GET");
      expect(keyCall!.headers.authorization).toBe("Bearer el-token-de-aplicacion");
    });

    it.each([401, 403, 404, 500])("fallo HTTP %i al obtener el token OAuth: verified: false, reason: oauth_http_error, httpStatus: %i", async (status) => {
      const header = buildSignatureHeader(`kid-oauth-http-${status}`, signBody("cuerpo"));
      mockFetchSequence({ tokenResponse: { status, body: { error: "simulado" } } });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "oauth_http_error", httpStatus: status });
    });

    it.each([401, 403, 404, 500])("fallo HTTP %i al obtener la clave pública: verified: false, reason: public_key_http_error, httpStatus: %i", async (status) => {
      const header = buildSignatureHeader(`kid-key-http-${status}`, signBody("cuerpo"));
      mockFetchSequence({ keyResponse: { status, body: { error: "simulado" } } });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "public_key_http_error", httpStatus: status });
    });

    it("respuesta OAuth 200 pero no es JSON válido (p. ej. una página de error de un proxy intermedio): reason oauth_invalid_response, sin httpStatus", async () => {
      const header = buildSignatureHeader("kid-oauth-malformed", signBody("cuerpo"));
      mockFetchSequence({ tokenResponse: { status: 200, rawBody: "<html>502 Bad Gateway</html>" } });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "oauth_invalid_response" });
    });

    it("respuesta OAuth 200 con JSON válido pero sin access_token: reason oauth_invalid_response", async () => {
      const header = buildSignatureHeader("kid-oauth-no-token", signBody("cuerpo"));
      mockFetchSequence({ tokenResponse: { status: 200, body: { token_type: "Application Access Token", expires_in: 7200 } } });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "oauth_invalid_response" });
    });

    it("respuesta de clave pública 200 pero no es JSON válido: reason public_key_invalid_response, sin httpStatus", async () => {
      const header = buildSignatureHeader("kid-key-malformed", signBody("cuerpo"));
      mockFetchSequence({ keyResponse: { status: 200, rawBody: "<html>502 Bad Gateway</html>" } });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "public_key_invalid_response" });
    });

    it("respuesta de clave pública 200 con JSON válido pero sin el campo key: reason public_key_invalid_response", async () => {
      const header = buildSignatureHeader("kid-key-no-field", signBody("cuerpo"));
      mockFetchSequence({ keyResponse: { status: 200, body: { algorithm: "ECDSA", digest: "SHA1" } } });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "public_key_invalid_response" });
    });

    it("fallo de red (sin respuesta HTTP) al pedir el token OAuth: reason oauth_http_error, sin httpStatus", async () => {
      const header = buildSignatureHeader("kid-oauth-network-fail", signBody("cuerpo"));
      mockFetchSequence({ networkFailureOn: "oauth" });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "oauth_http_error" });
    });

    it("fallo de red (sin respuesta HTTP) al pedir la clave pública: reason public_key_http_error, sin httpStatus", async () => {
      const header = buildSignatureHeader("kid-key-network-fail", signBody("cuerpo"));
      mockFetchSequence({ networkFailureOn: "public_key" });
      const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: header, oauthCredentials: freshCredentials() });
      expect(result).toEqual({ verified: false, reason: "public_key_http_error" });
    });
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
    expect(calls.filter((c) => c.url.includes("/oauth2/token"))).toHaveLength(1); // token cacheado: solo se pide una vez
    expect(calls.filter((c) => c.url.includes("/public_key/"))).toHaveLength(1); // clave cacheada: solo se pide una vez
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
      expect(calls.filter((c) => c.url.includes("/public_key/"))).toHaveLength(1); // sigue sin volver a pedirla
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
      expect(calls.filter((c) => c.url.includes("/public_key/"))).toHaveLength(2); // caducó -> se pidió de nuevo
      // El token OAuth de aplicación se mockea con expires_in: 7200s (2h):
      // a los 61 minutos sigue vigente, así que solo la clave se repite.
      expect(calls.filter((c) => c.url.includes("/oauth2/token"))).toHaveLength(1);
    });
  });
});
