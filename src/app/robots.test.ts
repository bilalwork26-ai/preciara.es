import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("excluye admin, api y la búsqueda interna, y permite el resto", async () => {
    const result = await robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.allow).toBe("/");
    expect(rules?.disallow).toEqual(expect.arrayContaining(["/admin", "/admin/", "/api/", "/buscar"]));
  });

  it("declara el sitemap de páginas/categorías y al menos un sitemap de productos, ambos bajo https://preciara.es", async () => {
    const result = await robots();
    expect(Array.isArray(result.sitemap)).toBe(true);
    const sitemaps = result.sitemap as string[];
    expect(sitemaps[0]).toBe("https://preciara.es/sitemap.xml");
    // Sin DATABASE_URL (o sin ningún producto indexable), sigue habiendo
    // exactamente una página de productos — vacía, pero el fichero existe
    // y se declara (ver computeProductSitemapPageCount: nunca 0 páginas).
    expect(sitemaps.length).toBeGreaterThanOrEqual(2);
    for (const url of sitemaps.slice(1)) {
      expect(url).toMatch(/^https:\/\/preciara\.es\/producto\/sitemap\/\d+\.xml$/);
    }
  });
});
