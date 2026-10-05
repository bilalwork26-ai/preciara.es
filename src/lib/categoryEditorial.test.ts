import { describe, expect, it } from "vitest";
import { getCategoryEditorial } from "./categoryEditorial";

const KNOWN_SLUGS = [
  "tecnologia",
  "hogar",
  "electrodomesticos",
  "salud-cuidado",
  "deporte",
  "moda",
  "infantil",
  "viajes",
  "motor",
  "jardin-bricolaje",
  "mascotas",
  "libros-ocio",
];

describe("getCategoryEditorial", () => {
  it("cada categoría conocida tiene contenido editorial real y sustancial (nunca una plantilla vacía)", () => {
    for (const slug of KNOWN_SLUGS) {
      const editorial = getCategoryEditorial(slug);
      expect(editorial.intro.length).toBeGreaterThan(30);
      expect(editorial.guideTitle.length).toBeGreaterThan(5);
      expect(editorial.guide.length).toBeGreaterThan(60);
    }
  });

  it("cada categoría conocida tiene un texto DISTINTO de las demás (nunca la misma plantilla genérica con el nombre intercambiado)", () => {
    const intros = KNOWN_SLUGS.map((slug) => getCategoryEditorial(slug).intro);
    const guides = KNOWN_SLUGS.map((slug) => getCategoryEditorial(slug).guide);
    expect(new Set(intros).size).toBe(KNOWN_SLUGS.length);
    expect(new Set(guides).size).toBe(KNOWN_SLUGS.length);
  });

  it("un slug desconocido (p. ej. 'otros', el comodín de categoryMapping.ts, o una categoría futura) nunca lanza: cae a un texto por defecto con contenido real", () => {
    for (const slug of ["otros", "categoria-futura-cualquiera", ""]) {
      expect(() => getCategoryEditorial(slug)).not.toThrow();
      const editorial = getCategoryEditorial(slug);
      expect(editorial.intro.length).toBeGreaterThan(20);
      expect(editorial.guide.length).toBeGreaterThan(40);
    }
  });

  it("es determinista: el mismo slug devuelve siempre el mismo contenido", () => {
    expect(getCategoryEditorial("deporte")).toEqual(getCategoryEditorial("deporte"));
  });
});
