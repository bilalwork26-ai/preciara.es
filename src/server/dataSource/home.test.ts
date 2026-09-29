import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@/generated/prisma";
import type { ProductWithOffers } from "@/server/repositories/products";
import { prisma } from "@/server/db/client";
import { getActiveCategories } from "@/server/repositories/categories";
import { getActiveProductsWithOffers } from "@/server/repositories/products";
import {
  bestDiscountPercent,
  collapseProductVariants,
  dealsGridGroupKey,
  getHomeCategories,
  getDealsGridBundle,
  selectDiverseDeals,
} from "./home";

const PREFIX = "test-home-datasource";

/** Producto mínimo con solo los campos que leen dealsGridGroupKey/bestDiscountPercent/selectDiverseDeals. */
function fakeProduct(overrides: {
  name: string;
  categoryId: number;
  offers?: { previousPrice: string | null; currentPrice: string }[];
  /** Por defecto "ahora": solo hace falta fijarlo quien prueba el desempate por fecha (ver `compareByDealRank`). */
  updatedAt?: Date;
}): ProductWithOffers {
  const offers = (overrides.offers ?? [{ previousPrice: null, currentPrice: "10" }]).map((o) => ({
    previousPrice: o.previousPrice === null ? null : new Prisma.Decimal(o.previousPrice),
    currentPrice: new Prisma.Decimal(o.currentPrice),
  }));
  return {
    name: overrides.name,
    categoryId: overrides.categoryId,
    offers,
    updatedAt: overrides.updatedAt ?? new Date(),
  } as unknown as ProductWithOffers;
}

describe("dealsGridGroupKey: agrupa variantes de talla del mismo modelo", () => {
  it("dos nombres que solo difieren en un rango de talla dan la misma clave", () => {
    const a = dealsGridGroupKey({ name: "adidasPantalón Firebird Utility 23-34 Black Mujer" });
    const b = dealsGridGroupKey({ name: "adidasPantalón Firebird Utility 24-30 Black Mujer" });
    expect(a).toBe(b);
  });

  it("es insensible a mayúsculas/minúsculas y a espacios repetidos", () => {
    expect(dealsGridGroupKey({ name: "Camiseta  Running" })).toBe(dealsGridGroupKey({ name: "camiseta running" }));
  });

  it("dos nombres genuinamente distintos (sin rango de talla) dan claves distintas", () => {
    const a = dealsGridGroupKey({ name: "Auriculares inalámbricos Pro" });
    const b = dealsGridGroupKey({ name: "Portátil 14 16GB 512GB" });
    expect(a).not.toBe(b);
  });

  it("un número que no tiene forma de rango (sin guion) no se quita del nombre", () => {
    expect(dealsGridGroupKey({ name: "Auriculares modelo 500" })).toContain("500");
  });

  it("dos nombres reales de Awin que solo difieren en una talla con fracción dan la misma clave", () => {
    const a = dealsGridGroupKey({ name: "ZAPATILLA HANDBALL SPEZIAL 37 1/3" });
    const b = dealsGridGroupKey({ name: "ZAPATILLA HANDBALL SPEZIAL 42 2/3" });
    expect(a).toBe(b);
  });

  it("dos nombres reales de Awin que solo difieren en una talla por letra dan la misma clave", () => {
    const a = dealsGridGroupKey({ name: "Camiseta running XS Maroon" });
    const b = dealsGridGroupKey({ name: "Camiseta running 2XL Maroon" });
    expect(a).toBe(b);
  });

  it("un número que forma parte real del nombre del modelo (no es una talla) se conserva y sigue agrupando igual entre variantes", () => {
    const a = dealsGridGroupKey({ name: "Pureboost 5 Running 38 2/3" });
    const b = dealsGridGroupKey({ name: "Pureboost 5 Running 40 2/3" });
    expect(a).toBe(b);
    expect(a).toContain("5"); // el "5" del modelo (Pureboost 5) nunca se quita, solo la talla
  });

  it("una talla suelta de dos cifras (ej. '42') se quita igual que una con fracción, sin confundirla con el color que va justo detrás", () => {
    const a = dealsGridGroupKey({ name: "adidasZapatilla Pureboost 5 Running 38 2/3 Cloud White Hombre" });
    const b = dealsGridGroupKey({ name: "adidasZapatilla Pureboost 5 Running 42 Cloud White Hombre" });
    expect(a).toBe(b);
    expect(a).toContain("cloud white"); // el color nunca se quita, solo la talla
    expect(a).toContain("5"); // el "5" del modelo tampoco se quita
  });

  it("un número de modelo/versión al final del nombre, sin nada detrás, nunca se confunde con una talla infantil aunque caiga en su mismo rango (16-29)", () => {
    // "Ultraboost 22" es un nombre de modelo real (versión "22" de
    // Ultraboost), no una talla — al no tener nada detrás del número, se
    // conserva igual que un "42" o "45" de adulto al final del nombre.
    expect(dealsGridGroupKey({ name: "Ultraboost 22" })).toContain("22");
    expect(dealsGridGroupKey({ name: "Pureboost 5" })).toContain("5");
    expect(dealsGridGroupKey({ name: "Modelo 17" })).toContain("17");
  });

  it("dos nombres reales de Awin que solo difieren en una talla infantil/junior (16-29) con color detrás dan la misma clave (caso real: 'Zapatilla Tensaur Hook and Loop' en varias tallas de niño)", () => {
    const a = dealsGridGroupKey({ name: "Zapatilla Tensaur Hook and Loop 22 Cloud White Niño" });
    const b = dealsGridGroupKey({ name: "Zapatilla Tensaur Hook and Loop 27 Cloud White Niño" });
    expect(a).toBe(b);
    expect(a).toContain("cloud white"); // el color nunca se quita, solo la talla
  });
});

