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

describe.skipIf(!process.env.DATABASE_URL)("repositorios de productos: orden global de 'mejores chollos primero'", () => {
  const RANK_PREFIX = "test-products-repo-rank";
  let categoryId: number;
  let merchantId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${RANK_PREFIX}-cat`, name: "Categoría de ranking" } });
    categoryId = category.id;
    const merchant = await prisma!.merchant.create({
      data: { slug: `${RANK_PREFIX}-comercio`, name: "Comercio de ranking", websiteUrl: "https://example.invalid", isDemo: false },
    });
    merchantId = merchant.id;

    // Cuatro productos que cubren las 3 prioridades a la vez:
    //   1. "Descuento grande" (50%, antiguo) — debe ir primero: tiene
    //      descuento y es el mayor de los dos que lo tienen.
    //   2. "Descuento pequeño" (10%, MUY reciente) — segundo: SÍ tiene
    //      descuento, pero uno menor que el anterior; su fecha reciente
    //      nunca debe hacer que adelante a un descuento mayor (prioridad 2
    //      antes que prioridad 3).
    //   3. "Sin descuento reciente" (0%, reciente) — tercero: sin
    //      descuento, pero por delante del siguiente por fecha.
    //   4. "Sin descuento antiguo" (0%, antiguo) — último.
    const [big, small, recentNoDiscount, oldNoDiscount] = await Promise.all([
      prisma!.product.create({
        data: { slug: `${RANK_PREFIX}-descuento-grande`, name: "Descuento grande", categoryId, isDemo: false, updatedAt: new Date("2020-01-01T00:00:00Z") },
      }),
      prisma!.product.create({
        data: { slug: `${RANK_PREFIX}-descuento-pequeno`, name: "Descuento pequeño", categoryId, isDemo: false, updatedAt: new Date("2026-01-01T00:00:00Z") },
      }),
      prisma!.product.create({
        data: { slug: `${RANK_PREFIX}-sin-descuento-reciente`, name: "Sin descuento reciente", categoryId, isDemo: false, updatedAt: new Date("2025-06-01T00:00:00Z") },
      }),
      prisma!.product.create({
        data: { slug: `${RANK_PREFIX}-sin-descuento-antiguo`, name: "Sin descuento antiguo", categoryId, isDemo: false, updatedAt: new Date("2019-01-01T00:00:00Z") },
      }),
    ]);

    await Promise.all([
      prisma!.offer.create({
        data: { productId: big.id, merchantId, currentPrice: 50, previousPrice: 100, productUrl: "https://example.invalid/1", availability: "IN_STOCK", lastCheckedAt: new Date(), isActive: true, isDemo: false },
      }),
      prisma!.offer.create({
        data: { productId: small.id, merchantId, currentPrice: 90, previousPrice: 100, productUrl: "https://example.invalid/2", availability: "IN_STOCK", lastCheckedAt: new Date(), isActive: true, isDemo: false },
      }),
      prisma!.offer.create({
        data: { productId: recentNoDiscount.id, merchantId, currentPrice: 30, previousPrice: null, productUrl: "https://example.invalid/3", availability: "IN_STOCK", lastCheckedAt: new Date(), isActive: true, isDemo: false },
      }),
      prisma!.offer.create({
        data: { productId: oldNoDiscount.id, merchantId, currentPrice: 20, previousPrice: null, productUrl: "https://example.invalid/4", availability: "IN_STOCK", lastCheckedAt: new Date(), isActive: true, isDemo: false },
      }),
    ]);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: RANK_PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: `${RANK_PREFIX}-comercio` } });
    await prisma.category.deleteMany({ where: { slug: `${RANK_PREFIX}-cat` } });
  });

  it("getActiveProductsWithOffers ordena: descuento activo > mayor %, luego sin descuento > más reciente", async () => {
    const rows = await getActiveProductsWithOffers(200);
    expect(rows).not.toBeNull();
    const names = rows!.filter((p) => p.slug.startsWith(RANK_PREFIX)).map((p) => p.name);
    expect(names).toEqual(["Descuento grande", "Descuento pequeño", "Sin descuento reciente", "Sin descuento antiguo"]);
  });

  it("searchActiveProducts filtrado por categoría respeta el mismo orden", async () => {
    const rows = await searchActiveProducts({ categorySlug: `${RANK_PREFIX}-cat`, limit: 200 });
    expect(rows).not.toBeNull();
    expect(rows!.map((p) => p.name)).toEqual([
      "Descuento grande",
      "Descuento pequeño",
      "Sin descuento reciente",
      "Sin descuento antiguo",
    ]);
  });

  it("por defecto (requireActiveOffer: true, el de siempre), un producto sin ninguna oferta activa NUNCA aparece", async () => {
    const product = await prisma!.product.create({
      data: { slug: `${RANK_PREFIX}-sin-ninguna-oferta`, name: "Producto sin ninguna oferta", categoryId, isDemo: false },
    });
    const rows = await searchActiveProducts({ categorySlug: `${RANK_PREFIX}-cat`, limit: 200 });
    expect(rows).not.toBeNull();
    expect(rows!.some((p) => p.id === product.id)).toBe(false);
  });

  it("con requireActiveOffer: false (catálogo completo de /categoria/[slug]), un producto sin ninguna oferta SÍ aparece, con offers: []", async () => {
    const product = await prisma!.product.create({
      data: { slug: `${RANK_PREFIX}-catalogo-completo`, name: "Producto solo en el catálogo completo", categoryId, isDemo: false },
    });
    const rows = await searchActiveProducts({ categorySlug: `${RANK_PREFIX}-cat`, limit: 200, requireActiveOffer: false });
    expect(rows).not.toBeNull();
    const found = rows!.find((p) => p.id === product.id);
    expect(found).toBeDefined();
    expect(found!.offers).toEqual([]);
  });

  it("con requireActiveOffer: false, los productos CON descuento siguen ordenados primero que los que no tienen ninguna oferta", async () => {
    const noOffer = await prisma!.product.create({
      data: { slug: `${RANK_PREFIX}-orden-sin-oferta`, name: "Orden sin oferta", categoryId, isDemo: false, updatedAt: new Date("2026-06-01T00:00:00Z") },
    });
    const rows = await searchActiveProducts({ categorySlug: `${RANK_PREFIX}-cat`, limit: 200, requireActiveOffer: false });
    expect(rows).not.toBeNull();
    const names = rows!.filter((p) => p.slug.startsWith(RANK_PREFIX) && p.slug !== noOffer.slug).map((p) => p.name);
    const noOfferIndex = rows!.findIndex((p) => p.id === noOffer.id);
    const bigDiscountIndex = rows!.findIndex((p) => p.name === "Descuento grande");
    expect(bigDiscountIndex).toBeLessThan(noOfferIndex);
    expect(names).toContain("Descuento grande");
  });

  it("un producto con varias ofertas usa la de MAYOR descuento entre todas para el ranking", async () => {
    const product = await prisma!.product.create({
      data: { slug: `${RANK_PREFIX}-multi-oferta`, name: "Multi oferta", categoryId, isDemo: false, updatedAt: new Date("2018-01-01T00:00:00Z") },
    });
    // Una oferta sin descuento y otra con un 80% real: el ranking debe
    // usar el 80%, no quedarse con la primera fila que encuentre el JOIN.
    await prisma!.offer.create({
      data: { productId: product.id, merchantId, currentPrice: 95, previousPrice: null, productUrl: "https://example.invalid/5a", availability: "IN_STOCK", lastCheckedAt: new Date(), isActive: true, isDemo: false },
    });
    await prisma!.offer.create({
      data: { productId: product.id, merchantId, currentPrice: 20, previousPrice: 100, productUrl: "https://example.invalid/5b", availability: "IN_STOCK", lastCheckedAt: new Date(), isActive: true, isDemo: false },
    });

    const rows = await getActiveProductsWithOffers(200);
    const names = rows!.filter((p) => p.slug.startsWith(RANK_PREFIX)).map((p) => p.name);
    // 80% de descuento: por delante de "Descuento grande" (50%).
    expect(names[0]).toBe("Multi oferta");
  });
});
