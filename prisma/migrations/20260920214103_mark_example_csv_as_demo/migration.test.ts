import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";

const PREFIX = "test-mark-example-demo";
const MIGRATION_SQL_PATH = path.join(__dirname, "migration.sql");

/** Ejecuta el fichero de migración real (no una copia) tal cual lo aplicaría `prisma migrate deploy`. */
async function applyMigration(): Promise<void> {
  const sql = readFileSync(MIGRATION_SQL_PATH, "utf8");
  // Quita las líneas de comentario ANTES de partir por ";": si no, el
  // bloque de comentario inicial (que no termina en ";") se fusiona con
  // la primera sentencia real y toda esa sentencia queda descartada.
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  expect(statements.length).toBeGreaterThan(0); // si el fichero cambia de forma, que falle aquí y no en silencio
  for (const statement of statements) {
    await prisma!.$executeRawUnsafe(statement);
  }
}

describe.skipIf(!process.env.DATABASE_URL)("migración: marcar como demo lo importado desde ofertas-ejemplo.csv", () => {
  let categoryId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría de prueba" } });
    categoryId = category.id;

    // Reproduce exactamente el estado erróneo de producción: las filas de
    // examples/ofertas-ejemplo.csv importadas con el código ANTIGUO, que
    // marcaba isDemo=false a la fuerza sin distinguir origen.
    await prisma!.merchant.createMany({
      data: [
        { slug: "tienda-ejemplo-uno", name: "Tienda Ejemplo Uno", websiteUrl: "https://tienda-ejemplo-uno.example.invalid", isDemo: false },
        { slug: "tienda-ejemplo-dos", name: "Tienda Ejemplo Dos", websiteUrl: "https://tienda-ejemplo-dos.example.invalid", isDemo: false },
        { slug: "tienda-ejemplo-tres", name: "Tienda Ejemplo Tres", websiteUrl: "https://tienda-ejemplo-tres.example.invalid", isDemo: false },
        // Decoy: comercio real cuyo nombre se parece pero cuyo dominio NO es .example.invalid.
        { slug: `${PREFIX}-tienda-real-parecida`, name: "Tienda Ejemplo Real (de verdad)", websiteUrl: "https://tienda-ejemplo-real.example.com", isDemo: false },
      ],
    });
    await prisma!.product.createMany({
      data: [
        { slug: "altavoz-portatil-xz1", name: "Altavoz portátil de ejemplo XZ1", brand: "MarcaFicticia", categoryId, isDemo: false },
        { slug: "cafetera-goteo-c200", name: "Cafetera de goteo de ejemplo C200", brand: "MarcaFicticia", categoryId, isDemo: false },
        // Decoy: producto real que por casualidad comparte la marca "MarcaFicticia" pero tiene otro slug.
        { slug: `${PREFIX}-producto-marca-coincidente`, name: "Producto real de prueba", brand: "MarcaFicticia", categoryId, isDemo: false },
      ],
    });

    const [p1, p2, pDecoy] = await Promise.all([
      prisma!.product.findUniqueOrThrow({ where: { slug: "altavoz-portatil-xz1" } }),
      prisma!.product.findUniqueOrThrow({ where: { slug: "cafetera-goteo-c200" } }),
      prisma!.product.findUniqueOrThrow({ where: { slug: `${PREFIX}-producto-marca-coincidente` } }),
    ]);
    const [m1, m2, m3, mDecoy] = await Promise.all([
      prisma!.merchant.findUniqueOrThrow({ where: { slug: "tienda-ejemplo-uno" } }),
      prisma!.merchant.findUniqueOrThrow({ where: { slug: "tienda-ejemplo-dos" } }),
      prisma!.merchant.findUniqueOrThrow({ where: { slug: "tienda-ejemplo-tres" } }),
      prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-tienda-real-parecida` } }),
    ]);

    await prisma!.offer.createMany({
      data: [
        { productId: p1.id, merchantId: m1.id, currentPrice: 49.99, productUrl: "https://tienda-ejemplo-uno.example.invalid/altavoz-xz1", availability: "IN_STOCK", lastCheckedAt: new Date(), isDemo: false },
        { productId: p1.id, merchantId: m2.id, currentPrice: 54.5, productUrl: "https://tienda-ejemplo-dos.example.invalid/p/altavoz-xz1", availability: "IN_STOCK", lastCheckedAt: new Date(), isDemo: false },
        { productId: p2.id, merchantId: m1.id, currentPrice: 129, productUrl: "https://tienda-ejemplo-uno.example.invalid/cafetera-c200", availability: "PREORDER", lastCheckedAt: new Date(), isDemo: false },
        { productId: p2.id, merchantId: m3.id, currentPrice: 119.9, productUrl: "https://tienda-ejemplo-tres.example.invalid/cafetera-c200", availability: "OUT_OF_STOCK", lastCheckedAt: new Date(), isDemo: false },
        // Decoy: oferta real de un producto/comercio que solo coincide parcialmente con las señales del CSV de ejemplo.
        { productId: pDecoy.id, merchantId: mDecoy.id, currentPrice: 25, productUrl: "https://tienda-ejemplo-real.example.com/producto", availability: "IN_STOCK", lastCheckedAt: new Date(), isDemo: false },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { in: ["altavoz-portatil-xz1", "cafetera-goteo-c200"] } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { in: ["tienda-ejemplo-uno", "tienda-ejemplo-dos", "tienda-ejemplo-tres"] } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: `${PREFIX}-cat` } });
  });

  it("marca como demo los 3 comercios, 2 productos y 4 ofertas del CSV de ejemplo", async () => {
    await applyMigration();

    const merchants = await prisma!.merchant.findMany({
      where: { slug: { in: ["tienda-ejemplo-uno", "tienda-ejemplo-dos", "tienda-ejemplo-tres"] } },
    });
    expect(merchants).toHaveLength(3);
    expect(merchants.every((m) => m.isDemo)).toBe(true);

    const products = await prisma!.product.findMany({
      where: { slug: { in: ["altavoz-portatil-xz1", "cafetera-goteo-c200"] } },
    });
    expect(products).toHaveLength(2);
    expect(products.every((p) => p.isDemo)).toBe(true);

    const offers = await prisma!.offer.findMany({
      where: { product: { slug: { in: ["altavoz-portatil-xz1", "cafetera-goteo-c200"] } } },
    });
    expect(offers).toHaveLength(4);
    expect(offers.every((o) => o.isDemo)).toBe(true);
  });

  it("no toca datos reales que solo coinciden parcialmente con las señales del CSV de ejemplo", async () => {
    await applyMigration();

    const decoyMerchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-tienda-real-parecida` } });
    expect(decoyMerchant.isDemo).toBe(false);

    const decoyProduct = await prisma!.product.findUniqueOrThrow({ where: { slug: `${PREFIX}-producto-marca-coincidente` } });
    expect(decoyProduct.isDemo).toBe(false);

    const decoyOffer = await prisma!.offer.findFirstOrThrow({ where: { product: { slug: `${PREFIX}-producto-marca-coincidente` } } });
    expect(decoyOffer.isDemo).toBe(false);
  });

  it("es idempotente: aplicarla dos veces deja el mismo resultado", async () => {
    await applyMigration();
    await applyMigration();

    const products = await prisma!.product.findMany({
      where: { slug: { in: ["altavoz-portatil-xz1", "cafetera-goteo-c200"] } },
    });
    expect(products.every((p) => p.isDemo)).toBe(true);

    const decoyProduct = await prisma!.product.findUniqueOrThrow({ where: { slug: `${PREFIX}-producto-marca-coincidente` } });
    expect(decoyProduct.isDemo).toBe(false);
  });

  it("no borra ninguna fila: los mismos comercios/productos/ofertas siguen existiendo", async () => {
    const beforeCounts = {
      merchants: await prisma!.merchant.count({ where: { slug: { in: ["tienda-ejemplo-uno", "tienda-ejemplo-dos", "tienda-ejemplo-tres"] } } }),
      products: await prisma!.product.count({ where: { slug: { in: ["altavoz-portatil-xz1", "cafetera-goteo-c200"] } } }),
    };
    await applyMigration();
    const afterCounts = {
      merchants: await prisma!.merchant.count({ where: { slug: { in: ["tienda-ejemplo-uno", "tienda-ejemplo-dos", "tienda-ejemplo-tres"] } } }),
      products: await prisma!.product.count({ where: { slug: { in: ["altavoz-portatil-xz1", "cafetera-goteo-c200"] } } }),
    };
    expect(afterCounts).toEqual(beforeCounts);
  });

  it("nunca borra ni modifica el historial de ImportRun/ImportError", async () => {
    const run = await prisma!.importRun.create({
      data: { source: `${PREFIX}:historial`, status: "SUCCESS", rowsRead: 4, productsCreated: 2, offersCreated: 4 },
    });
    await applyMigration();
    const stillThere = await prisma!.importRun.findUnique({ where: { id: run.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.status).toBe("SUCCESS");
    await prisma!.importRun.delete({ where: { id: run.id } });
  });
});
