/**
 * Helpers compartidos para reconocer conflictos de restricción única de
 * Prisma (P2002) al resolver carreras de creación optimista — usado por el
 * bloqueo distribuido (`src/server/importer/distributedLock.ts`), el
 * núcleo de sincronización de catálogos (`src/server/catalogSync/*`) y el
 * importador CSV (`src/server/importer/run.ts`), que comparten el mismo
 * patrón: "intenta crear/actualizar; si choca con la restricción única,
 * relee quién ganó la carrera y reutilízalo — nunca duplicar ni fusionar".
 */
import { Prisma } from "@/generated/prisma";

/** `true` si el error es un conflicto de restricción única de Prisma (P2002), de cualquier columna. */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * `true` si el P2002 recibido es (o probablemente es) por la restricción
 * única de la columna indicada — usado para decidir si conviene releer al
 * ganador de una carrera de creación optimista concurrente. Sin
 * información del índice en el error, se asume que sí: es la opción más
 * segura, ya que si no lo era, el re-fetch de quien llama no encontrará
 * ganador y relanzará el error original de todos modos.
 */
export function isUniqueConstraintViolationOn(error: unknown, columnNameSubstring: string): boolean {
  if (!isUniqueConstraintViolation(error)) return false;
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  if (typeof target === "string") return target.includes(columnNameSubstring);
  if (Array.isArray(target)) return target.some((t) => typeof t === "string" && t.includes(columnNameSubstring));
  return true;
}
