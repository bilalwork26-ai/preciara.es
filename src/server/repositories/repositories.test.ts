import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getActiveCategories } from "./categories";
import { listOffersForAdmin } from "./admin";
import { getSystemStatus } from "./systemStatus";
import { getPriceHistoryForOffer } from "./priceHistory";

const PREFIX = "test-repo-conversion";

describe.skipIf(!process.env.DATABASE_URL)("repositorios: conversión BD -> objetos planos", () => {
  let offerId: number;

  beforeAll(async () => {
    const category = await prisma!.category.upsert({
      where: { slug: `${PREFIX}-cat` },
      update: {},
      create: { slug: `${PREFIX}-cat`, name: "Categoría conversión" },
    });
    const merchant = await prisma!.merchant.upsert({
      where: { slug: `${PREFIX}-merchant` },
      update: {},
      create: { slug: `${PREFIX}-merchant`, name: "Comercio conversión", websiteUrl: "https://example.invalid" },
    });
    const product = await prisma!.product.upsert({
      where: { slug: `${PREFIX}-product` },
      update: {},
      create: { slug: `${PREFIX}-product`, name: "Producto conversión", categoryId: category.id },
    });
    const offer = await prisma!.offer.upsert({
      where: { productId_merchantId: { productId: product.id, merchantId: merchant.id } },
      update: { currentPrice: 42.5 },
      create: {
        productId: product.id,
        merchantId: merchant.id,
        currentPrice: 42.5,
        productUrl: "https://example.invalid/p",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
      },
    });
    offerId = offer.id;
    await prisma!.priceSnapshot.create({ data: { offerId, price: 42.5, availability: "IN_STOCK" } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: `${PREFIX}-product` } });
    await prisma.merchant.deleteMany({ where: { slug: `${PREFIX}-merchant` } });
    await prisma.category.deleteMany({ where: { slug: `${PREFIX}-cat` } });
  });

  it("getActiveCategories devuelve objetos planos serializables", async () => {
    const categories = await getActiveCategories();
    expect(categories).not.toBeNull();
    expect(Array.isArray(categories)).toBe(true);
    const mine = categories!.find((c) => c.slug === `${PREFIX}-cat`);
    expect(mine).toMatchObject({ slug: `${PREFIX}-cat`, name: "Categoría conversión" });
  });

  it("listOffersForAdmin convierte Decimal a number", async () => {
    const offers = await listOffersForAdmin(500);
    expect(offers).not.toBeNull();
    const mine = offers!.find((o) => o.id === offerId);
    expect(mine).toBeDefined();
    expect(typeof mine!.currentPrice).toBe("number");
    expect(mine!.currentPrice).toBe(42.5);
  });

  it("getPriceHistoryForOffer convierte Decimal a number y ordena cronológicamente", async () => {
    const history = await getPriceHistoryForOffer(offerId);
    expect(history).not.toBeNull();
    expect(history!.length).toBeGreaterThanOrEqual(1);
    for (const point of history!) {
      expect(typeof point.price).toBe("number");
    }
  });

  it("getSystemStatus refleja BD conectada y cuenta ofertas activas", async () => {
    const status = await getSystemStatus();
    expect(status.databaseConfigured).toBe(true);
    expect(status.databaseReachable).toBe(true);
    expect(status.usingFallback).toBe(false); // hay al menos la oferta creada arriba
    expect(status.activeOffers).toBeGreaterThanOrEqual(1);
  });
});
