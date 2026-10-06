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

  it("incluye siempre la portada, /categorias y /supergangas", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://preciara.es");
    expect(urls).toContain("https://preciara.es/categorias");
    expect(urls).toContain("https://preciara.es/supergangas");
  });

  it("incluye /guias y las tres guías de compra", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://preciara.es/guias");
    expect(urls).toContain("https://preciara.es/guias/como-comparar-precios-online");
    expect(urls).toContain("https://preciara.es/guias/elegir-tecnologia-reacondicionada");
    expect(urls).toContain("https://preciara.es/guias/como-comparar-electrodomesticos");
  });

  it("incluye las páginas corporativas nuevas: Sobre Preciara, Para tiendas y Contacto", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://preciara.es/sobre-preciara");
    expect(urls).toContain("https://preciara.es/para-tiendas");
    expect(urls).toContain("https://preciara.es/contacto");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("sitemap (integración, BD local de pruebas)", () => {
  beforeAll(async () => {
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-cat`, name: "Categoría sitemap" } });
    // `getActiveCategoriesWithProductCounts` solo lista categorías con al
    // menos un producto real (ver ese repositorio) — sin este producto, la
    // categoría de prueba no aparecería y la aserción de abajo daría falso
    // negativo por un motivo ajeno a lo que prueba este test.
    await prisma!.product.create({ data: { slug: `${PREFIX}-cat-producto`, name: "Producto de la categoría", categoryId: category.id } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  it("incluye una categoría real (los productos, paginados, tienen su propio sitemap — ver producto/sitemap.test.ts)", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`https://preciara.es/categoria/${PREFIX}-cat`);
    // Este sitemap ya NO lista productos individuales en absoluto.
    expect(urls.some((url) => url.includes("/producto/"))).toBe(false);
  });

  it("incluye una categoría cuyos productos NO tienen ninguna oferta activa — /categoria/[slug] resuelve con el catálogo completo (ver getCategoryDetail), así que debe estar en el sitemap aunque no tenga ningún chollo", async () => {
    const categorySinOfertas = await prisma!.category.create({
      data: { slug: `${PREFIX}-sin-ofertas-cat`, name: "Categoría sitemap sin ofertas" },
    });
    await prisma!.product.create({
      data: { slug: `${PREFIX}-sin-ofertas-producto`, name: "Producto sin ninguna oferta", categoryId: categorySinOfertas.id },
    });

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`https://preciara.es/categoria/${PREFIX}-sin-ofertas-cat`);
  });
});
