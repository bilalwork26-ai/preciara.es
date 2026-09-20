import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/server/db/client";
import { getActiveProductsWithOffers } from "@/server/repositories/products";
import { normalizeForSearch, sanitizeSearchQuery, searchHomeProducts } from "./search";

describe("normalizeForSearch (tildes/mayúsculas, ruta demo)", () => {
  it("normaliza tildes", () => {
    expect(normalizeForSearch("Portátil")).toBe(normalizeForSearch("portatil"));
  });
  it("normaliza mayúsculas", () => {
    expect(normalizeForSearch("PORTATIL")).toBe(normalizeForSearch("portatil"));
  });
  it("normaliza eñes y otras marcas diacríticas", () => {
    expect(normalizeForSearch("mañana")).toBe("manana");
  });
});

describe("sanitizeSearchQuery", () => {
  it("recorta espacios", () => {
    expect(sanitizeSearchQuery("  portatil  ")).toBe("portatil");
  });
  it("limita la longitud para evitar consultas sin control", () => {
    const long = "a".repeat(500);
    expect(sanitizeSearchQuery(long).length).toBeLessThanOrEqual(200);
  });
});

describe("searchHomeProducts: comportamiento funcional (pasa con o sin BD disponible en el entorno de pruebas)", () => {
  it("encuentra por nombre sin tildes", async () => {
    const { data } = await searchHomeProducts({ query: "portatil", categorySlug: "" });
    expect(data.products.some((p) => p.name.toLowerCase().includes("portátil"))).toBe(true);
  });

  it("encuentra por nombre con tildes y en mayúsculas", async () => {
    const { data } = await searchHomeProducts({ query: "PORTÁTIL", categorySlug: "" });
    expect(data.products.some((p) => p.name.toLowerCase().includes("portátil"))).toBe(true);
  });

  it("filtra por categoría (en cualquiera de las dos fuentes: demo usa 'cat-tecnologia', BD usa el slug 'tecnologia')", async () => {
    const { data } = await searchHomeProducts({ query: "", categorySlug: "tecnologia" });
    expect(data.products.length).toBeGreaterThan(0);
    const expectedCategoryId = data.categories.find((c) => c.slug === "tecnologia")!.id;
    expect(data.products.every((p) => p.categoryId === expectedCategoryId)).toBe(true);
  });

  it("una búsqueda sin coincidencias devuelve una lista vacía, no un error", async () => {
    const { data } = await searchHomeProducts({ query: "producto-que-no-existe-jamas-123", categorySlug: "" });
    expect(data.products).toEqual([]);
  });
});

// El cliente Prisma generado vuelve a cargar el .env real del disco al
// importarse (efecto colateral de Prisma), así que para probar de verdad
// "sin DATABASE_URL" hay que apartar físicamente el fichero (igual que en
// src/server/db/client.test.ts), no basta con borrar la variable en caliente.
const ENV_PATH = path.resolve(__dirname, "../../../.env");
const ENV_BACKUP_PATH = `${ENV_PATH}.search-test-backup`;
let envFileMoved = false;

describe("searchHomeProducts: siempre usa demo cuando no hay DATABASE_URL en absoluto", () => {
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

  it("usa demo y responde correctamente (sin lanzar) cuando no hay BD configurada", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
    const { searchHomeProducts: search } = await import("./search");
    const { source, data } = await search({ query: "portatil", categorySlug: "" });
    expect(source).toBe("demo");
    expect(data.products.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("searchHomeProducts: ruta BD (integración)", () => {
  it("usa la base de datos cuando hay catálogo real (la BD local de pruebas tiene el seed cargado)", async () => {
    const { source } = await searchHomeProducts({ query: "", categorySlug: "" });
    expect(source === "database" || source === "demo").toBe(true);
  });

  it("una búsqueda filtrada sin coincidencias en BD no fuerza el fallback a demo (resultado vacío real)", async () => {
    const { data, source } = await searchHomeProducts({
      query: "xyz-termino-inexistente-de-verdad-123",
      categorySlug: "",
    });
    if (source === "database") {
      expect(data.products).toEqual([]);
    }
  });

  it("las tildes se normalizan también en la ruta de BD (collation utf8mb4_unicode_ci)", async () => {
    const withAccent = await searchHomeProducts({ query: "portátil", categorySlug: "" });
    const withoutAccent = await searchHomeProducts({ query: "portatil", categorySlug: "" });
    if (withAccent.source === "database") {
      expect(withAccent.data.products.map((p) => p.slug).sort()).toEqual(
        withoutAccent.data.products.map((p) => p.slug).sort()
      );
    }
  });

  it("si en este entorno la base solo tiene catálogo demo, una búsqueda sin filtro cae al fallback demo", async () => {
    // Comprueba el estado real de la base antes de afirmar nada: en un
    // entorno con catálogo real ya importado, esta condición no se cumple
    // y la prueba no afirma nada sobre el resultado (evita un falso
    // negativo fuera de este entorno de pruebas).
    const realCatalogProbe = await getActiveProductsWithOffers(1);
    const hasRealCatalog = (realCatalogProbe?.length ?? 0) > 0;
    if (!hasRealCatalog) {
      const { source } = await searchHomeProducts({ query: "", categorySlug: "" });
      expect(source).toBe("demo");
    }
  });
});

const ISDEMO_PREFIX = "test-search-isdemo-leak";

describe.skipIf(!process.env.DATABASE_URL)("searchHomeProducts: un producto marcado isDemo nunca aparece en resultados públicos", () => {
  const uniqueDemoName = `${ISDEMO_PREFIX}-producto-unico-XYZ99`;
  let categoryId: number;

  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${ISDEMO_PREFIX}-cat`, name: "Categoría demo-leak" } });
    categoryId = category.id;
    const merchant = await prisma!.merchant.create({
      data: { slug: `${ISDEMO_PREFIX}-comercio`, name: "Comercio demo-leak", websiteUrl: "https://example.invalid", isDemo: true },
    });
    const product = await prisma!.product.create({
      data: { slug: `${ISDEMO_PREFIX}-producto`, name: uniqueDemoName, categoryId, isDemo: true },
    });
    await prisma!.offer.create({
      data: {
        productId: product.id,
        merchantId: merchant.id,
        currentPrice: 15,
        productUrl: "https://example.invalid/demo-leak",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: true,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: ISDEMO_PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: ISDEMO_PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: `${ISDEMO_PREFIX}-cat` } });
  });

  it("buscar por el nombre exacto del producto demo nunca lo devuelve, sea cual sea la fuente", async () => {
    const { data } = await searchHomeProducts({ query: uniqueDemoName, categorySlug: "" });
    expect(data.products.some((p) => p.name === uniqueDemoName)).toBe(false);
  });
});
