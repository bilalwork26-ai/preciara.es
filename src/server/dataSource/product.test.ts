import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { getProductDetail } from "./product";

const PREFIX = "test-product-detail";

describe("getProductDetail", () => {
  it("devuelve not-found para un slug que no existe en ningún sitio", async () => {
    const result = await getProductDetail("slug-que-nunca-existe-en-ningun-catalogo-xyz");
    expect(result.status).toBe("not-found");
  });

  it("cae al equivalente de demostración cuando el slug demo existe (BD sin ese producto)", async () => {
    const result = await getProductDetail("auriculares-inalambricos-pro");
    if (result.status === "found" && result.source === "demo") {
      expect(result.product.slug).toBe("auriculares-inalambricos-pro");
      expect(result.product.offers.length).toBeGreaterThan(0);
    } else {
      expect(result.status).toBe("found"); // en un entorno con BD real ya sincronizada, también es válido
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("getProductDetail (integración, BD local de pruebas)", () => {
  let categoryId: number;
  let merchantId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría producto" } });
    categoryId = category.id;
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant`, name: "Comercio producto", websiteUrl: "https://example.invalid" },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("un producto real con oferta activa se sirve desde la base de datos", async () => {
    const product = await prisma!.product.create({
      data: { slug: `${PREFIX}-con-oferta`, name: "Producto con oferta", categoryId },
    });
    await prisma!.offer.create({
      data: {
        productId: product.id,
        merchantId,
        currentPrice: 25,
        productUrl: "https://example.invalid/p",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
      },
    });

    const result = await getProductDetail(`${PREFIX}-con-oferta`);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.source).toBe("database");
      expect(result.product.offers.length).toBe(1);
    }
  });

  it("un producto real sin ninguna oferta activa nunca se sirve (not-found, nunca cae al demo de otro producto)", async () => {
    const product = await prisma!.product.create({
      data: { slug: `${PREFIX}-sin-oferta-activa`, name: "Producto sin oferta activa", categoryId },
    });
    await prisma!.offer.create({
      data: {
        productId: product.id,
        merchantId,
        currentPrice: 25,
        productUrl: "https://example.invalid/p2",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: false,
      },
    });

    const result = await getProductDetail(`${PREFIX}-sin-oferta-activa`);
    expect(result.status).toBe("not-found");
  });
});
