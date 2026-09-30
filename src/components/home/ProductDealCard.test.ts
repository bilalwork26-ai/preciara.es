import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sin infraestructura de test de componentes en el proyecto (mismo caso
 * que Hero.test.ts): la lógica de favoritos en sí ya está probada de
 * forma aislada en `src/lib/favorites.test.ts`. Aquí solo se verifica,
 * de forma estática, que la tarjeta delega en ella en vez de simular el
 * guardado con estado local (el bug real reportado: el corazón se veía
 * marcado pero nunca guardaba nada de verdad, así que "Guardados" en la
 * cabecera siempre aparecía vacío).
 */
const source = readFileSync(path.resolve(import.meta.dirname, "ProductDealCard.tsx"), "utf8");

describe("ProductDealCard.tsx: el corazón guarda de verdad, nunca con estado local simulado", () => {
  it("usa useIsFavorite/toggleFavorite de @/lib/favorites para el estado 'guardado'", () => {
    expect(source).toContain('from "@/lib/favorites"');
    expect(source).toContain("useIsFavorite(product.slug)");
    expect(source).toContain("toggleFavorite(toFavoriteProduct(product, merchants))");
  });

  it("ya no usa un useState local para 'saved' (ese era el bug: se veía marcado pero no persistía ni se compartía con la cabecera)", () => {
    expect(source).not.toMatch(/useState\s*\(\s*false\s*\)/);
    expect(source).not.toContain("setSaved");
  });
});
