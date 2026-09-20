import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function freshAuthModule() {
  vi.resetModules();
  return import("./auth");
}

describe("admin auth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is not configured when both env vars are missing", async () => {
    const { isAdminAuthConfigured } = await freshAuthModule();
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it("is not configured when only one env var is set", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    const { isAdminAuthConfigured } = await freshAuthModule();
    expect(isAdminAuthConfigured()).toBe(false);
  });

  it("is configured when both env vars are set", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { isAdminAuthConfigured } = await freshAuthModule();
    expect(isAdminAuthConfigured()).toBe(true);
  });

  it("verifyAdminPassword rejects everything when not configured", async () => {
    const { verifyAdminPassword } = await freshAuthModule();
    expect(verifyAdminPassword("cualquier-cosa")).toBe(false);
  });

  it("verifyAdminPassword accepts only the exact configured password", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { verifyAdminPassword } = await freshAuthModule();
    expect(verifyAdminPassword("correcto-horse-battery-staple")).toBe(true);
    expect(verifyAdminPassword("incorrecta")).toBe(false);
    expect(verifyAdminPassword("")).toBe(false);
  });

  it("createSessionToken returns null when not configured", async () => {
    const { createSessionToken } = await freshAuthModule();
    expect(createSessionToken()).toBeNull();
  });

  it("round-trips a valid session token", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { createSessionToken, verifySessionToken } = await freshAuthModule();
    const token = createSessionToken();
    expect(token).not.toBeNull();
    expect(verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered session token", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { createSessionToken, verifySessionToken } = await freshAuthModule();
    const token = createSessionToken()!;
    const [payload] = token.split(".");
    const tampered = `${payload}.0000000000000000000000000000000000000000000000000000000000000000`;
    expect(verifySessionToken(tampered)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "secreto-uno";
    const mod1 = await freshAuthModule();
    const token = mod1.createSessionToken()!;

    process.env.ADMIN_SESSION_SECRET = "secreto-dos-distinto";
    const mod2 = await freshAuthModule();
    expect(mod2.verifySessionToken(token)).toBe(false);
  });

  it("rejects an expired session token", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { verifySessionToken } = await freshAuthModule();

    // Fabricamos un token ya caducado firmándolo con la misma lógica que el módulo.
    const { createHmac } = await import("node:crypto");
    const payload = String(Date.now() - 1000);
    const sig = createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(payload).digest("hex");
    expect(verifySessionToken(`${payload}.${sig}`)).toBe(false);
  });

  it("rejects null/undefined/empty tokens", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { verifySessionToken } = await freshAuthModule();
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken("sin-punto")).toBe(false);
  });
});
