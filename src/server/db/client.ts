import { PrismaClient } from "@/generated/prisma";

/**
 * Cliente Prisma compartido (Fase 2A).
 *
 * Comportamiento obligatorio de esta capa:
 * - Si `DATABASE_URL` no está definida, NO se construye ningún
 *   `PrismaClient` (construirlo sin URL lanzaría una excepción). `prisma`
 *   queda en `null` y `isDatabaseConfigured()` devuelve `false`: el resto
 *   de la app debe usar esto para servir el fallback de demostración, sin
 *   romper la portada ni devolver un 500.
 * - En desarrollo, el cliente se guarda en `globalThis` para sobrevivir al
 *   recargado en caliente de Next.js y no abrir una conexión nueva en cada
 *   cambio de fichero.
 * - Este módulo es exclusivamente de servidor: no debe importarse nunca
 *   desde un componente "use client".
 */

const globalForPrisma = globalThis as unknown as {
  __preciaraPrisma?: PrismaClient;
};

function createClient(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  } catch (error) {
    // No debería ocurrir (ya comprobamos que hay URL), pero si el propio
    // constructor falla (p. ej. URL malformada), lo registramos y seguimos
    // sin base de datos en lugar de tirar abajo el proceso.
    console.error("[db] No se pudo inicializar PrismaClient:", error);
    return null;
  }
}

export const prisma: PrismaClient | null = globalForPrisma.__preciaraPrisma ?? createClient();

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.__preciaraPrisma = prisma;
}

/** `true` si hay una `DATABASE_URL` configurada y el cliente se construyó correctamente. */
export function isDatabaseConfigured(): boolean {
  return prisma !== null;
}

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not-configured" }
  | { ok: false; reason: "error"; error: unknown };

/**
 * Envuelve cualquier consulta Prisma con el manejo de errores obligatorio:
 * sin base de datos configurada, devuelve `not-configured` sin tocar la
 * red; si la consulta falla (conexión caída, tabla inexistente, timeout...),
 * registra el error técnico completo en el log del servidor (nunca se
 * expone al visitante) y devuelve `error`. Quien llama decide el fallback.
 */
export async function withDb<T>(fn: (client: PrismaClient) => Promise<T>): Promise<DbResult<T>> {
  if (!prisma) return { ok: false, reason: "not-configured" };
  try {
    const data = await fn(prisma);
    return { ok: true, data };
  } catch (error) {
    console.error("[db] Error al consultar la base de datos:", error);
    return { ok: false, reason: "error", error };
  }
}
