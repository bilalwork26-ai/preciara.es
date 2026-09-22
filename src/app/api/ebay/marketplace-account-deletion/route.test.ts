import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

const { verifyEbaySignatureMock } = vi.hoisted(() => ({ verifyEbaySignatureMock: vi.fn() }));
vi.mock("@/server/ebay/signatureVerification", () => ({
  verifyEbaySignature: verifyEbaySignatureMock,
}));

// Import DESPUÉS del vi.mock (hoisted de todos modos, pero así queda claro el orden lógico).
import { GET, POST } from "./route";

const ENDPOINT = "https://preciara.es/api/ebay/marketplace-account-deletion";
const VERIFICATION_TOKEN = "preciara-verification-token-fixture-32chars";

function setConfigEnv() {
  process.env.EBAY_MARKETPLACE_DELETION_ENDPOINT = ENDPOINT;
  process.env.EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN = VERIFICATION_TOKEN;
}
function clearConfigEnv() {
  delete process.env.EBAY_MARKETPLACE_DELETION_ENDPOINT;
  delete process.env.EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN;
}

describe("GET /api/ebay/marketplace-account-deletion (validación del endpoint)", () => {
  afterEach(() => {
    clearConfigEnv();
  });

  it("con challenge_code y configuración correctas, responde 200 con el hash esperado, JSON, sin caché", async () => {
    setConfigEnv();
    const challengeCode = "abc123";
    const request = new NextRequest(`${ENDPOINT}?challenge_code=${challengeCode}`);
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    const expectedHash = createHash("sha256").update(challengeCode).update(VERIFICATION_TOKEN).update(ENDPOINT).digest("hex");
    expect(body).toEqual({ challengeResponse: expectedHash });
  });

  it("sin challenge_code, responde 400", async () => {
    setConfigEnv();
    const request = new NextRequest(ENDPOINT);
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("con challenge_code pero sin EBAY_MARKETPLACE_DELETION_ENDPOINT/_VERIFICATION_TOKEN configurados, responde 500 sin exponer nada sensible", async () => {
    clearConfigEnv();
    const request = new NextRequest(`${ENDPOINT}?challenge_code=abc123`);
    const response = await GET(request);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/preciara-verification-token|VERIFICATION_TOKEN=/);
  });

  it("con solo una de las dos variables configurada, sigue tratándose como 'sin configurar' (500)", async () => {
    process.env.EBAY_MARKETPLACE_DELETION_ENDPOINT = ENDPOINT;
    delete process.env.EBAY_MARKETPLACE_DELETION_VERIFICATION_TOKEN;
    const request = new NextRequest(`${ENDPOINT}?challenge_code=abc123`);
    const response = await GET(request);
    expect(response.status).toBe(500);
  });
});

describe("POST /api/ebay/marketplace-account-deletion (notificaciones)", () => {
  beforeEach(() => {
    verifyEbaySignatureMock.mockReset();
  });

  it("firma válida (según verifyEbaySignature): responde 204 sin cuerpo, sin caché", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "cabecera-de-prueba" },
      body: JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: {} } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("firma inválida (según verifyEbaySignature): responde 412", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: false, reason: "signature_mismatch" });
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "firma-invalida" },
      body: JSON.stringify({ metadata: {}, notification: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(412);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("firma válida pero cuerpo no es JSON válido: responde 412 (rechazo cerrado, no 204)", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "x" },
      body: "esto no es json {",
    });
    const response = await POST(request);
    expect(response.status).toBe(412);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("firma válida pero metadata.topic distinto de MARKETPLACE_ACCOUNT_DELETION: responde 412", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "x" },
      body: JSON.stringify({ metadata: { topic: "PRIORITY_LISTING_REVISION" }, notification: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(412);
  });

  it("firma válida y JSON válido pero sin metadata.topic: responde 412", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "x" },
      body: JSON.stringify({ notification: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(412);
  });

  it("firma válida con metadata.schemaVersion distinto de '1.0' sigue aceptándose (204): no se fija esa versión", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "x" },
      body: JSON.stringify({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "2.0" }, notification: {} }),
    });
    const response = await POST(request);
    expect(response.status).toBe(204);
  });

  it("sin cabecera X-EBAY-SIGNATURE, se delega igualmente en verifyEbaySignature (que la rechazará) y responde 412", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: false, reason: "missing_header" });
    const request = new NextRequest(ENDPOINT, { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request);
    expect(response.status).toBe(412);
    expect(verifyEbaySignatureMock).toHaveBeenCalledWith(expect.objectContaining({ signatureHeader: null }));
  });

  it("si verifyEbaySignature lanza una excepción inesperada, nunca responde 200/204: responde 412", async () => {
    verifyEbaySignatureMock.mockRejectedValue(new Error("fallo de red simulado"));
    const request = new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-ebay-signature": "x" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(412);
  });

  it("pasa el cuerpo BRUTO (sin reserializar) a verifyEbaySignature, tal cual se recibió", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const rawBody = '{"b":1,"a":2}'; // orden de claves deliberadamente "no canónico"
    const request = new NextRequest(ENDPOINT, { method: "POST", headers: { "x-ebay-signature": "x" }, body: rawBody });
    await POST(request);
    expect(verifyEbaySignatureMock).toHaveBeenCalledWith(expect.objectContaining({ rawBody }));
  });

  it("nunca registra el cuerpo de la notificación ni datos personales (username/userId/eiasToken), con firma válida", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const sensitiveBody = JSON.stringify({
      metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
      notification: { data: { username: "usuario-secreto-123", userId: "eBayUserIdABC", eiasToken: "TOKEN-EIAS-SUPER-SECRETO" } },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const request = new NextRequest(ENDPOINT, { method: "POST", headers: { "x-ebay-signature": "x" }, body: sensitiveBody });
      await POST(request);

      const allCalls = [...logSpy.mock.calls, ...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
      const loggedText = allCalls.map((args) => args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");
      expect(loggedText).not.toContain("usuario-secreto-123");
      expect(loggedText).not.toContain("eBayUserIdABC");
      expect(loggedText).not.toContain("TOKEN-EIAS-SUPER-SECRETO");
      expect(loggedText.toLowerCase()).not.toContain("username");
      expect(loggedText.toLowerCase()).not.toContain("eiastoken");
      expect(loggedText).not.toContain(sensitiveBody); // el cuerpo completo tampoco, ni siquiera indirectamente
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("nunca registra el cuerpo de la notificación ni datos personales, tampoco en el camino de firma inválida", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: false, reason: "signature_mismatch" });
    const sensitiveBody = JSON.stringify({ notification: { data: { username: "otro-usuario-secreto", eiasToken: "OTRO-TOKEN-SECRETO" } } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const request = new NextRequest(ENDPOINT, { method: "POST", headers: { "x-ebay-signature": "x" }, body: sensitiveBody });
      await POST(request);

      const allCalls = [...errorSpy.mock.calls, ...warnSpy.mock.calls];
      const loggedText = allCalls.map((args) => args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");
      expect(loggedText).not.toContain("otro-usuario-secreto");
      expect(loggedText).not.toContain("OTRO-TOKEN-SECRETO");
      expect(loggedText).not.toContain(sensitiveBody);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("registra los diagnostics de signature_mismatch (metadatos estructurales) pero nunca su contenido sensible, sea cual sea", async () => {
    verifyEbaySignatureMock.mockResolvedValue({
      verified: false,
      reason: "signature_mismatch",
      diagnostics: {
        rawBodyLength: 123,
        rawBodyIsValidJson: true,
        canonicalFallbackAttempted: true,
        rawBodyEqualsCanonicalBody: false,
        containsIntegerLikeKeys: true,
        containsLargeIntegerLiteral: false,
        signatureByteLength: 72,
        publicKeyType: "ec",
        publicKeyCurve: "prime256v1",
      },
    });
    const sensitiveBody = JSON.stringify({ notification: { data: { username: "diag-usuario-secreto", eiasToken: "DIAG-TOKEN-SECRETO" } } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const request = new NextRequest(ENDPOINT, { method: "POST", headers: { "x-ebay-signature": "x" }, body: sensitiveBody });
      const response = await POST(request);
      expect(response.status).toBe(412);

      const loggedText = warnSpy.mock.calls.map((args) => args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");
      // Los diagnostics estructurales SÍ deben llegar al log (para que sean útiles).
      expect(loggedText).toContain("rawBodyLength");
      expect(loggedText).toContain("publicKeyCurve");
      expect(loggedText).toContain("prime256v1");
      // Pero nunca el cuerpo real ni datos personales.
      expect(loggedText).not.toContain("diag-usuario-secreto");
      expect(loggedText).not.toContain("DIAG-TOKEN-SECRETO");
      expect(loggedText).not.toContain(sensitiveBody);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("nunca registra el cuerpo ni datos personales cuando la firma es válida pero el payload se rechaza (topic distinto)", async () => {
    verifyEbaySignatureMock.mockResolvedValue({ verified: true });
    const sensitiveBody = JSON.stringify({
      metadata: { topic: "PRIORITY_LISTING_REVISION" },
      notification: { data: { username: "tercer-usuario-secreto", eiasToken: "TERCER-TOKEN-SECRETO" } },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const request = new NextRequest(ENDPOINT, { method: "POST", headers: { "x-ebay-signature": "x" }, body: sensitiveBody });
      const response = await POST(request);
      expect(response.status).toBe(412);

      const allCalls = [...errorSpy.mock.calls, ...warnSpy.mock.calls];
      const loggedText = allCalls.map((args) => args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");
      expect(loggedText).not.toContain("tercer-usuario-secreto");
      expect(loggedText).not.toContain("TERCER-TOKEN-SECRETO");
      expect(loggedText).not.toContain(sensitiveBody);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