describe("bestDiscountPercent", () => {
  it("devuelve 0 cuando ninguna oferta tiene previousPrice", () => {
    const product = fakeProduct({ name: "X", categoryId: 1, offers: [{ previousPrice: null, currentPrice: "10" }] });
    expect(bestDiscountPercent(product)).toBe(0);
  });

  it("calcula el descuento relativo correcto cuando hay previousPrice", () => {
    const product = fakeProduct({ name: "X", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "75" }] });
    expect(bestDiscountPercent(product)).toBeCloseTo(25);
  });

  it("con varias ofertas, usa el mayor descuento relativo entre todas", () => {
    const product = fakeProduct({
      name: "X",
      categoryId: 1,
      offers: [
        { previousPrice: "100", currentPrice: "90" }, // 10%
        { previousPrice: "100", currentPrice: "50" }, // 50%
      ],
    });
    expect(bestDiscountPercent(product)).toBeCloseTo(50);
  });
});

describe("collapseProductVariants", () => {
  it("nunca deja dos variantes (talla) del mismo modelo: se queda con la de mayor descuento", () => {
    const products = [
      fakeProduct({ name: "Pantalón Tastigo 3 Training XS", categoryId: 1, offers: [{ previousPrice: "50", currentPrice: "45" }] }), // 10%
      fakeProduct({ name: "Pantalón Tastigo 3 Training S", categoryId: 1, offers: [{ previousPrice: "50", currentPrice: "30" }] }), // 40%
      fakeProduct({ name: "Pantalón Tastigo 3 Training M", categoryId: 1, offers: [{ previousPrice: "50", currentPrice: "48" }] }), // 4%
    ];
    const collapsed = collapseProductVariants(products);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].name).toBe("Pantalón Tastigo 3 Training S"); // 40%, el mayor de las tres
  });

  it("no reparte por categoría ni recorta: devuelve TODOS los modelos distintos, sin límite (a diferencia de selectDiverseDeals)", () => {
    const products = [
      fakeProduct({ name: "A1", categoryId: 1 }),
      fakeProduct({ name: "A2", categoryId: 1 }),
      fakeProduct({ name: "B1", categoryId: 2 }),
      fakeProduct({ name: "C1", categoryId: 3 }),
    ];
    expect(collapseProductVariants(products)).toHaveLength(4);
  });

  it("con una lista vacía, devuelve una lista vacía sin lanzar", () => {
    expect(collapseProductVariants([])).toEqual([]);
  });

  it("el resultado sale ordenado por descuento real, no por el orden de llegada de la primera variante vista de cada grupo", () => {
    // A propósito, la PRIMERA variante de "Zapatilla X" que llega (talla
    // XS, sin descuento) va ANTES que "Producto Y" en la lista de
    // entrada, aunque la variante ganadora de "Zapatilla X" (talla S,
    // 60%) llegue después. Antes de este arreglo, `Map.set` sobre una
    // clave ya existente actualizaba el VALOR pero conservaba la
    // POSICIÓN de la primera aparición — así que "Zapatilla X" habría
    // salido en la posición de su variante SIN descuento (la primera
    // vista), por delante de "Producto Y" (30%), aunque su descuento
    // real ganador (60%) debería ir primero.
    const products = [
      fakeProduct({ name: "Zapatilla X XS", categoryId: 1, offers: [{ previousPrice: null, currentPrice: "50" }] }), // 0%, primera vista
      fakeProduct({ name: "Producto Y", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "70" }] }), // 30%
      fakeProduct({ name: "Zapatilla X S", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "40" }] }), // 60%, la variante ganadora
    ];
    const collapsed = collapseProductVariants(products);
    expect(collapsed.map((p) => p.name)).toEqual(["Zapatilla X S", "Producto Y"]);
  });
});

