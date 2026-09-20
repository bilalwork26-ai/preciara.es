import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getStaleOffers } from "./offers";

const PREFIX = "test-stale-offers";

describe.skipIf(!process.env.DATABASE_URL)("getStaleOffers (integración)", () => {
  let freshOfferId: number;
  let staleOfferId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Cat stale" } });
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant`, name: "Merchant stale", websiteUrl: "https://example.invalid" },
    });
    const productFresh = await prisma!.product.create({
      data: { slug: `${PREFIX}-fresh`, name: "Producto fresco", categoryId: category.id },
    });
    const productStale = await prisma!.product.create({
      data: { slug: `${PREFIX}-stale`, name: "Producto viejo", categoryId: category.id },
    });

    const fresh = await prisma!.offer.create({
      data: {
        productId: productFresh.id,
        merchantId: merchant.id,
        currentPrice: 10,
        productUrl: "https://example.invalid/f",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(), // recién revisada
        isActive: true,
      },
    });
    freshOfferId = fresh.id;

    const stale = await prisma!.offer.create({
      data: {
        productId: productStale.id,
        merchantId: merchant.id,
        currentPrice: 20,
        productUrl: "https://example.invalid/s",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(Date.now() - 200 * 3_600_000), // hace 200 horas
        isActive: true,
      },
    });
    staleOfferId = stale.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("identifica como vieja solo la oferta más antigua que el umbral (72h)", async () => {
    const stale = await getStaleOffers(72, 500);
    expect(stale).not.toBeNull();
    const ids = stale!.map((o) => o.id);
    expect(ids).toContain(staleOfferId);
    expect(ids).not.toContain(freshOfferId);
  });

  it("con un umbral mayor que la antigüedad real, ninguna de las dos aparece", async () => {
    const stale = await getStaleOffers(300, 500);
    const ids = stale!.map((o) => o.id);
    expect(ids).not.toContain(staleOfferId);
    expect(ids).not.toContain(freshOfferId);
  });
});
