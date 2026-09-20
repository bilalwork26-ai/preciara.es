import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";

const ORIGINAL_ENV = { ...process.env };

// El cliente generado de Prisma vuelve a cargar `.env` del disco como
// efecto colateral de importarse (comportamiento propio de Prisma, no de
// este proyecto), así que borrar `process.env.DATABASE_URL` en caliente no
// basta mientras exista un `.env` real en el repositorio: hay que apartarlo
// físicamente durante estas pruebas y devolverlo siempre al terminar.
const ENV_PATH = path.resolve(__dirname, "../../../.env");
const ENV_BACKUP_PATH = `${ENV_PATH}.client-test-backup`;
let envFileMoved = false;

describe("db client fallback (sin DATABASE_URL)", () => {
  beforeAll(() => {
    if (existsSync(ENV_PATH)) {
      renameSync(ENV_PATH, ENV_BACKUP_PATH);
      envFileMoved = true;
    }
  });

  afterAll(() => {
    if (envFileMoved) {
      renameSync(ENV_BACKUP_PATH, ENV_PATH);
      envFileMoved = false;
    }
  });

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    // El singleton se cachea en globalThis fuera de producción (para
    // sobrevivir al HMR de Next.js); hay que limpiarlo para que cada
    // prueba reimporte el módulo desde cero.
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("prisma es null cuando falta DATABASE_URL", async () => {
    const { prisma } = await import("./client");
    expect(prisma).toBeNull();
  });

  it("isDatabaseConfigured() es false cuando falta DATABASE_URL", async () => {
    const { isDatabaseConfigured } = await import("./client");
    expect(isDatabaseConfigured()).toBe(false);
  });

  it("withDb no intenta conectar y devuelve not-configured", async () => {
    const { withDb } = await import("./client");
    const fn = vi.fn();
    const result = await withDb(fn);
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("db client (con DATABASE_URL de pruebas local)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
  });

  it("prisma no es null cuando hay DATABASE_URL", async () => {
    const { prisma, isDatabaseConfigured } = await import("./client");
    expect(isDatabaseConfigured()).toBe(true);
    expect(prisma).not.toBeNull();
  });

  it("withDb registra el error técnico y no lanza si la consulta falla", async () => {
    const { withDb } = await import("./client");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await withDb(async () => {
      throw new Error("fallo simulado de consulta");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("error");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
