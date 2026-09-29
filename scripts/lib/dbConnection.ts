import { PrismaClient } from "../../src/generated/prisma";
import { sanitizeErrorMessage } from "./sanitizeError";

/**
 * Comprobación de conexión reutilizable (usada por `db:check` y por el
 * paso de migración del build): un `SELECT 1` para confirmar que MySQL
 * responde, y un intento de contar filas para saber si las tablas de
 * Preciara ya existen. Nunca escribe nada. El mensaje de error, si lo hay,
 * ya viene saneado (sin usuario/contraseña/URL de conexión).
 */
export type ConnectionCheckResult =
  | { ok: true; ms: number; tablesReady: true; counts: { categories: number; merchants: number; products: number; offers: number } }
  | { ok: true; ms: number; tablesReady: false }
  | { ok: false; sanitizedMessage: string };

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Límite de tiempo para el primer `SELECT 1`, configurable con
 * `DB_CONNECT_TIMEOUT_MS` sin tocar código. Sin este límite, un host/puerto
 * que no responde (paquete descartado en vez de rechazado, p. ej. un
 * firewall o un host mal escrito) puede colgar la comprobación de conexión
 * mucho más tiempo del que un build tolera, sin ningún mensaje de error.
 */
export function connectionTimeoutMs(): number {
  const raw = Number(process.env.DB_CONNECT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CONNECTION_TIMEOUT_MS;
}

export async function checkDatabaseConnection(): Promise<ConnectionCheckResult> {
  const prisma = new PrismaClient({ log: ["error"] });
  const start = Date.now();
  try {
    const timeoutMs = connectionTimeoutMs();
    const queryPromise = prisma.$queryRaw`SELECT 1`;
    // Evita un "unhandled rejection" si gana el timeout y la consulta acaba fallando más tarde.
    queryPromise.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        queryPromise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Tiempo de espera agotado (${timeoutMs} ms) al conectar con MySQL.`)),
            timeoutMs
          );
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const ms = Date.now() - start;

    try {
      const [categories, merchants, products, offers] = await Promise.all([
        prisma.category.count(),
        prisma.merchant.count(),
        prisma.product.count(),
        prisma.offer.count(),
      ]);
      return { ok: true, ms, tablesReady: true, counts: { categories, merchants, products, offers } };
    } catch {
      // Conecta, pero las tablas de Preciara todavía no existen (normal
      // antes de aplicar migraciones por primera vez): no es un fallo de
      // conexión.
      return { ok: true, ms, tablesReady: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, sanitizedMessage: sanitizeErrorMessage(message) };
  } finally {
    await prisma.$disconnect();
  }
}

/** `true` solo cuando hay una `DATABASE_URL` no vacía definida. */
export function isMigrationApplicable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
