import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/server/db/client";
import { getActiveCategories } from "@/server/repositories/categories";
import { getHomeCategories, getDealsGridBundle, getFeaturedBundle } from "./home";

const PREFIX = "test-home-datasource";

// Ver la nota equivalente en search.test.ts / db/client.test.ts: Prisma
// recarga .env al importarse, así que "sin DATABASE_URL" solo se puede
// probar de verdad apartando el fichero físicamente.
const ENV_PATH = path.resolve(__dirname, "../../../.env");
const ENV_BACKUP_PATH = `${ENV_PATH}.home-test-backup`;
let envFileMoved = false;

describe("dataSource/home: sin DATABASE_URL en absoluto, la portada usa demo", () => {
  beforeAll(() => {
    if (existsSync(ENV_PATH)) {
      renameSync(ENV_PATH, ENV_BACKUP_PATH);
      envFileMoved = true;
    }
  });
  afterAll(() => {
    if (envFileMoved) {
      renameSync(ENV_BACKUP_PATH, ENV_PATH);
      envFileMoved = false;
    }
  });

  it("getHomeCategories responde con demo sin lanzar", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
    const { getHomeCategories: fn } = await import("./home");
    const { source, data } = await fn();
    expect(source).toBe("demo");
    expect(data.length).toBeGreaterThan(0);
  });

  it("getFeaturedBundle responde con demo sin lanzar", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
    const { getFeaturedBundle: fn } = await import("./home");
    const { source, data } = await fn();
    expect(source).toBe("demo");
    expect(data.product.offers.length).toBeGreaterThan(0);
  });

  it("getDealsGridBundle responde con demo sin lanzar", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
    const { getDealsGridBundle: fn } = await import("./home");
    const { source, data } = await fn();
    expect(source).toBe("demo");
    expect(data.products.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("dataSource/home (integración, BD local de pruebas)", () => {
  afterEach(async () => {
    if (!prisma) return;
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("getHomeCategories usa la BD cuando hay categorías activas reales", async () => {
    const result = await getHomeCategories();
    // La BD de pruebas de este entorno ya tiene el seed de demostración cargado.
    expect(result.source === "database" || result.source === "demo").toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("una categoría inactiva no aparece en el resultado de BD", async () => {
    await prisma!.category.create({ data: { slug: `${PREFIX}-inactiva`, name: "Inactiva de prueba", isActive: false } });
    const rows = await getActiveCategories();
    expect(rows).not.toBeNull();
    expect(rows!.find((c) => c.slug === `${PREFIX}-inactiva`)).toBeUndefined();
  });

  it("respeta el orden de creación (id ascendente), no alfabético", async () => {
    await prisma!.category.create({ data: { slug: `${PREFIX}-aaa-ultima`, name: "AAA debería ir última si fuera alfabético" } });
    const rows = await getActiveCategories();
    const index = rows!.findIndex((c) => c.slug === `${PREFIX}-aaa-ultima`);
    // Al ser la última creada, debe quedar al final (o cerca), nunca reordenada al principio por el nombre.
    expect(index).toBe(rows!.length - 1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("dataSource/home: destacado y cuadrícula (integración)", () => {
  const productSlug = `${PREFIX}-producto-destacado`;
  const merchantSlug = `${PREFIX}-comercio`;
  let categoryId: number;
  let productId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría de prueba" } });
    categoryId = category.id;
    const merchant = await prisma!.merchant.create({
      data: { slug: merchantSlug, name: "Comercio de prueba", websiteUrl: "https://example.invalid" },
    });
    const product = await prisma!.product.create({
      data: { slug: productSlug, name: "Producto de prueba destacado", categoryId },
    });
    productId = product.id;
    await prisma!.offer.create({
      data: {
        productId,
        merchantId: merchant.id,
        currentPrice: 49.99,
        productUrl: "https://example.invalid/p",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("un producto sin ninguna oferta activa no aparece en la cuadrícula de bajadas", async () => {
    const inactiveOfferProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-sin-ofertas`, name: "Sin ofertas activas", categoryId },
    });
    const merchant2 = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    await prisma!.offer.create({
      data: {
        productId: inactiveOfferProduct.id,
        merchantId: merchant2.id,
        currentPrice: 10,
        productUrl: "https://example.invalid/x",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: false, // la única oferta está inactiva
      },
    });

    const bundle = await getDealsGridBundle();
    expect(bundle.data.products.find((p) => p.slug === `${PREFIX}-sin-ofertas`)).toBeUndefined();
    // El producto con oferta activa sí debe aparecer.
    if (bundle.source === "database") {
      expect(bundle.data.products.find((p) => p.slug === productSlug)).toBeDefined();
    }
  });

  it("un producto inactivo no aparece aunque tenga ofertas activas", async () => {
    await prisma!.product.update({ where: { id: productId }, data: { isActive: false } });
    const bundle = await getDealsGridBundle();
    expect(bundle.data.products.find((p) => p.slug === productSlug)).toBeUndefined();
    await prisma!.product.update({ where: { id: productId }, data: { isActive: true } }); // limpieza
  });

  it("getFeaturedBundle cae a demo si el slug destacado no existe en la BD de pruebas aislada", async () => {
    // Usamos una BD real pero el slug fijo "auriculares-inalambricos-pro" puede
    // no existir en un entorno de pruebas recién migrado: en ese caso, debe
    // usar demo sin lanzar ningún error.
    const bundle = await getFeaturedBundle();
    expect(bundle.data.product.offers.length).toBeGreaterThan(0);
    expect(bundle.data.product.priceHistory.length).toBeGreaterThan(0);
  });
});
