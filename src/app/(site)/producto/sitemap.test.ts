import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { PRODUCT_SITEMAP_CHUNK_SIZE } from "@/lib/seo";
import sitemap, { generateSitemaps } from "./sitemap";

const PREFIX = "test-producto-sitemap";

describe("producto/sitemap: generateSitemaps sin BD (o BD vacía de productos indexables)", () => {
  it("devuelve siempre al menos una página (nunca cero, un sitemap vacío sigue siendo válido)", async () => {
    const ids = await generateSitemaps();
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("producto/sitemap (integración, BD local de pruebas)", () => {
  let categoryId: number;
  let merchantId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría sitemap producto" } });
    categoryId = category.id;
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant`, name: "Comercio sitemap producto", websiteUrl: "https://example.invalid" },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("incluye un producto real con oferta activa, y nunca uno sin ofertas activas, en la página 0", async () => {
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

    const entries = await sitemap({ id: Promise.resolve("0") });
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`https://preciara.es/producto/${PREFIX}-con-oferta`);
    expect(urls).not.toContain(`https://preciara.es/producto/${PREFIX}-sin-oferta`);
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

    const entries = await sitemap({ id: Promise.resolve("0") });
    const urls = entries.map((e) => e.url);
    expect(urls).not.toContain(`https://preciara.es/producto/${PREFIX}-demo-producto`);

    await prisma!.merchant.deleteMany({ where: { slug: `${PREFIX}-demo-merchant` } });
  });

  it("generateSitemaps calcula el nº de páginas a partir del recuento real de productos indexables (CHUNK_SIZE por página)", async () => {
    // Nº de productos conocido y controlado: exactamente uno (el de más
    // arriba) más dos nuevos aquí — no se asume nada sobre el resto de la
    // BD de pruebas, solo que generateSitemaps nunca devuelve menos
    // páginas de las que hacen falta para cubrir TODOS los indexables.
    const totalIndexable = await prisma!.product.count({
      where: {
        isActive: true,
        isDemo: false,
        offers: { some: { isActive: true, isDemo: false, merchant: { isActive: true, isDemo: false } } },
      },
    });
    const ids = await generateSitemaps();
    const expectedMinPages = Math.max(1, Math.ceil(totalIndexable / PRODUCT_SITEMAP_CHUNK_SIZE));
    expect(ids.length).toBeGreaterThanOrEqual(expectedMinPages);
  });
});
