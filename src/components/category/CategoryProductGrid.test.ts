import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sin infraestructura de test de componentes en el proyecto (mismo caso
 * que Hero.test.ts/MarqueeBand.test.ts): la lógica no-visual (recuento,
 * ocultar pestañas vacías, filtrado) ya está probada de forma aislada en
 * `src/lib/productType.test.ts` (buildSubcategoryTabState). Aquí solo se
 * verifica, de forma estática, que el componente delega en esa lógica en
 * vez de reimplementarla, y que expone la semántica de pestañas correcta.
 */
const gridSource = readFileSync(path.resolve(import.meta.dirname, "CategoryProductGrid.tsx"), "utf8");

describe("CategoryProductGrid.tsx", () => {
  it("delega toda la clasificación/recuento/filtrado en buildSubcategoryTabState, nunca lo reimplementa inline", () => {
    expect(gridSource).toContain("buildSubcategoryTabState");
    expect(gridSource).not.toContain("classifyBySubcategory");
  });

  it("categorías sin taxonomía (getSubcategoryTaxonomy devuelve null) no muestran ninguna pestaña", () => {
    expect(gridSource).toMatch(/if\s*\(!taxonomy \|\| !tabState\)/);
  });

  it("solo renderiza las pestañas visibles (nunca todas las de la taxonomía): usa tabState.visibleRules, no taxonomy, para las pestañas de subcategoría", () => {
    expect(gridSource).toMatch(/tabState\.visibleRules\.map/);
  });

  it("marca la barra de pestañas con role=tablist/tab (accesibilidad) y filtra en cliente, sin recargar ni pedir datos nuevos", () => {
    expect(gridSource).toContain('role="tablist"');
    expect(gridSource).toContain('role="tab"');
    expect(gridSource).toContain('"use client"');
    expect(gridSource).not.toMatch(/fetch\(|router\.push|useRouter/);
  });

  it("reutiliza CategoryProductCard para las tarjetas, sin duplicar el marcado de la tarjeta", () => {
    expect(gridSource).toContain("CategoryProductCard");
    expect(gridSource).not.toMatch(/<DiscountBadge/); // eso vive en CategoryProductCard, no aquí
  });
});
