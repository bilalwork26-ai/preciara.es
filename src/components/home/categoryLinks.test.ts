import { describe, expect, it } from "vitest";
import { buildCategoryHref, CATEGORIES_INDEX_HREF } from "./categoryLinks";

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
