import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import { isUniqueConstraintViolation } from "@/server/db/prismaErrors";

/**
 * Bloqueo distribuido por "lease" (concesión con caducidad), parametrizado
 * por nombre — modelo `SyncLock` en prisma/schema.prisma.
 *
 * Sustituye al mecanismo anterior basado en `GET_LOCK`/`RELEASE_LOCK` de
 * MySQL: ese mecanismo exige que ambas llamadas se ejecuten sobre la MISMA
 * conexión física, algo que el pool de conexiones de Prisma no garantiza
 * entre dos `$queryRawUnsafe` independientes — se comprobó de forma
 * empírica que puede fallar de forma intermitente (un bloqueo adquirido en
 * una conexión y "liberado" en otra distinta no se libera de verdad, y
 * queda retenido hasta que esa conexión se recicle). Un lease no depende
 * de qué conexión lo pide: es una fila con una fecha de caducidad que
 * cualquier conexión puede leer/tomar de forma atómica con un `UPDATE ...
 * WHERE expiresAt < NOW()`, así que nunca puede quedar retenido para
 * siempre — como mucho, hasta que expire.
 *
 * - `acquireDistributedLock` adquiere el lease (o falla si ya está
 *   ocupado) e inicia un "heartbeat" en segundo plano que lo renueva
 *   mientras se sostiene, para que una sincronización larga no pierda su
 *   propio bloqueo a mitad de camino.
 * - `releaseDistributedLock` detiene el heartbeat y borra el lease — solo
 *   si todavía somos su titular (nunca interfiere con un lease que ya
 *   caducó y que otro proceso haya tomado después).
 * - Si el proceso muere o lanza sin pasar por `releaseDistributedLock`
 *   (p. ej. dentro de un `finally`), el lease simplemente expira solo: no
 *   depende de que nadie limpie nada.
 */
const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutos: margen amplio frente a una sincronización normal, corto frente a "para siempre".
// Suelo bajo a propósito (no "1 segundo fijo"): con un ttlMs corto (p. ej.
// en pruebas), un suelo alto haría que el primer latido llegara DESPUÉS de
// que el propio lease ya hubiera caducado, dejando el heartbeat inútil.
const MIN_HEARTBEAT_INTERVAL_MS = 50;

type HeldLease = { holderId: string; ttlMs: number; heartbeat: ReturnType<typeof setInterval> };
const heldLeases = new Map<string, HeldLease>();

/** Intenta crear el lease; si la fila ya existe, solo lo toma si ya caducó. Atómico y seguro ante carreras (ver decisiones). */
async function tryAcquireOrSteal(
  db: NonNullable<typeof prisma>,
  name: string,
  holderId: string,
  expiresAt: Date,
  now: Date
): Promise<boolean> {
  try {
    await db.syncLock.create({ data: { name, holderId, expiresAt } });
    return true;
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    // La fila ya existe: un `UPDATE ... WHERE expiresAt < NOW()` es atómico
    // a nivel de fila en MySQL/InnoDB — si dos procesos compiten por el
    // mismo lease caducado a la vez, como mucho uno de los dos UPDATE
    // afecta a la fila (el otro llega tarde: para entonces `expiresAt` ya
    // se movió al futuro y su condición WHERE deja de cumplirse).
    const result = await db.syncLock.updateMany({
      where: { name, expiresAt: { lt: now } },
      data: { holderId, expiresAt, acquiredAt: now },
    });
    return result.count === 1;
  }
}

async function renewLease(name: string, holderId: string, ttlMs: number): Promise<void> {
  if (!prisma) return;
  try {
    const result = await prisma.syncLock.updateMany({
      where: { name, holderId },
      data: { expiresAt: new Date(Date.now() + ttlMs) },
    });
    if (result.count === 0) {
      // Ya no somos el titular (el lease caducó y otro proceso lo tomó
      // antes de que este latido llegara a tiempo): se registra, pero no
      // se aborta el trabajo en curso — límite documentado de esta fase.
      console.warn(`[distributedLock] El lease "${name}" ya no es nuestro (caducó y fue tomado por otro proceso).`);
    }
  } catch (error) {
    console.error(`[distributedLock] No se pudo renovar el lease "${name}":`, error);
  }
}

/** `ttlMs`: cuánto dura la concesión antes de poder ser tomada por otro si no se renueva ni se libera. */
export async function acquireDistributedLock(name: string, ttlMs = DEFAULT_TTL_MS): Promise<boolean> {
  if (!prisma) return false;
  if (heldLeases.has(name)) return false; // ya lo sostenemos nosotros mismos en este proceso: no es reentrante.

  const holderId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const acquired = await tryAcquireOrSteal(prisma, name, holderId, expiresAt, now);
  if (!acquired) return false;

  const heartbeatMs = Math.max(MIN_HEARTBEAT_INTERVAL_MS, Math.floor(ttlMs / 3));
  const heartbeat = setInterval(() => {
    void renewLease(name, holderId, ttlMs);
  }, heartbeatMs);
  heartbeat.unref?.(); // el latido nunca debe ser motivo por sí solo para mantener vivo el proceso.
  heldLeases.set(name, { holderId, ttlMs, heartbeat });
  return true;
}

export async function releaseDistributedLock(name: string): Promise<void> {
  const held = heldLeases.get(name);
  if (!held) return; // nunca lo sostuvimos nosotros en este proceso: no hay nada propio que liberar.
  clearInterval(held.heartbeat);
  heldLeases.delete(name);

  if (!prisma) return;
  try {
    await prisma.syncLock.deleteMany({ where: { name, holderId: held.holderId } });
  } catch (error) {
    // No relanza: un fallo al liberar nunca debe tapar el error original de
    // quien estaba haciendo el trabajo dentro del bloqueo. El lease, en el
    // peor caso, expira solo — nunca queda retenido para siempre.
    console.error(`[distributedLock] No se pudo liberar el lease "${name}" (expirará solo en el peor de los casos):`, error);
  }
}

/** Nombre de bloqueo usado históricamente por el importador CSV (CLI y panel). No cambiar: rompería la compatibilidad con despliegues ya en marcha. */
export const CSV_IMPORT_LOCK_NAME = "preciara_csv_import";

/** Nombre de bloqueo por fuente para el núcleo de sincronización de catálogos (Awin/eBay). */
export function catalogSyncLockName(source: string): string {
  return `preciara_catalog_sync:${source}`;
}
