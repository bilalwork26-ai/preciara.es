import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getActiveProductsWithOffers, getProductBySlug, searchActiveProducts } from "./products";

const PREFIX = "test-products-repo-demo";

describe.skipIf(!process.env.DATABASE_URL)("repositorios de productos: el catálogo público excluye lo marcado isDemo", () => {
  let categoryId: number;
  let realProductId: number;
  let demoProductId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría de prueba" } });
    categoryId = category.id;

    const realMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-comercio-real`, name: "Comercio real de prueba", websiteUrl: "https://example.invalid", isDemo: false },
    });
    const demoMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-comercio-demo`, name: "Comercio demo de prueba", websiteUrl: "https://example.invalid", isDemo: true },
    });

    const realProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto-real`, name: "Producto real de prueba únicoXYZ", categoryId, isDemo: false },
    });
    realProductId = realProduct.id;
    const demoProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto-demo`, name: "Producto demo de prueba únicoXYZ", categoryId, isDemo: true },
    });
    demoProductId = demoProduct.id;

    await prisma!.offer.create({
      data: {
        productId: realProductId,
        merchantId: realMerchant.id,
        currentPrice: 10,
        productUrl: "https://example.invalid/real",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: false,
      },
    });
    await prisma!.offer.create({
      data: {
        productId: demoProductId,
        merchantId: demoMerchant.id,
        currentPrice: 20,
        productUrl: "https://example.invalid/demo",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: true,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: `${PREFIX}-cat` } });
  });

  it("getActiveProductsWithOffers incluye el producto real y excluye el producto demo", async () => {
    const rows = await getActiveProductsWithOffers(200);
    expect(rows).not.toBeNull();
    expect(rows!.some((p) => p.id === realProductId)).toBe(true);
    expect(rows!.some((p) => p.id === demoProductId)).toBe(false);
  });

  it("getProductBySlug del producto demo no expone ninguna oferta (todas filtradas)", async () => {
    const product = await getProductBySlug(`${PREFIX}-producto-demo`);
    expect(product).toBeDefined();
    expect(product!.offers).toHaveLength(0);
  });

  it("getProductBySlug del producto real expone su oferta real con normalidad", async () => {
    const product = await getProductBySlug(`${PREFIX}-producto-real`);
    expect(product).toBeDefined();
    expect(product!.offers).toHaveLength(1);
  });

  it("searchActiveProducts encuentra el producto real por nombre pero nunca el demo, aunque el nombre coincida", async () => {
    const results = await searchActiveProducts({ query: "únicoXYZ" });
    expect(results).not.toBeNull();
    expect(results!.some((p) => p.id === realProductId)).toBe(true);
    expect(results!.some((p) => p.id === demoProductId)).toBe(false);
  });

  it("una oferta real de un comercio marcado como demo tampoco cuenta como catálogo real", async () => {
    const mismatchedMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-comercio-demo-b`, name: "Comercio demo B", websiteUrl: "https://example.invalid", isDemo: true },
    });
    const product = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto-real-comercio-demo`, name: "Producto real con comercio demo", categoryId, isDemo: false },
    });
    await prisma!.offer.create({
      data: {
        productId: product.id,
        merchantId: mismatchedMerchant.id,
        currentPrice: 5,
        productUrl: "https://example.invalid/mismatch",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: false, // la oferta en sí no es demo...
      },
    });

    const rows = await getActiveProductsWithOffers(200);
    // ...pero como el comercio SÍ es demo, no debe contar como catálogo público real.
    expect(rows!.some((p) => p.id === product.id)).toBe(false);
  });
});
