import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";

const PREFIX = "test-migration-catalog-sync-core";

describe.skipIf(!process.env.DATABASE_URL)("migración catalog_sync_core: restricciones aplicadas de verdad en MySQL", () => {
  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { category: { slug: { startsWith: PREFIX } } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("permite varias ofertas para el mismo (producto, comercio) cuando el externalId es distinto", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-multi`, name: "Cat" } });
    const merchant = await prisma!.merchant.create({ data: { slug: `${PREFIX}-merchant-multi`, name: "M", websiteUrl: "https://example.invalid" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-multi`, name: "P", categoryId: category.id } });

    await prisma!.offer.create({
      data: { productId: product.id, merchantId: merchant.id, source: OfferSource.EBAY, externalId: "listing-1", currentPrice: 10, productUrl: "https://example.invalid/1", availability: "IN_STOCK", lastCheckedAt: new Date() },
    });
    await prisma!.offer.create({
      data: { productId: product.id, merchantId: merchant.id, source: OfferSource.EBAY, externalId: "listing-2", currentPrice: 12, productUrl: "https://example.invalid/2", availability: "IN_STOCK", lastCheckedAt: new Date() },
    });

    const offers = await prisma!.offer.findMany({ where: { productId: product.id, merchantId: merchant.id } });
    expect(offers).toHaveLength(2);
  });

  it("rechaza una fila (source, merchant, externalId) duplicada exacta", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-dup`, name: "Cat" } });
    const merchant = await prisma!.merchant.create({ data: { slug: `${PREFIX}-merchant-dup`, name: "M", websiteUrl: "https://example.invalid" } });
    const productA = await prisma!.product.create({ data: { slug: `${PREFIX}-product-dup-a`, name: "PA", categoryId: category.id } });
    const productB = await prisma!.product.create({ data: { slug: `${PREFIX}-product-dup-b`, name: "PB", categoryId: category.id } });

    await prisma!.offer.create({
      data: { productId: productA.id, merchantId: merchant.id, source: OfferSource.AWIN, externalId: "dup-1", currentPrice: 10, productUrl: "https://example.invalid/1", availability: "IN_STOCK", lastCheckedAt: new Date() },
    });

    await expect(
      prisma!.offer.create({
        data: { productId: productB.id, merchantId: merchant.id, source: OfferSource.AWIN, externalId: "dup-1", currentPrice: 20, productUrl: "https://example.invalid/2", availability: "IN_STOCK", lastCheckedAt: new Date() },
      })
    ).rejects.toThrow();
  });

  it("las filas del importador CSV histórico (source=CSV por defecto) siguen funcionando sin declarar source explícitamente", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-csv`, name: "Cat" } });
    const merchant = await prisma!.merchant.create({ data: { slug: `${PREFIX}-merchant-csv`, name: "M", websiteUrl: "https://example.invalid" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-csv`, name: "P", categoryId: category.id } });

    const offer = await prisma!.offer.create({
      data: { productId: product.id, merchantId: merchant.id, currentPrice: 10, productUrl: "https://example.invalid/1", availability: "IN_STOCK", lastCheckedAt: new Date() },
    });
    expect(offer.source).toBe(OfferSource.CSV);
  });

  it("products.metadataSource es null por defecto (compatibilidad con productos ya existentes)", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat-meta`, name: "Cat" } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-product-meta`, name: "P", categoryId: category.id } });
    expect(product.metadataSource).toBeNull();
  });
});
