import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { deactivateStaleOffers, deactivateStaleOffersForSource } from "./staleOffers";

const PREFIX = "test-stale-offers-scoped";

describe.skipIf(!process.env.DATABASE_URL)("deactivateStaleOffersForSource (integración)", () => {
  let categoryId: number;
  let merchantAwinId: number;
  let merchantEbayId: number;
  let staleAwinOfferId: number;
  let staleEbayOfferId: number;
  let staleCsvOfferId: number;
  let freshAwinOfferId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Cat stale scoped" } });
    categoryId = category.id;

    const merchantAwin = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant-awin`, name: "Merchant Awin", websiteUrl: "https://example.invalid" },
    });
    merchantAwinId = merchantAwin.id;
    const merchantEbay = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant-ebay`, name: "Merchant eBay", websiteUrl: "https://example.invalid" },
    });
    merchantEbayId = merchantEbay.id;
    const merchantCsv = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant-csv`, name: "Merchant CSV", websiteUrl: "https://example.invalid" },
    });

    const oldDate = new Date(Date.now() - 200 * 3_600_000);
    const freshDate = new Date();

    async function makeOffer(merchantId: number, source: "AWIN" | "EBAY" | "CSV", externalId: string, lastCheckedAt: Date) {
      const product = await prisma!.product.create({
        data: { slug: `${PREFIX}-${source.toLowerCase()}-${externalId}`, name: `Producto ${externalId}`, categoryId },
      });
      const offer = await prisma!.offer.create({
        data: {
          productId: product.id,
          merchantId,
          source,
          externalId,
          currentPrice: 10,
          productUrl: "https://example.invalid/p",
          availability: "IN_STOCK",
          lastCheckedAt,
          isActive: true,
        },
      });
      return offer.id;
    }

    staleAwinOfferId = await makeOffer(merchantAwinId, "AWIN", "awin-stale-1", oldDate);
    freshAwinOfferId = await makeOffer(merchantAwinId, "AWIN", "awin-fresh-1", freshDate);
    staleEbayOfferId = await makeOffer(merchantEbayId, "EBAY", "ebay-stale-1", oldDate);
    staleCsvOfferId = await makeOffer(merchantCsv.id, "CSV", "csv-stale-1", oldDate);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: `${PREFIX}-cat` } });
  });

  it("desactiva solo las ofertas viejas de la fuente indicada, nunca las de otras fuentes", async () => {
    const { deactivated } = await deactivateStaleOffersForSource({ source: "AWIN", merchantIds: [merchantAwinId], olderThanHours: 72 });
    expect(deactivated).toBe(1);

    const awinStale = await prisma!.offer.findUniqueOrThrow({ where: { id: staleAwinOfferId } });
    const awinFresh = await prisma!.offer.findUniqueOrThrow({ where: { id: freshAwinOfferId } });
    const ebayStale = await prisma!.offer.findUniqueOrThrow({ where: { id: staleEbayOfferId } });
    const csvStale = await prisma!.offer.findUniqueOrThrow({ where: { id: staleCsvOfferId } });

    expect(awinStale.isActive).toBe(false); // vieja, de AWIN: desactivada
    expect(awinFresh.isActive).toBe(true); // reciente: intacta
    expect(ebayStale.isActive).toBe(true); // vieja, pero de OTRA fuente: intacta
    expect(csvStale.isActive).toBe(true); // vieja, pero de OTRA fuente: intacta
  });

  it("desactiva las ofertas viejas de eBay sin tocar las ya desactivadas ni las de otras fuentes", async () => {
    const { deactivated } = await deactivateStaleOffersForSource({ source: "EBAY", merchantIds: [merchantEbayId], olderThanHours: 72 });
    expect(deactivated).toBe(1);
    const ebayStale = await prisma!.offer.findUniqueOrThrow({ where: { id: staleEbayOfferId } });
    expect(ebayStale.isActive).toBe(false);

    const csvStale = await prisma!.offer.findUniqueOrThrow({ where: { id: staleCsvOfferId } });
    expect(csvStale.isActive).toBe(true); // el CSV histórico sigue intacto
  });

  it("deactivateStaleOffers (compatibilidad CLI histórica) equivale a acotar por source=CSV", async () => {
    const { deactivated } = await deactivateStaleOffers(72);
    expect(deactivated).toBeGreaterThanOrEqual(1);
    const csvStale = await prisma!.offer.findUniqueOrThrow({ where: { id: staleCsvOfferId } });
    expect(csvStale.isActive).toBe(false); // ahora sí, era de CSV
  });
});
