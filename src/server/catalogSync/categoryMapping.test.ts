import { describe, expect, it } from "vitest";
import { GENERIC_CATEGORY_TARGET, mapAwinCategoryText } from "./categoryMapping";

describe("mapAwinCategoryText: mapeo conservador a las cinco categorías cubiertas", () => {
  it.each([
    ["Tecnología", "tecnologia"],
    ["Electrónica y Ordenadores", "tecnologia"],
    ["Smartphones y tablets", "tecnologia"],
    ["Electrodomésticos de cocina", "electrodomesticos"],
    ["Lavadoras y Secadoras", "electrodomesticos"],
    ["Hogar y decoración", "hogar"],
    ["Muebles de salón", "hogar"],
    ["Infantil", "infantil"],
    ["Juguetes y bebé", "infantil"],
    ["Moda mujer", "moda"],
    ["Calzado y zapatillas", "moda"],
  ])('"%s" se clasifica como %s', (rawText, expectedSlug) => {
    expect(mapAwinCategoryText(rawText).slug).toBe(expectedSlug);
  });

  it("no distingue mayúsculas/minúsculas ni acentos", () => {
    expect(mapAwinCategoryText("TECNOLOGÍA").slug).toBe("tecnologia");
    expect(mapAwinCategoryText("tecnologia").slug).toBe("tecnologia");
    expect(mapAwinCategoryText("TeCnOlOgÍa").slug).toBe("tecnologia");
  });

  it("prioriza la categoría más específica cuando el texto es ambiguo (electrodomésticos de cocina antes que 'hogar')", () => {
    expect(mapAwinCategoryText("Electrodomésticos de cocina").slug).toBe("electrodomesticos");
  });
});

describe("mapAwinCategoryText: respaldo genérico, nunca aleatorio", () => {
  it("un texto que no coincide con ninguna regla cae siempre en la categoría genérica 'Otros'", () => {
    expect(mapAwinCategoryText("Categoría totalmente desconocida")).toEqual(GENERIC_CATEGORY_TARGET);
    expect(mapAwinCategoryText("Varios")).toEqual(GENERIC_CATEGORY_TARGET);
    expect(mapAwinCategoryText("!!!")).toEqual(GENERIC_CATEGORY_TARGET);
  });

  it("es determinista: el mismo texto de entrada produce siempre la misma categoría", () => {
    const results = Array.from({ length: 5 }, () => mapAwinCategoryText("Categoría desconocida"));
    for (const result of results) {
      expect(result).toEqual(GENERIC_CATEGORY_TARGET);
    }
  });

  it("nunca lanza, incluso con una cadena vacía", () => {
    expect(() => mapAwinCategoryText("")).not.toThrow();
    expect(mapAwinCategoryText("")).toEqual(GENERIC_CATEGORY_TARGET);
  });
});
