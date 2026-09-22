import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { backfillCanonicalGtinFromEan } from "./backfillCanonicalGtin";

const PREFIX = "test-backfill-canonical-gtin";

// GTIN-14 válidos (dígito de control verificado por separado con gtin.ts).
const GTIN_A = "11000000000006";
const GTIN_B = "12000000000005";
const GTIN_DUP = "13000000000004";

async function cleanup() {
  if (!prisma) return;
  await prisma.product.deleteMany({ where: { category: { slug: { startsWith: PREFIX } } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

describe.skipIf(!process.env.DATABASE_URL)("backfillCanonicalGtinFromEan (integración, BD local de pruebas)", () => {
  afterEach(cleanup);
  afterAll(cleanup);

  it("rellena canonicalGtin de un producto histórico con un ean válido pero sin canonicalGtin todavía", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-1`, name: "Cat" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-1`, name: "P", categoryId: category.id, ean: GTIN_A } });
    expect(product.canonicalGtin).toBeNull();

    const summary = await backfillCanonicalGtinFromEan(prisma!, { dryRun: false });
    expect(summary.backfilled).toBeGreaterThanOrEqual(1);
    expect(summary.outcomes).toContainEqual({ productId: product.id, ean: GTIN_A, result: "backfilled", normalizedGtin: GTIN_A });

    const reread = await prisma!.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reread.canonicalGtin).toBe(GTIN_A);
  });

  it("un ean con formato inválido/libre se deja intacto: nunca rellena canonicalGtin ni rechaza el producto", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-2`, name: "Cat" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-2`, name: "P", categoryId: category.id, ean: "formato-libre-no-gtin" } });

    const summary = await backfillCanonicalGtinFromEan(prisma!, { dryRun: false });
    expect(summary.outcomes).toContainEqual({ productId: product.id, ean: "formato-libre-no-gtin", result: "invalid_gtin" });

    const reread = await prisma!.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reread.canonicalGtin).toBeNull();
    expect(reread.ean).toBe("formato-libre-no-gtin"); // nunca se toca
  });

  it("un producto que ya tiene canonicalGtin no es candidato (no aparece en outcomes, no se toca)", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-3`, name: "Cat" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-3`, name: "P", categoryId: category.id, ean: GTIN_A, canonicalGtin: GTIN_A } });

    const summary = await backfillCanonicalGtinFromEan(prisma!, { dryRun: false });
    expect(summary.outcomes.find((o) => o.productId === product.id)).toBeUndefined();

    const reread = await prisma!.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reread.canonicalGtin).toBe(GTIN_A); // no se sobrescribe (ya coincidía)
  });

  it("dos productos históricos con el MISMO ean duplicado: el más antiguo (id menor) se backfilla, el otro se reporta como conflicto — nunca se fusionan ni se borran", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-4`, name: "Cat" } });
    const older = await prisma!.product.create({ data: { slug: `${PREFIX}-product-4-older`, name: "Older", categoryId: category.id, ean: GTIN_DUP } });
    const newer = await prisma!.product.create({ data: { slug: `${PREFIX}-product-4-newer`, name: "Newer", categoryId: category.id, ean: GTIN_DUP } });
    expect(older.id).toBeLessThan(newer.id);

    const summary = await backfillCanonicalGtinFromEan(prisma!, { dryRun: false });
    expect(summary.outcomes).toContainEqual({ productId: older.id, ean: GTIN_DUP, result: "backfilled", normalizedGtin: GTIN_DUP });
    expect(summary.outcomes).toContainEqual({ productId: newer.id, ean: GTIN_DUP, result: "conflict", normalizedGtin: GTIN_DUP, conflictingProductId: older.id });
    expect(summary.conflicts).toBeGreaterThanOrEqual(1);

    // Nunca se fusionan ni se borran: ambos productos siguen existiendo, cada uno con su propia fila.
    const olderReread = await prisma!.product.findUniqueOrThrow({ where: { id: older.id } });
    const newerReread = await prisma!.product.findUniqueOrThrow({ where: { id: newer.id } });
    expect(olderReread.canonicalGtin).toBe(GTIN_DUP);
    expect(newerReread.canonicalGtin).toBeNull(); // se queda sin enlazar, pero intacto
    expect(newerReread.ean).toBe(GTIN_DUP); // el ean libre no se toca
  });

  it("dry-run clasifica correctamente (backfilled/invalid_gtin/conflict) sin escribir nada en la base", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-5`, name: "Cat" } });
    const clean = await prisma!.product.create({ data: { slug: `${PREFIX}-product-5-clean`, name: "Clean", categoryId: category.id, ean: GTIN_B } });
    const holder = await prisma!.product.create({ data: { slug: `${PREFIX}-product-5-holder`, name: "Holder", categoryId: category.id, canonicalGtin: GTIN_DUP } });
    const conflicting = await prisma!.product.create({ data: { slug: `${PREFIX}-product-5-conflicting`, name: "Conflicting", categoryId: category.id, ean: GTIN_DUP } });
    void holder;

    const summary = await backfillCanonicalGtinFromEan(prisma!, { dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.outcomes).toContainEqual({ productId: clean.id, ean: GTIN_B, result: "backfilled", normalizedGtin: GTIN_B });
    expect(summary.outcomes.find((o) => o.productId === conflicting.id)).toMatchObject({ result: "conflict", normalizedGtin: GTIN_DUP });

    // Nada se escribió de verdad.
    const cleanReread = await prisma!.product.findUniqueOrThrow({ where: { id: clean.id } });
    const conflictingReread = await prisma!.product.findUniqueOrThrow({ where: { id: conflicting.id } });
    expect(cleanReread.canonicalGtin).toBeNull();
    expect(conflictingReread.canonicalGtin).toBeNull();
  });

  it("es idempotente: ejecutarlo dos veces seguidas no cambia nada la segunda vez para lo ya resuelto", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-6`, name: "Cat" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-6`, name: "P", categoryId: category.id, ean: GTIN_A } });

    const first = await backfillCanonicalGtinFromEan(prisma!, { dryRun: false });
    expect(first.outcomes.find((o) => o.productId === product.id)).toMatchObject({ result: "backfilled" });

    const second = await backfillCanonicalGtinFromEan(prisma!, { dryRun: false });
    // Ya no es candidato (canonicalGtin dejó de ser null): no vuelve a aparecer.
    expect(second.outcomes.find((o) => o.productId === product.id)).toBeUndefined();

    const reread = await prisma!.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reread.canonicalGtin).toBe(GTIN_A); // estable, no cambió en la segunda pasada
  });
});
