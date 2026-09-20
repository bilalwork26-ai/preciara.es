import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { checkDatabaseConnection, isMigrationApplicable } from "./lib/dbConnection";
import { runBuildMigration } from "./build-migrate";

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe("isMigrationApplicable", () => {
  it("es false sin DATABASE_URL", () => {
    delete process.env.DATABASE_URL;
    expect(isMigrationApplicable()).toBe(false);
  });

  it("es false con DATABASE_URL vacía", () => {
    process.env.DATABASE_URL = "";
    expect(isMigrationApplicable()).toBe(false);
  });

  it("es true con DATABASE_URL definida", () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost:3306/db";
    expect(isMigrationApplicable()).toBe(true);
  });
});

describe("runBuildMigration: sin DATABASE_URL, el build nunca se bloquea", () => {
  it("omite la migración y devuelve código 0 (no rompe un checkout sin BD)", async () => {
    delete process.env.DATABASE_URL;
    const code = await runBuildMigration();
    expect(code).toBe(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("checkDatabaseConnection / runBuildMigration (integración, BD local de pruebas)", () => {
  it("checkDatabaseConnection detecta una conexión real y sana", async () => {
    const result = await checkDatabaseConnection();
    expect(result.ok).toBe(true);
    if (result.ok && result.tablesReady) {
      expect(result.counts.categories).toBeGreaterThanOrEqual(0);
    }
  });

  it("runBuildMigration devuelve 0 con una base de datos real accesible", async () => {
    const code = await runBuildMigration();
    expect(code).toBe(0);
  });

  it("una contraseña incorrecta en DATABASE_URL nunca aparece en el mensaje de error (el usuario sí puede aparecer: es lo que ya reporta MySQL en 'access denied', no es secreto)", async () => {
    const badPassword = "clave-secreta-de-prueba-no-real";
    process.env.DATABASE_URL = `mysql://usuario_incorrecto:${badPassword}@localhost:3306/preciara_dev`;

    const result = await checkDatabaseConnection();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.sanitizedMessage).not.toContain(badPassword);
      expect(result.sanitizedMessage).not.toContain("mysql://");
    }
  });

  it("runBuildMigration devuelve un código distinto de 0 si la conexión falla (nunca continúa a migrar)", async () => {
    process.env.DATABASE_URL = "mysql://usuario_incorrecto:clave-falsa@localhost:3306/preciara_dev";
    const code = await runBuildMigration();
    expect(code).not.toBe(0);
  });

  it("un host inexistente (p. ej. 'localhost' mal configurado en producción) nunca revela la URL completa en el error", async () => {
    const fakePassword = "otra-clave-de-prueba-no-real";
    process.env.DATABASE_URL = `mysql://preciara:${fakePassword}@host-que-no-existe.invalid:3306/preciara_dev`;
    const result = await checkDatabaseConnection();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.sanitizedMessage).not.toContain(fakePassword);
      expect(result.sanitizedMessage).not.toContain("mysql://");
    }
  });
});

// Misma técnica que src/server/db/client.test.ts, home.test.ts y
// search.test.ts: Prisma recarga `.env` del disco al importarse, así que
// para simular "sin DATABASE_URL en absoluto" (ni siquiera un .env físico
// con un valor real) hay que apartar el fichero, no basta con borrar la
// variable en caliente.
const ENV_PATH = path.resolve(__dirname, "../.env");
const ENV_BACKUP_PATH = `${ENV_PATH}.build-migrate-test-backup`;
let envFileMoved = false;

describe("runBuildMigration: checkout limpio, sin .env físico en absoluto", () => {
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

  it("el build sigue funcionando (código 0) sin ningún fichero .env ni variable de entorno", async () => {
    delete process.env.DATABASE_URL;
    const code = await runBuildMigration();
    expect(code).toBe(0);
  });
});
