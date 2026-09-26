import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import sitemap from "./sitemap";

const PREFIX = "test-sitemap";

describe("sitemap", () => {
  it("nunca incluye rutas privadas o de búsqueda interna", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const url of urls) {
      expect(url).not.toMatch(/\/admin/);
      expect(url).not.toMatch(/\/api\//);
      expect(url).not.toMatch(/\/buscar/);
    }
  });

  it("incluye siempre la portada y /categorias", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://preciara.es");
    expect(urls).toContain("https://preciara.es/categorias");
  });

  it("incluye /guias y las tres guías de compra", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://preciara.es/guias");
    expect(urls).toContain("https://preciara.es/guias/como-comparar-precios-online");
    expect(urls).toContain("https://preciara.es/guias/elegir-tecnologia-reacondicionada");
    expect(urls).toContain("https://preciara.es/guias/como-comparar-electrodomesticos");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("sitemap (integración, BD local de pruebas)", () => {
  let categoryId: number;
  let merchantId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría sitemap" } });
    categoryId = category.id;
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant`, name: "Comercio sitemap", websiteUrl: "https://example.invalid" },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("incluye un producto real con oferta activa, y nunca uno sin ofertas activas", async () => {
    const withOffer = await prisma!.product.create({
      data: { slug: `${PREFIX}-con-oferta`, name: "Con oferta", categoryId },
    });
    await prisma!.offer.create({
      data: {
        productId: withOffer.id,
        merchantId,
        currentPrice: 10,
        productUrl: "https://example.invalid/p",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
      },
    });
    const withoutOffer = await prisma!.product.create({
      data: { slug: `${PREFIX}-sin-oferta`, name: "Sin oferta", categoryId },
    });
    await prisma!.offer.create({
      data: {
        productId: withoutOffer.id,
        merchantId,
        currentPrice: 10,
        productUrl: "https://example.invalid/p2",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: false,
      },
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`https://preciara.es/producto/${PREFIX}-con-oferta`);
    expect(urls).not.toContain(`https://preciara.es/producto/${PREFIX}-sin-oferta`);
    expect(urls).toContain(`https://preciara.es/categoria/${PREFIX}-cat`);
  });

  it("nunca incluye un producto o comercio de demostración", async () => {
    const demoMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-demo-merchant`, name: "Comercio demo", websiteUrl: "https://example.invalid", isDemo: true },
    });
    const demoProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-demo-producto`, name: "Producto demo", categoryId, isDemo: true },
    });
    await prisma!.offer.create({
      data: {
        productId: demoProduct.id,
        merchantId: demoMerchant.id,
        currentPrice: 5,
        productUrl: "https://example.invalid/demo",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: true,
      },
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).not.toContain(`https://preciara.es/producto/${PREFIX}-demo-producto`);

    await prisma!.merchant.deleteMany({ where: { slug: `${PREFIX}-demo-merchant` } });
  });
});
