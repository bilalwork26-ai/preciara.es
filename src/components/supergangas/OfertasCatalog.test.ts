import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sin infraestructura de test de componentes en el proyecto (mismo
 * patrón que Hero.test.ts/ProductDealCard.test.ts): la lógica de
 * filtrado en sí ya está probada aparte en
 * `src/lib/ofertasFilters.test.ts`. Aquí solo se verifica, de forma
 * estática, que el componente delega en ella y nunca recorta el
 * catálogo a un puñado fijo de tarjetas del lado del servidor — el bug
 * real reportado era justamente que /supergangas se comportaba como si
 * tuviera el mismo tope de 8 que el adelanto de la portada.
 */
const source = readFileSync(path.resolve(import.meta.dirname, "OfertasCatalog.tsx"), "utf8");

describe("OfertasCatalog.tsx", () => {
  it("delega el filtrado en @/lib/ofertasFilters, nunca lo reimplementa inline", () => {
    expect(source).toContain('from "@/lib/ofertasFilters"');
    expect(source).toContain("filterOfertas(");
    expect(source).toContain("availableCategoryOptions(");
    expect(source).toContain("availableMerchantOptions(");
  });

  it("ofrece selects de categoría y de tienda", () => {
    expect(source).toMatch(/Categoría/);
    expect(source).toMatch(/Tienda/);
    expect((source.match(/<select/g) ?? []).length).toBe(2);
  });

  it("el desplegable de Tienda se construye a partir de `allMerchants` (TODAS las tiendas reales), nunca de `products` (que solo trae las que tienen descuento activo ahora mismo)", () => {
    expect(source).toMatch(/availableMerchantOptions\(allMerchants\)/);
    expect(source).not.toMatch(/availableMerchantOptions\(products/);
  });

  it("ofrece un input de búsqueda por texto, pasado a filterOfertas como `query` (casi 1.000 productos en Supergangas: hace falta poder filtrar por palabra clave, no solo por categoría/tienda)", () => {
    expect(source).toMatch(/<input[^>]*type="search"/);
    expect(source).toMatch(/filterOfertas\([^)]*\bquery\b/);
  });

  it("el input de búsqueda también resetea la paginación en cliente al cambiar (mismo criterio que categoría/tienda)", () => {
    expect(source).toMatch(/appliedFilters\.query\s*!==\s*query/);
  });

  it("pagina en cliente sobre el array completo recibido por props, nunca vuelve a pedir datos al servidor", () => {
    expect(source).toContain("visibleCount");
    expect(source).not.toMatch(/fetch\(|router\.push|useRouter/);
  });

  it("nunca ajusta el estado de paginación dentro de un useEffect (antipatrón de cascada de renders) — se ajusta en el cuerpo del render", () => {
    expect(source).not.toContain("useEffect");
  });

  it("reutiliza ProductDealCard para las tarjetas, sin duplicar su marcado", () => {
    expect(source).toContain("ProductDealCard");
    expect(source).not.toMatch(/<DiscountBadge/);
  });
});
