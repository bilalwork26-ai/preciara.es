import { describe, expect, it } from "vitest";
import { buildCategoryHref, CATEGORIES_INDEX_HREF, OFERTAS_HREF, PRIMARY_NAV_ITEMS } from "./categoryLinks";

describe("buildCategoryHref", () => {
  it("enlaza a la ficha de categoría real, no a /buscar", () => {
    const href = buildCategoryHref("tecnologia");
    expect(href).toBe("/categoria/tecnologia");
    expect(href).not.toContain("/buscar");
  });

  it("codifica el slug de forma segura (defensa en profundidad, aunque los slugs ya sean seguros por construcción)", () => {
    expect(buildCategoryHref("jardín & bricolaje")).toBe(`/categoria/${encodeURIComponent("jardín & bricolaje")}`);
    expect(buildCategoryHref("a/b")).toBe("/categoria/a%2Fb");
  });

  it("nunca produce un enlace hacia /buscar?categoria=..., para cualquier slug", () => {
    for (const slug of ["tecnologia", "hogar", "salud-cuidado", "a b c", "raro?slug=1"]) {
      expect(buildCategoryHref(slug)).not.toMatch(/\/buscar/);
    }
  });

  it("coincide con el patrón de URL usado por el sitemap y el canonical de /categoria/[slug] (mismos slugs, misma ruta)", () => {
    const slug = "electrodomesticos";
    const sitemapStyleUrl = `/categoria/${slug}`; // mismo patrón que src/app/sitemap.ts y generateMetadata de la página
    expect(buildCategoryHref(slug)).toBe(sitemapStyleUrl);
  });
});

describe("CATEGORIES_INDEX_HREF", () => {
  it("apunta a /categorias (el índice real, indexable, nunca /buscar)", () => {
    expect(CATEGORIES_INDEX_HREF).toBe("/categorias");
  });
});

describe("OFERTAS_HREF", () => {
  it("apunta a /supergangas (nunca a /buscar, que está excluida de robots.txt)", () => {
    expect(OFERTAS_HREF).toBe("/supergangas");
    expect(OFERTAS_HREF).not.toMatch(/\/buscar/);
  });
});

describe("PRIMARY_NAV_ITEMS", () => {
  it("tiene exactamente los 5 elementos pedidos, en este orden: Deporte, Moda, Electrónica, Hogar, Supergangas", () => {
    expect(PRIMARY_NAV_ITEMS.map((item) => item.label)).toEqual(["Deporte", "Moda", "Electrónica", "Hogar", "Supergangas"]);
  });

  it("Electrónica enlaza a /categoria/tecnologia (no existe un slug 'electronica' real)", () => {
    const electronica = PRIMARY_NAV_ITEMS.find((item) => item.label === "Electrónica");
    expect(electronica?.href).toBe("/categoria/tecnologia");
  });

  it("Deporte, Moda y Hogar enlazan a su propia ficha de categoría real (mismo slug que el nombre)", () => {
    expect(PRIMARY_NAV_ITEMS.find((item) => item.label === "Deporte")?.href).toBe("/categoria/deporte");
    expect(PRIMARY_NAV_ITEMS.find((item) => item.label === "Moda")?.href).toBe("/categoria/moda");
    expect(PRIMARY_NAV_ITEMS.find((item) => item.label === "Hogar")?.href).toBe("/categoria/hogar");
  });

  it("Supergangas enlaza a OFERTAS_HREF, nunca a una ficha de categoría (no es una categoría real)", () => {
    const supergangas = PRIMARY_NAV_ITEMS.find((item) => item.label === "Supergangas");
    expect(supergangas?.href).toBe(OFERTAS_HREF);
    expect(supergangas?.href).not.toContain("/categoria/");
  });

  it("ningún elemento enlaza a /buscar", () => {
    for (const item of PRIMARY_NAV_ITEMS) {
      expect(item.href).not.toMatch(/\/buscar/);
    }
  });

  it("cada elemento tiene un nombre de icono de lucide-react no vacío", () => {
    for (const item of PRIMARY_NAV_ITEMS) {
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });
});
