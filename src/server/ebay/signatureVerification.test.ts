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
    expect(result).toMatchObject({ verified: false, reason: "signature_mismatch" });
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
      expect(result).toMatchObject({ verified: false, reason: "signature_mismatch" });
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

    describe("canonicalización del payload firmado: fallback a JSON.stringify(JSON.parse(rawBody)) — el SDK oficial de eBay firma sobre el cuerpo YA PARSEADO, no sobre los bytes crudos", () => {
      it("REGRESIÓN: firma calculada sobre JSON.stringify(payload) (como hace el SDK oficial), pero el cuerpo HTTP crudo llega con diferencias de formato inocuas (indentado, espacios, salto final) — verifica correctamente mediante el fallback", async () => {
        const payload = {
          metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
          notification: { notificationId: "n-canonicalizacion", eventDate: "2026-09-22T00:00:00.000Z", data: {} },
        };
        // Esto es EXACTAMENTE lo que firma el SDK oficial de eBay
        // (`event-notification-nodejs-sdk`, `lib/validator.js`:
        // `verifier.update(JSON.stringify(message))`, con `message` ya
        // parseado por `express.json()` antes de llegar al SDK).
        const canonicalBody = JSON.stringify(payload);
        const signature = signBody(canonicalBody, ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-canonicalizacion", signature);

        // El cuerpo HTTP crudo que de verdad recibe este endpoint: el
        // MISMO JSON (mismo contenido, mismo orden de claves — nunca se
        // reordenan), pero con formato distinto (indentado bonito + salto
        // de línea final) — una diferencia de formato inocua y realista.
        const rawBody = JSON.stringify(payload, null, 2) + "\n";
        expect(rawBody).not.toBe(canonicalBody); // confirma que de verdad son cadenas distintas
        expect(JSON.parse(rawBody)).toEqual(JSON.parse(canonicalBody)); // mismo contenido

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result).toEqual({ verified: true });
      });

      it("una firma calculada directamente sobre el cuerpo crudo (sin diferencias de formato) se sigue aceptando en el primer intento, sin necesidad del fallback", async () => {
        const payload = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n-cuerpo-crudo", data: {} } };
        const rawBody = JSON.stringify(payload);
        const signature = signBody(rawBody, ecPrivateKey); // firma directamente sobre rawBody, como el caso normal ya cubierto arriba
        const header = buildSignatureHeader("kid-ec-cuerpo-crudo-directo", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result).toEqual({ verified: true });
      });

      it("firma que no corresponde a NINGUNA de las dos representaciones (ni al cuerpo crudo ni a JSON.stringify(JSON.parse(rawBody))): verified: false, reason: signature_mismatch", async () => {
        const payload = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n-firma-incorrecta", data: {} } };
        const rawBody = JSON.stringify(payload, null, 2) + "\n\n"; // cuerpo crudo con formato distinto al canónico
        const signature = signBody("un cuerpo totalmente distinto que nadie recibió nunca", ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-firma-incorrecta", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result).toMatchObject({ verified: false, reason: "signature_mismatch" });
      });

      it("cuerpo HTTP crudo que no es JSON válido: no hay segunda representación que probar, falla cerrado con reason: signature_mismatch (nunca lanza ni verifica igual)", async () => {
        const rawBody = "esto no es JSON válido {{{";
        const signature = signBody("un cuerpo completamente distinto, no el rawBody real", ecPrivateKey); // no coincide con el cuerpo crudo real
        const header = buildSignatureHeader("kid-ec-json-invalido", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result).toMatchObject({ verified: false, reason: "signature_mismatch" });
      });

      it("no se acepta una TERCERA representación distinta (ni el cuerpo crudo ni JSON.stringify(JSON.parse(rawBody))): verified: false, reason: signature_mismatch", async () => {
        const payload = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n-tercera-representacion", data: {} } };
        // Cuerpo crudo real: indentado con 2 espacios.
        const rawBody = JSON.stringify(payload, null, 2);
        // Representación canónica que SÍ se prueba como fallback: compacta.
        const canonicalBody = JSON.stringify(payload);
        // Una TERCERA representación (indentado con 4 espacios) que nunca
        // debería probarse — ni coincide con rawBody ni con canonicalBody.
        const thirdRepresentation = JSON.stringify(payload, null, 4);
        expect(thirdRepresentation).not.toBe(rawBody);
        expect(thirdRepresentation).not.toBe(canonicalBody);

        const signature = signBody(thirdRepresentation, ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-tercera-representacion", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result).toMatchObject({ verified: false, reason: "signature_mismatch" });
      });
    });

    describe("SignatureMismatchDiagnostics: metadatos puramente estructurales adjuntos a signature_mismatch (rama diagnose/ebay-signature-mismatch)", () => {
      it("firma que no corresponde a ninguna representación: diagnostics refleja longitudes/booleanos correctos, sin canonicalFallback porque rawBody YA es JSON válido y distinto del canónico", async () => {
        const payload = { metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n-diag-1", data: {} } };
        const rawBody = JSON.stringify(payload, null, 2); // formato "bonito": distinto de JSON.stringify(payload) compacto
        const signature = signBody("un cuerpo que nadie recibió nunca", ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-diag-1", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result.verified).toBe(false);
        if (result.verified) return;
        expect(result.reason).toBe("signature_mismatch");
        expect(result.diagnostics).toBeDefined();
        const diagnostics = result.diagnostics!;
        expect(diagnostics.rawBodyLength).toBe(rawBody.length);
        expect(diagnostics.rawBodyIsValidJson).toBe(true);
        expect(diagnostics.canonicalFallbackAttempted).toBe(true);
        expect(diagnostics.rawBodyEqualsCanonicalBody).toBe(false); // pretty-printed vs. compacto: distintos
        expect(diagnostics.containsIntegerLikeKeys).toBe(false);
        expect(diagnostics.containsLargeIntegerLiteral).toBe(false);
        expect(diagnostics.signatureByteLength).toBeGreaterThan(0);
        expect(diagnostics.publicKeyType).toBe("ec");
        expect(diagnostics.publicKeyCurve).toBe("prime256v1");
        // Nunca expone el contenido real: ni el rawBody, ni la firma, ni la clave.
        expect(JSON.stringify(diagnostics)).not.toContain("n-diag-1");
      });

      it("cuerpo con claves de forma entera anidadas: diagnostics.containsIntegerLikeKeys: true (aviso del reordenamiento nativo de JS en JSON.parse→JSON.stringify)", async () => {
        const rawBody = '{"metadata":{"topic":"MARKETPLACE_ACCOUNT_DELETION"},"notification":{"notificationId":"n-diag-2","data":{"10":"b","2":"a"}}}';
        const signature = signBody("un cuerpo que nadie recibió nunca", ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-diag-2", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result.verified).toBe(false);
        if (result.verified) return;
        expect(result.diagnostics?.containsIntegerLikeKeys).toBe(true);
      });

      it("cuerpo con un literal numérico de 16+ dígitos: diagnostics.containsLargeIntegerLiteral: true (aviso de posible pérdida de precisión IEEE-754)", async () => {
        const rawBody = '{"metadata":{"topic":"MARKETPLACE_ACCOUNT_DELETION"},"notification":{"publishAttemptCount":9007199254740993,"data":{}}}';
        const signature = signBody("un cuerpo que nadie recibió nunca", ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-diag-3", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result.verified).toBe(false);
        if (result.verified) return;
        expect(result.diagnostics?.containsLargeIntegerLiteral).toBe(true);
      });

      it("cuerpo que no es JSON válido: diagnostics.rawBodyIsValidJson: false, canonicalFallbackAttempted: false", async () => {
        const rawBody = "esto no es JSON válido {{{";
        const signature = signBody("un cuerpo que nadie recibió nunca", ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-diag-4", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result.verified).toBe(false);
        if (result.verified) return;
        expect(result.diagnostics?.rawBodyIsValidJson).toBe(false);
        expect(result.diagnostics?.canonicalFallbackAttempted).toBe(false);
        expect(result.diagnostics?.rawBodyEqualsCanonicalBody).toBe(false);
      });

      it("diagnostics NUNCA está presente cuando la firma SÍ verifica (verified: true)", async () => {
        const rawBody = JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { notificationId: "n-diag-5", data: {} } });
        const signature = signBody(rawBody, ecPrivateKey);
        const header = buildSignatureHeader("kid-ec-diag-5", signature);

        mockFetchSequence({ keyResponse: { status: 200, body: { key: ecPublicKey } } });
        const result = await verifyEbaySignature({ rawBody, signatureHeader: header, oauthCredentials: freshCredentials() });
        expect(result).toEqual({ verified: true }); // sin campo diagnostics: toEqual exacto sigue siendo válido aquí
      });

      it("diagnostics NUNCA está presente para otros motivos de fallo (p. ej. missing_header)", async () => {
        const result = await verifyEbaySignature({ rawBody: "cuerpo", signatureHeader: null, oauthCredentials: freshCredentials() });
        expect(result).toEqual({ verified: false, reason: "missing_header" }); // sin diagnostics: confirma que es exclusivo de signature_mismatch
      });
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
