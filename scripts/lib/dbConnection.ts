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

export async function checkDatabaseConnection(): Promise<ConnectionCheckResult> {
  const prisma = new PrismaClient({ log: ["error"] });
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
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
