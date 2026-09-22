/**
 * Ruta segura e idempotente para relacionar productos HISTÓRICOS (creados
 * por el importador CSV o el seed, antes de que existiera
 * `Product.canonicalGtin`) que ya tienen un `ean` guardado pero todavía no
 * tienen `canonicalGtin` — así una sincronización de Awin/eBay con el mismo
 * GTIN los reconoce como el mismo producto físico en vez de crear uno
 * duplicado (ver `applyOffer.ts`).
 *
 * Reglas:
 *   - Solo normaliza GTIN válidos (dígito de control correcto, ver
 *     `gtin.ts`) — un `ean` con formato libre o inválido se deja tal cual,
 *     sin tocar ni rechazar el producto.
 *   - Nunca sobrescribe un `canonicalGtin` ya establecido (la condición de
 *     la escritura es atómica: `WHERE id = ? AND canonicalGtin IS NULL`,
 *     no una lectura previa separada).
 *   - Si el GTIN normalizado ya pertenece a OTRO producto (duplicado
 *     histórico del campo libre `ean`, o una carrera con una
 *     sincronización concurrente en curso), se detecta el conflicto
 *     (P2002 de la restricción única) y se reporta — nunca se fusionan ni
 *     se borran productos.
 *   - Idempotente: los productos ya resueltos (con éxito o en conflicto
 *     documentado) dejan de aparecer como candidatos en la siguiente
 *     ejecución en cuanto tienen `canonicalGtin` no nulo; un conflicto sin
 *     resolver se vuelve a reportar cada vez, hasta que se resuelva a mano.
 *   - `dryRun: true` (el modo por defecto del script CLI) solo lee y
 *     clasifica, sin escribir nada.
 *   - No se ejecuta contra producción automáticamente: el CLI
 *     (`scripts/backfill-canonical-gtin.ts`) exige `--apply` explícito para
 *     escribir, y además se niega a escribir si `NODE_ENV=production`
 *     — solo `dryRun`/lectura funciona ahí, nunca una escritura real.
 */
import type { PrismaClient } from "@/generated/prisma";
import { isUniqueConstraintViolationOn } from "@/server/db/prismaErrors";
import { normalizeGtinOrNull } from "./gtin";

export type BackfillOutcome =
  | { productId: number; ean: string; result: "backfilled"; normalizedGtin: string }
  | { productId: number; ean: string; result: "invalid_gtin" }
  | { productId: number; ean: string; result: "conflict"; normalizedGtin: string; conflictingProductId: number | null };

export type BackfillSummary = {
  dryRun: boolean;
  scanned: number;
  backfilled: number;
  invalidGtin: number;
  conflicts: number;
  outcomes: BackfillOutcome[];
};

/**
 * Recorre los productos con `ean` presente y `canonicalGtin` vacío, y
 * rellena este último cuando el `ean` resulta ser un GTIN válido y no está
 * ya en uso por otro producto. Procesa en un orden estable (`id` ascendente)
 * para que, ante duplicados históricos del mismo GTIN en `ean`, siempre
 * "gane" el mismo producto (el más antiguo) en ejecuciones sucesivas.
 */
export async function backfillCanonicalGtinFromEan(db: PrismaClient, { dryRun }: { dryRun: boolean }): Promise<BackfillSummary> {
  const candidates = await db.product.findMany({
    where: { ean: { not: null }, canonicalGtin: null },
    orderBy: { id: "asc" },
    select: { id: true, ean: true },
  });

  const outcomes: BackfillOutcome[] = [];
  let backfilled = 0;
  let invalidGtin = 0;
  let conflicts = 0;

  for (const candidate of candidates) {
    const ean = candidate.ean!; // filtrado por la consulta (`ean: { not: null }`)
    const normalizedGtin = normalizeGtinOrNull(ean);

    if (!normalizedGtin) {
      invalidGtin += 1;
      outcomes.push({ productId: candidate.id, ean, result: "invalid_gtin" });
      continue;
    }

    if (dryRun) {
      const other = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin }, select: { id: true } });
      if (other) {
        conflicts += 1;
        outcomes.push({ productId: candidate.id, ean, result: "conflict", normalizedGtin, conflictingProductId: other.id });
      } else {
        backfilled += 1; // "se backfillaría" en una ejecución real — no se escribe nada aquí
        outcomes.push({ productId: candidate.id, ean, result: "backfilled", normalizedGtin });
      }
      continue;
    }

    try {
      // La condición `canonicalGtin: null` en el WHERE es la comprobación
      // atómica de "nunca sobrescribir" — no una lectura previa separada
      // que podría quedar desfasada frente a una escritura concurrente.
      const result = await db.product.updateMany({
        where: { id: candidate.id, canonicalGtin: null },
        data: { canonicalGtin: normalizedGtin },
      });
      if (result.count === 1) {
        backfilled += 1;
        outcomes.push({ productId: candidate.id, ean, result: "backfilled", normalizedGtin });
      }
      // count === 0: otro proceso le puso canonicalGtin a ESTE producto
      // entre la consulta inicial y esta escritura (nunca se sobrescribe);
      // no se reporta como fila propia, ya no hace falta nada.
    } catch (error) {
      if (!isUniqueConstraintViolationOn(error, "canonicalGtin")) throw error;
      const other = await db.product.findFirst({ where: { canonicalGtin: normalizedGtin }, select: { id: true } });
      conflicts += 1;
      outcomes.push({ productId: candidate.id, ean, result: "conflict", normalizedGtin, conflictingProductId: other?.id ?? null });
    }
  }

  return { dryRun, scanned: candidates.length, backfilled, invalidGtin, conflicts, outcomes };
}
