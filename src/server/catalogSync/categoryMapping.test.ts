import { describe, expect, it } from "vitest";
import { GENERIC_CATEGORY_TARGET, mapAwinCategoryText } from "./categoryMapping";

describe("mapAwinCategoryText: mapeo conservador a las seis categorías cubiertas", () => {
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
    ["Deportes", "deporte"],
    ["Ropa deportiva", "deporte"],
    ["Fútbol", "deporte"],
    ["Calzado de running", "deporte"],
    ["Pádel y tenis", "deporte"],
    ["Ciclismo", "deporte"],
    ["Equipamiento de gimnasio", "deporte"],
    ["Balones de baloncesto", "deporte"],
    ["Deshumidificadores", "hogar"],
    ["Climatización y aire acondicionado", "hogar"],
    ["Calefactores eléctricos", "hogar"],
    ["Ventiladores de pie", "hogar"],
    ["Herramientas eléctricas", "hogar"],
    ["Taladros y atornilladores", "hogar"],
    ["Bricolaje y jardín", "hogar"],
  ])('"%s" se clasifica como %s', (rawText, expectedSlug) => {
    expect(mapAwinCategoryText(rawText).slug).toBe(expectedSlug);
  });

  it("caso real Trotec: catálogo de clima/deshumidificación/herramientas cae en Hogar, no en 'Otros' (antes de añadir estas palabras clave, caía en Otros)", () => {
    expect(mapAwinCategoryText("Deshumidificadores y climatizadores para el hogar").slug).toBe("hogar");
    expect(mapAwinCategoryText("Herramientas de medición y bricolaje profesional").slug).toBe("hogar");
  });

  it("'portátil' no confunde un deshumidificador/calefactor portátil con un ordenador portátil (bug real: la palabra clave suelta 'portatil' coincidía con cualquier '[algo] portátil', no solo ordenadores)", () => {
    expect(mapAwinCategoryText("Deshumidificador portátil para el hogar").slug).toBe("hogar");
    expect(mapAwinCategoryText("Calefactor portátil").slug).not.toBe("tecnologia");
    // El caso real que sí debe seguir cayendo en Tecnología, vía "ordenador"/"laptop" (no "portatil" suelto).
    expect(mapAwinCategoryText("Ordenador portátil 15 pulgadas").slug).toBe("tecnologia");
  });

  it("un texto de calzado/ropa SIN ninguna señal explícita de deporte sigue cayendo en Moda, no en Deporte", () => {
    // A propósito: "Calzado y zapatillas" (caso ya cubierto arriba) no
    // menciona nada de deporte, así que una tienda de moda genérica con
    // esa categoría no debe acabar mal clasificada como Deporte solo
    // porque Adidas (marca deportiva) también vende zapatillas.
    expect(mapAwinCategoryText("Vestidos y ropa de fiesta").slug).toBe("moda");
  });

  it("'running' no se confunde con 'niño' (bug real: la palabra clave suelta 'nin' coincidía como subcadena dentro de 'running')", () => {
    expect(mapAwinCategoryText("Calzado de running").slug).toBe("deporte");
    expect(mapAwinCategoryText("Zapatillas para correr").slug).not.toBe("infantil");
  });

  it("un texto con señal de deporte Y palabras genéricas de moda cae en Deporte (más específico), no en Moda", () => {
    // Caso real: Adidas es una marca deportiva — su ropa/calzado técnico
    // debe clasificarse como Deporte aunque el texto también contenga
    // "ropa"/"calzado" (palabras clave de Moda).
    expect(mapAwinCategoryText("Ropa y calzado deportivo").slug).toBe("deporte");
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
