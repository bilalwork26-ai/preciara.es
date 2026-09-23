import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { demoProducts } from "@/data/demo/products";
import { getCategoryDetail, getCategoriesIndex, getDemoCategoriesWithProductCounts } from "./category";

const PREFIX = "test-category-detail";

describe("getCategoryDetail", () => {
  it("devuelve not-found para un slug que no existe en ningún sitio", async () => {
    const result = await getCategoryDetail("categoria-que-nunca-existe-xyz");
    expect(result.status).toBe("not-found");
  });
});

describe("getCategoriesIndex", () => {
  it("responde siempre con al menos una categoría (BD o demo), nunca lanza", async () => {
    const result = await getCategoriesIndex();
    expect(["database", "demo"]).toContain(result.source);
    expect(Array.isArray(result.categories)).toBe(true);
  });

  it("en modo demo, nunca incluye una categoría sin ningún producto demo (evita enlaces a /categoria/[slug] que darían 404)", async () => {
    const result = await getCategoriesIndex();
    if (result.source === "demo") {
      for (const category of result.categories) {
        expect(category.activeProductCount).toBeGreaterThan(0);
        expect(demoProducts.some((p) => p.categoryId === category.id)).toBe(true);
      }
    }
  });
});

describe("getDemoCategoriesWithProductCounts", () => {
  it("nunca incluye una categoría de demostración sin ningún producto demo asociado", () => {
    const categories = getDemoCategoriesWithProductCounts();
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      expect(category.activeProductCount).toBeGreaterThan(0);
    }
  });

  it("cada categoría devuelta resuelve realmente en getCategoryDetail (nunca un enlace roto)", async () => {
    const categories = getDemoCategoriesWithProductCounts();
    for (const category of categories) {
      const result = await getCategoryDetail(category.slug);
      expect(result.status).toBe("found");
    }
  });

  it("ordena por recuento descendente y, a igualdad, por nombre", () => {
    const categories = getDemoCategoriesWithProductCounts();
    for (let i = 1; i < categories.length; i++) {
      const prev = categories[i - 1];
      const curr = categories[i];
      const countOk = prev.activeProductCount > curr.activeProductCount ||
        (prev.activeProductCount === curr.activeProductCount && prev.name.localeCompare(curr.name, "es") <= 0);
      expect(countOk).toBe(true);
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("getCategoryDetail (integración, BD local de pruebas)", () => {
  let categoryId: number;
  let merchantId: number;

  beforeAll(async () => {
    const merchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-merchant`, name: "Comercio categoría", websiteUrl: "https://example.invalid" },
    });
    merchantId = merchant.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("una categoría real sin ningún producto con oferta activa nunca se sirve desde la BD (not-found o demo, nunca vacía)", async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-vacia`, name: "Categoría vacía" } });
    categoryId = category.id;

    const result = await getCategoryDetail(`${PREFIX}-vacia`);
    expect(result.status).toBe("not-found");
  });

  it("una categoría real con un producto activo y oferta activa se sirve desde la base de datos", async () => {
    const product = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto`, name: "Producto categoría", categoryId },
    });
    await prisma!.offer.create({
      data: {
        productId: product.id,
        merchantId,
        currentPrice: 15,
        productUrl: "https://example.invalid/p",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
      },
    });

    const result = await getCategoryDetail(`${PREFIX}-vacia`);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.source).toBe("database");
      expect(result.products.length).toBe(1);
    }
  });
});
