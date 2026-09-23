import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getActiveCategoriesWithOfferCounts } from "./categories";

const PREFIX = "test-cat-counts";

describe.skipIf(!process.env.DATABASE_URL)("getActiveCategoriesWithOfferCounts", () => {
  let categoryWithOffersId: number;
  let categoryEmptyId: number;
  let categoryOnlyInactiveId: number;
  let merchantId: number;

  beforeAll(async () => {
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant`, name: "Comercio de prueba", websiteUrl: "https://example.invalid" },
    });
    merchantId = merchant.id;

    const categoryWithOffers = await prisma!.category.create({ data: { slug: `${PREFIX}-con-ofertas`, name: "Con ofertas" } });
    categoryWithOffersId = categoryWithOffers.id;
    const categoryEmpty = await prisma!.category.create({ data: { slug: `${PREFIX}-vacia`, name: "Vacía" } });
    categoryEmptyId = categoryEmpty.id;
    const categoryOnlyInactive = await prisma!.category.create({ data: { slug: `${PREFIX}-solo-inactivas`, name: "Solo inactivas" } });
    categoryOnlyInactiveId = categoryOnlyInactive.id;

    // Dos productos activos con ofertas activas -> activeProductCount = 2.
    for (const suffix of ["a", "b"]) {
      const product = await prisma!.product.create({
        data: { slug: `${PREFIX}-producto-${suffix}`, name: `Producto ${suffix}`, categoryId: categoryWithOffersId },
      });
      await prisma!.offer.create({
        data: {
          productId: product.id,
          merchantId,
          currentPrice: 10,
          productUrl: "https://example.invalid/p",
          availability: "IN_STOCK",
          lastCheckedAt: new Date(),
          isActive: true,
        },
      });
    }

    // Producto con únicamente una oferta INACTIVA: la categoría no debe contarlo ni aparecer.
    const inactiveOfferProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto-oferta-inactiva`, name: "Producto oferta inactiva", categoryId: categoryOnlyInactiveId },
    });
    await prisma!.offer.create({
      data: {
        productId: inactiveOfferProduct.id,
        merchantId,
        currentPrice: 10,
        productUrl: "https://example.invalid/p2",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: false,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("incluye solo categorías con al menos un producto con oferta activa, con el recuento correcto", async () => {
    const rows = await getActiveCategoriesWithOfferCounts();
    expect(rows).not.toBeNull();
    const mine = rows!.find((r) => r.id === categoryWithOffersId);
    expect(mine).toMatchObject({ slug: `${PREFIX}-con-ofertas`, activeProductCount: 2 });
  });

  it("nunca incluye una categoría sin ningún producto", async () => {
    const rows = await getActiveCategoriesWithOfferCounts();
    expect(rows!.find((r) => r.id === categoryEmptyId)).toBeUndefined();
  });

  it("nunca incluye una categoría cuyo único producto solo tiene ofertas inactivas", async () => {
    const rows = await getActiveCategoriesWithOfferCounts();
    expect(rows!.find((r) => r.id === categoryOnlyInactiveId)).toBeUndefined();
  });

  it("ordena por activeProductCount descendente y, a igualdad, por nombre", async () => {
    const catB = await prisma!.category.create({ data: { slug: `${PREFIX}-empate-b`, name: "Zeta empate" } });
    const catA = await prisma!.category.create({ data: { slug: `${PREFIX}-empate-a`, name: "Alfa empate" } });
    for (const cat of [catB, catA]) {
      const product = await prisma!.product.create({
        data: { slug: `${PREFIX}-empate-producto-${cat.id}`, name: `Producto empate ${cat.id}`, categoryId: cat.id },
      });
      await prisma!.offer.create({
        data: {
          productId: product.id,
          merchantId,
          currentPrice: 5,
          productUrl: "https://example.invalid/empate",
          availability: "IN_STOCK",
          lastCheckedAt: new Date(),
          isActive: true,
        },
      });
    }

    const rows = await getActiveCategoriesWithOfferCounts();
    const indexA = rows!.findIndex((r) => r.id === catA.id);
    const indexB = rows!.findIndex((r) => r.id === catB.id);
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThanOrEqual(0);
    // Mismo activeProductCount (1) en ambas -> "Alfa empate" antes que "Zeta empate".
    expect(indexA).toBeLessThan(indexB);

    // La categoría con 2 productos activos debe ir antes que las de 1 (orden por recuento, no solo nombre).
    const indexConOfertas = rows!.findIndex((r) => r.id === categoryWithOffersId);
    expect(indexConOfertas).toBeLessThan(indexA);

    await prisma!.product.deleteMany({ where: { slug: { startsWith: `${PREFIX}-empate-producto` } } });
    await prisma!.category.deleteMany({ where: { slug: { startsWith: `${PREFIX}-empate` } } });
  });

  it("un producto o comercio de demostración nunca cuenta para el recuento", async () => {
    const demoMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-comercio-demo`, name: "Comercio demo", websiteUrl: "https://example.invalid", isDemo: true },
    });
    const demoProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto-demo`, name: "Producto demo", categoryId: categoryEmptyId, isDemo: true },
    });
    await prisma!.offer.create({
      data: {
        productId: demoProduct.id,
        merchantId: demoMerchant.id,
        currentPrice: 1,
        productUrl: "https://example.invalid/demo",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: true,
      },
    });

    const rows = await getActiveCategoriesWithOfferCounts();
    expect(rows!.find((r) => r.id === categoryEmptyId)).toBeUndefined();

    await prisma!.merchant.deleteMany({ where: { slug: `${PREFIX}-comercio-demo` } });
  });
});
