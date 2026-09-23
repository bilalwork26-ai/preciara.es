import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("excluye admin, api y la búsqueda interna, y permite el resto", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.allow).toBe("/");
    expect(rules?.disallow).toEqual(expect.arrayContaining(["/admin", "/admin/", "/api/", "/buscar"]));
  });

  it("declara la URL del sitemap bajo https://preciara.es por defecto", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://preciara.es/sitemap.xml");
  });
});
