import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

async function freshProxy() {
  vi.resetModules();
  return import("./proxy");
}

describe("proxy (protección de /admin y /api/admin)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SESSION_SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("responde 404 en /admin cuando la autenticación no está configurada", async () => {
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/admin"));
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("responde 404 en /admin/login cuando la autenticación no está configurada", async () => {
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/admin/login"));
    expect(res.status).toBe(404);
  });

  it("responde 404 en /api/admin/import cuando la autenticación no está configurada", async () => {
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/api/admin/import", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("redirige a /admin/login cuando falta la cookie de sesión", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("deja pasar /admin/login sin sesión (para poder mostrar el formulario)", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/admin/login"));
    // NextResponse.next() no es una redirección: deja continuar la petición.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("responde 401 JSON en /api/admin/import sin sesión válida", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/api/admin/import", { method: "POST" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("deja pasar /admin con una cookie de sesión válida", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { createSessionToken, ADMIN_SESSION_COOKIE } = await import("./server/admin/auth");
    const token = createSessionToken()!;
    const { proxy } = await freshProxy();
    const request = new NextRequest("https://preciara.es/admin", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
    });
    const res = proxy(request);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("protege /admin/sincronizacion igual que el resto del panel: 404 sin auth configurada", async () => {
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/admin/sincronizacion"));
    expect(res.status).toBe(404);
  });

  it("redirige /admin/sincronizacion a /admin/login sin sesión", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { proxy } = await freshProxy();
    const res = proxy(new NextRequest("https://preciara.es/admin/sincronizacion"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("deja pasar /admin/sincronizacion con una cookie de sesión válida", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { createSessionToken, ADMIN_SESSION_COOKIE } = await import("./server/admin/auth");
    const token = createSessionToken()!;
    const { proxy } = await freshProxy();
    const request = new NextRequest("https://preciara.es/admin/sincronizacion", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
    });
    const res = proxy(request);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("rechaza una cookie de sesión inválida en /admin", async () => {
    process.env.ADMIN_PASSWORD = "correcto-horse-battery-staple";
    process.env.ADMIN_SESSION_SECRET = "un-secreto-distinto-y-largo";
    const { ADMIN_SESSION_COOKIE } = await import("./server/admin/auth");
    const { proxy } = await freshProxy();
    const request = new NextRequest("https://preciara.es/admin/productos", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=token-falso` },
    });
    const res = proxy(request);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });
});
