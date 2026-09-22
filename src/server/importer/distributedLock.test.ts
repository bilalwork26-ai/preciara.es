import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import { acquireDistributedLock, catalogSyncLockName, releaseDistributedLock } from "./distributedLock";

const TEST_LOCK = "test-distributed-lock-preciara";

describe.skipIf(!process.env.DATABASE_URL)("distributedLock (integración, BD local de pruebas)", () => {
  afterEach(async () => {
    if (!prisma) return;
    // Por si una prueba falla a media, deja la fila limpia para la siguiente.
    await prisma.syncLock.deleteMany({ where: { name: { startsWith: TEST_LOCK } } });
  });

  it("se puede adquirir y liberar un bloqueo libre", async () => {
    const acquired = await acquireDistributedLock(TEST_LOCK, 5000);
    expect(acquired).toBe(true);
    await releaseDistributedLock(TEST_LOCK);
    const row = await prisma!.syncLock.findUnique({ where: { name: TEST_LOCK } });
    expect(row).toBeNull(); // liberar de verdad borra la fila, no la deja "ocupada"
  });

  it("no es reentrante en el mismo proceso: volver a adquirir el mismo nombre sin liberar antes falla", async () => {
    const first = await acquireDistributedLock(TEST_LOCK, 5000);
    const second = await acquireDistributedLock(TEST_LOCK, 5000);
    expect(first).toBe(true);
    expect(second).toBe(false);
    await releaseDistributedLock(TEST_LOCK);
  });

  it("dos nombres de bloqueo distintos (dos fuentes) no se bloquean entre sí", async () => {
    const lockA = `${TEST_LOCK}-a`;
    const lockB = `${TEST_LOCK}-b`;
    const a = await acquireDistributedLock(lockA, 5000);
    const b = await acquireDistributedLock(lockB, 5000);
    expect(a).toBe(true);
    expect(b).toBe(true);
    await releaseDistributedLock(lockA);
    await releaseDistributedLock(lockB);
  });

  describe("concurrencia", () => {
    it("un lease ya sostenido por OTRO titular (fila creada directamente, no por este proceso) no se puede adquirir", async () => {
      // Simula "otro proceso" sosteniendo el lease: una fila real en la
      // base con un holderId distinto y sin caducar todavía. A diferencia
      // del mecanismo anterior (GET_LOCK, ligado a la conexión), esto no
      // depende de qué conexión física ejecuta la consulta: es una lectura
      // y escritura condicional normales sobre una fila, así que la prueba
      // es fiable de verdad (no intermitente).
      await prisma!.syncLock.create({
        data: { name: TEST_LOCK, holderId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
      });
      const acquired = await acquireDistributedLock(TEST_LOCK, 5000);
      expect(acquired).toBe(false);
    });

    it("dos intentos de adquisición 'simultáneos' (Promise.all) para el mismo nombre: solo uno gana", async () => {
      const [a, b] = await Promise.all([acquireDistributedLock(TEST_LOCK, 5000), acquireDistributedLock(TEST_LOCK, 5000)]);
      // Uno de los dos procesos "gana" la fila (el otro choca con la
      // restricción única de la tabla). Dentro del mismo proceso Node,
      // heldLeases también impide que el segundo intento se registre como
      // propio aunque por azar llegara antes a la base.
      expect([a, b].filter(Boolean)).toHaveLength(1);
      const rows = await prisma!.syncLock.findMany({ where: { name: TEST_LOCK } });
      expect(rows).toHaveLength(1); // nunca hay dos filas para el mismo nombre
      await releaseDistributedLock(TEST_LOCK); // libera al ganador (para no dejar su heartbeat corriendo)
    });
  });

  describe("liberación tras error", () => {
    it("si el trabajo dentro del bloqueo lanza una excepción, el finally libera el lease igualmente", async () => {
      const acquired = await acquireDistributedLock(TEST_LOCK, 5000);
      expect(acquired).toBe(true);

      await expect(
        (async () => {
          try {
            throw new Error("fallo simulado a mitad de la sincronización");
          } finally {
            await releaseDistributedLock(TEST_LOCK);
          }
        })()
      ).rejects.toThrow("fallo simulado");

      const row = await prisma!.syncLock.findUnique({ where: { name: TEST_LOCK } });
      expect(row).toBeNull(); // no queda retenido pese a la excepción

      // Y por tanto ya se puede volver a adquirir de inmediato.
      const acquiredAgain = await acquireDistributedLock(TEST_LOCK, 5000);
      expect(acquiredAgain).toBe(true);
      await releaseDistributedLock(TEST_LOCK);
    });

    it("liberar un lease que ya no es nuestro (caducó y otro lo tomó) no borra el de su nuevo titular", async () => {
      await acquireDistributedLock(TEST_LOCK, 5000);
      // Alguien más "roba" el lease directamente en la base (simula que
      // caducó y otro proceso lo tomó, sin pasar por este mismo proceso).
      const otherHolderId = randomUUID();
      await prisma!.syncLock.updateMany({
        where: { name: TEST_LOCK },
        data: { holderId: otherHolderId, expiresAt: new Date(Date.now() + 60_000) },
      });

      await releaseDistributedLock(TEST_LOCK); // nuestro intento de liberar, con nuestro holderId antiguo

      const row = await prisma!.syncLock.findUnique({ where: { name: TEST_LOCK } });
      expect(row).not.toBeNull(); // la fila del nuevo titular sigue intacta
      expect(row!.holderId).toBe(otherHolderId);

      await prisma!.syncLock.deleteMany({ where: { name: TEST_LOCK } }); // limpieza manual (no somos su titular)
    });
  });

  describe("timeout / caducidad", () => {
    it("un lease caducado (expiresAt en el pasado) se puede tomar aunque su titular nunca lo liberara", async () => {
      const staleHolderId = randomUUID();
      await prisma!.syncLock.create({
        data: { name: TEST_LOCK, holderId: staleHolderId, expiresAt: new Date(Date.now() - 1000) }, // ya caducado
      });

      const acquired = await acquireDistributedLock(TEST_LOCK, 5000);
      expect(acquired).toBe(true);

      const row = await prisma!.syncLock.findUniqueOrThrow({ where: { name: TEST_LOCK } });
      expect(row.holderId).not.toBe(staleHolderId); // ahora lo sostiene el nuevo titular

      await releaseDistributedLock(TEST_LOCK);
    });

    it("el heartbeat renueva la caducidad mientras el lease sigue sostenido (no expira solo por tardar)", async () => {
      const ttlMs = 300;
      await acquireDistributedLock(TEST_LOCK, ttlMs);
      const before = await prisma!.syncLock.findUniqueOrThrow({ where: { name: TEST_LOCK } });

      await new Promise((resolve) => setTimeout(resolve, ttlMs + 200)); // más que el ttl original: sin latido, ya habría caducado

      const after = await prisma!.syncLock.findUniqueOrThrow({ where: { name: TEST_LOCK } });
      expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
      expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now()); // sigue vigente, no caducado

      await releaseDistributedLock(TEST_LOCK);
    }, 10_000);
  });
});

describe("catalogSyncLockName", () => {
  it("genera un nombre de bloqueo distinto por fuente", () => {
    expect(catalogSyncLockName("AWIN")).toBe("preciara_catalog_sync:AWIN");
    expect(catalogSyncLockName("EBAY")).toBe("preciara_catalog_sync:EBAY");
    expect(catalogSyncLockName("AWIN")).not.toBe(catalogSyncLockName("EBAY"));
  });
});
