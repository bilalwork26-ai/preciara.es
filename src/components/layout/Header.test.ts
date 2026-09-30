import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sin infraestructura de test de componentes en el proyecto (mismo patrón
 * que Hero.test.ts/ProductDealCard.test.ts): verifica de forma estática
 * que "Guardados" usa el desplegable real (`SavedMenu`/`MobileSavedDisclosure`,
 * respaldados por `src/lib/favorites.ts`) en vez del mensaje fijo
 * "todavía no hay datos guardados" que mostraba siempre, incluso con
 * productos guardados — ese era precisamente el bug reportado.
 */
const headerSource = readFileSync(path.resolve(import.meta.dirname, "Header.tsx"), "utf8");
const savedMenuSource = readFileSync(path.resolve(import.meta.dirname, "SavedMenu.tsx"), "utf8");

describe("Header.tsx: Guardados usa el desplegable real, no el mensaje fijo de UtilityButton", () => {
  it("importa y usa SavedMenu (escritorio) y MobileSavedDisclosure (móvil)", () => {
    expect(headerSource).toContain('from "./SavedMenu"');
    expect(headerSource).toContain("<SavedMenu");
    expect(headerSource).toContain("<MobileSavedDisclosure");
  });

  it("ya no usa UtilityButton/MobileUtilityDisclosure para Guardados (el mensaje fijo 'todavía no hay datos guardados' era el bug)", () => {
    expect(headerSource).not.toContain("Aquí podrás guardar tus productos y ofertas favoritas");
    expect(headerSource).not.toContain("Todavía no hay datos guardados");
  });

  it("Alertas y Mi cuenta siguen usando el UtilityButton genérico (sin cambios: siguen sin funcionalidad real detrás, a diferencia de Guardados)", () => {
    expect(headerSource).toMatch(/<UtilityButton\s+icon=\{Bell\}/);
    expect(headerSource).toMatch(/<UtilityButton\s+icon=\{User\}/);
  });
});

describe("SavedMenu.tsx: contenido real respaldado por src/lib/favorites.ts", () => {
  it("usa useFavorites/removeFavorite de @/lib/favorites, nunca datos inventados", () => {
    expect(savedMenuSource).toContain('from "@/lib/favorites"');
    expect(savedMenuSource).toContain("useFavorites()");
    expect(savedMenuSource).toContain("removeFavorite(");
  });

  it("enlaza cada favorito a su ficha de producto real (/producto/[slug]), nunca a un enlace inventado", () => {
    expect(savedMenuSource).toContain("href={`/producto/${favorite.slug}`}");
  });
});