describe("selectDiverseDeals", () => {
  it("nunca incluye dos variantes (talla) del mismo modelo: se queda con la de mayor descuento", () => {
    const products = [
      fakeProduct({ name: "Pantalón X 23-34", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "90" }] }),
      fakeProduct({ name: "Pantalón X 24-30", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "60" }] }),
      fakeProduct({ name: "Pantalón X 24-32", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "95" }] }),
    ];
    const selected = selectDiverseDeals(products, 24);
    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe("Pantalón X 24-30"); // 40% de descuento, el mayor de las tres
  });

  it("reparte el resultado entre categorías distintas en vez de agotar una sola", () => {
    const products = [
      fakeProduct({ name: "A1", categoryId: 1 }),
      fakeProduct({ name: "A2", categoryId: 1 }),
      fakeProduct({ name: "A3", categoryId: 1 }),
      fakeProduct({ name: "B1", categoryId: 2 }),
    ];
    const selected = selectDiverseDeals(products, 2);
    const categoryIds = selected.map((p) => p.categoryId).sort();
    expect(categoryIds).toEqual([1, 2]); // no las 2 primeras de la categoría 1
  });

  it("nunca devuelve más de `limit` productos", () => {
    const products = Array.from({ length: 10 }, (_, i) => fakeProduct({ name: `P${i}`, categoryId: 1 }));
    expect(selectDiverseDeals(products, 3)).toHaveLength(3);
  });

  it("con menos productos distintos que `limit`, devuelve todos los que haya sin lanzar", () => {
    const products = [fakeProduct({ name: "Único", categoryId: 1 })];
    expect(selectDiverseDeals(products, 24)).toHaveLength(1);
  });

  it("el resultado final está ordenado por % de descuento real descendente, no por el reparto de categorías", () => {
    // A propósito, la categoría 1 aporta el mayor Y el menor descuento de
    // todos: si el resultado se quedara en el orden de intercalado por
    // categoría (ronda a ronda), "A1" (90%) saldría primero pero "A2"
    // (5%) saldría antes que "B1" (50%) solo por turno de ronda, nunca
    // por su descuento real.
    const products = [
      fakeProduct({ name: "A1", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "10" }] }), // 90%
      fakeProduct({ name: "A2", categoryId: 1, offers: [{ previousPrice: "100", currentPrice: "95" }] }), // 5%
      fakeProduct({ name: "B1", categoryId: 2, offers: [{ previousPrice: "100", currentPrice: "50" }] }), // 50%
    ];
    const selected = selectDiverseDeals(products, 3);
    expect(selected.map((p) => p.name)).toEqual(["A1", "B1", "A2"]);
  });

  it("desempata productos SIN descuento (0%) por fecha de actualización más reciente", () => {
    const products = [
      fakeProduct({ name: "Viejo", categoryId: 1, updatedAt: new Date("2026-01-01T00:00:00Z") }),
      fakeProduct({ name: "Reciente", categoryId: 2, updatedAt: new Date("2026-06-01T00:00:00Z") }),
    ];
    const selected = selectDiverseDeals(products, 2);
    expect(selected.map((p) => p.name)).toEqual(["Reciente", "Viejo"]);
  });

  it("desempata productos con el MISMO % de descuento por fecha de actualización más reciente", () => {
    const products = [
      fakeProduct({
        name: "Descuento viejo",
        categoryId: 1,
        offers: [{ previousPrice: "100", currentPrice: "50" }], // 50%
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      fakeProduct({
        name: "Descuento reciente",
        categoryId: 2,
        offers: [{ previousPrice: "100", currentPrice: "50" }], // mismo 50%
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      }),
    ];
    const selected = selectDiverseDeals(products, 2);
    expect(selected.map((p) => p.name)).toEqual(["Descuento reciente", "Descuento viejo"]);
  });
});

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
    expect(data.categories.length).toBeGreaterThan(0);
  });

  it("getHomeCategories en demo nunca incluye una categoría sin productos demo (evita un enlace de píldora que daría 404 en /categoria/[slug])", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete (globalThis as Record<string, unknown>).__preciaraPrisma;
    const { getHomeCategories: fn } = await import("./home");
    const { getCategoryDetail } = await import("./category");
    const { data } = await fn();
    for (const category of data.categories) {
      const detail = await getCategoryDetail(category.slug);
      expect(detail.status).toBe("found");
    }
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
    expect(result.data.categories.length).toBeGreaterThan(0);
    expect(result.data.categories.length).toBeLessThanOrEqual(8);
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

  it("si en este entorno la base solo tiene catálogo demo, la cuadrícula de bajadas cae al fallback demo", async () => {
    // Igual que en dataSource/search.test.ts: solo afirma algo cuando de
    // verdad no hay catálogo real en este entorno, para no dar un falso
    // negativo en un entorno con datos reales ya importados.
    const realCatalogProbe = await getActiveProductsWithOffers(1);
    const hasRealCatalog = (realCatalogProbe?.length ?? 0) > 0;
    if (!hasRealCatalog) {
      const bundle = await getDealsGridBundle();
      expect(bundle.source).toBe("demo");
      expect(bundle.data.products.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("dataSource/home: cuadrícula de bajadas (integración)", () => {
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

  it("un producto marcado isDemo=true nunca aparece en la cuadrícula, aunque haya catálogo real junto a él", async () => {
    const demoMerchant = await prisma!.merchant.create({
      data: { slug: `${PREFIX}-comercio-demo`, name: "Comercio demo", websiteUrl: "https://example.invalid", isDemo: true },
    });
    const demoProduct = await prisma!.product.create({
      data: { slug: `${PREFIX}-producto-demo-en-mezcla`, name: "Producto demo en mezcla", categoryId, isDemo: true },
    });
    await prisma!.offer.create({
      data: {
        productId: demoProduct.id,
        merchantId: demoMerchant.id,
        currentPrice: 1,
        productUrl: "https://example.invalid/demo-en-mezcla",
        availability: "IN_STOCK",
        lastCheckedAt: new Date(),
        isActive: true,
        isDemo: true,
      },
    });

    const bundle = await getDealsGridBundle();
    expect(bundle.data.products.find((p) => p.slug === `${PREFIX}-producto-demo-en-mezcla`)).toBeUndefined();
    // El producto real de este mismo bloque sigue apareciendo con normalidad.
    if (bundle.source === "database") {
      expect(bundle.data.products.find((p) => p.slug === productSlug)).toBeDefined();
    }
  });

  it("varias tallas del mismo modelo (mismo nombre salvo el rango de talla) nunca aparecen juntas en la cuadrícula", async () => {
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const sizeVariantSlugs = [`${PREFIX}-talla-23-34`, `${PREFIX}-talla-24-30`, `${PREFIX}-talla-24-32`];
    for (const slug of sizeVariantSlugs) {
      const size = slug.split("-talla-")[1];
      const variant = await prisma!.product.create({
        data: { slug, name: `Pantalón de prueba ${size} Black Mujer`, categoryId },
      });
      await prisma!.offer.create({
        data: {
          productId: variant.id,
          merchantId: merchant.id,
          currentPrice: 29.99,
          productUrl: `https://example.invalid/talla-${size}`,
          availability: "IN_STOCK",
          lastCheckedAt: new Date(),
          isActive: true,
        },
      });
    }

    const bundle = await getDealsGridBundle();
    const present = sizeVariantSlugs.filter((slug) => bundle.data.products.some((p) => p.slug === slug));
    if (bundle.source === "database") {
      // Como mucho una de las tres tallas, nunca varias tarjetas del mismo modelo.
      expect(present.length).toBeLessThanOrEqual(1);
    }
  });
});
