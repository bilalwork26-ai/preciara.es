import { describe, expect, it } from "vitest";
import { buildSubcategoryTabState, classifyBySubcategory, getSubcategoryTaxonomy } from "./productType";

describe("getSubcategoryTaxonomy", () => {
  it("devuelve la taxonomía de moda/deporte para esas dos categorías", () => {
    const moda = getSubcategoryTaxonomy("moda");
    const deporte = getSubcategoryTaxonomy("deporte");
    expect(moda).not.toBeNull();
    expect(moda).toBe(deporte); // misma taxonomía compartida, no una copia distinta
  });

  it("devuelve la taxonomía de hogar", () => {
    expect(getSubcategoryTaxonomy("hogar")).not.toBeNull();
  });

  it("devuelve null para una categoría sin pestañas definidas (nunca inventa una)", () => {
    expect(getSubcategoryTaxonomy("tecnologia")).toBeNull();
    expect(getSubcategoryTaxonomy("electrodomesticos")).toBeNull();
    expect(getSubcategoryTaxonomy("categoria-inexistente")).toBeNull();
  });
});

describe("classifyBySubcategory: taxonomía moda/deporte", () => {
  const taxonomy = getSubcategoryTaxonomy("moda")!;

  it.each([
    ["Zapatilla Ultraboost 22", "zapatillas"],
    ["Sandalias de verano", "zapatillas"],
    ["Chaqueta cortavientos", "chaquetas"],
    ["Cazadora acolchada", "chaquetas"],
    ["Pantalón Firebird Utility", "pantalones"],
    ["Malla de entrenamiento", "pantalones"],
    ["Camiseta Running", "camisetas-sudaderas"],
    ["Sudadera con capucha", "camisetas-sudaderas"],
    ["Gorra visera curva", "accesorios"],
    ["Mochila deportiva 20L", "accesorios"],
    ["Balón de fútbol talla 5", "accesorios"],
  ])('"%s" se clasifica como %s', (name, expectedSlug) => {
    expect(classifyBySubcategory(name, taxonomy).slug).toBe(expectedSlug);
  });

  it("un producto que no coincide con ninguna palabra clave cae en el comodín 'accesorios', nunca sin subcategoría", () => {
    expect(classifyBySubcategory("Producto sin ninguna palabra clave reconocible", taxonomy).slug).toBe("accesorios");
  });

  it("no distingue mayúsculas/minúsculas ni acentos", () => {
    expect(classifyBySubcategory("ZAPATILLA", taxonomy).slug).toBe("zapatillas");
    expect(classifyBySubcategory("zapatilla", taxonomy).slug).toBe("zapatillas");
    expect(classifyBySubcategory("PANTALÓN", taxonomy).slug).toBe("pantalones");
  });
});

describe("classifyBySubcategory: taxonomía hogar (incluye Trotec)", () => {
  const taxonomy = getSubcategoryTaxonomy("hogar")!;

  it.each([
    ["Deshumidificador de 20L/día", "climatizacion"],
    ["Climatizador portátil evaporativo", "climatizacion"],
    ["Calefactor cerámico", "climatizacion"],
    ["Ventilador de torre", "climatizacion"],
    ["Taladro percutor inalámbrico", "herramientas"],
    ["Amoladora angular 750W", "herramientas"],
    ["Juego de sartenes antiadherentes", "hogar-jardin"],
    ["Mesa de jardín plegable", "hogar-jardin"],
  ])('"%s" se clasifica como %s', (name, expectedSlug) => {
    expect(classifyBySubcategory(name, taxonomy).slug).toBe(expectedSlug);
  });

  it("un producto de hogar genérico sin señal de clima/herramienta cae en el comodín 'hogar-jardin'", () => {
    expect(classifyBySubcategory("Juego de toallas de baño", taxonomy).slug).toBe("hogar-jardin");
  });
});

describe("classifyBySubcategory: nunca lanza con una cadena vacía o rara", () => {
  const taxonomy = getSubcategoryTaxonomy("moda")!;

  it("cadena vacía cae en el comodín sin lanzar", () => {
    expect(() => classifyBySubcategory("", taxonomy)).not.toThrow();
    expect(classifyBySubcategory("", taxonomy).slug).toBe("accesorios");
  });

  it("es determinista: el mismo nombre produce siempre la misma subcategoría", () => {
    const results = Array.from({ length: 5 }, () => classifyBySubcategory("Zapatilla Ultraboost 22", taxonomy).slug);
    expect(new Set(results).size).toBe(1);
  });
});

describe("buildSubcategoryTabState: lógica de pestañas (recuento, ocultar vacías, filtrado)", () => {
  const taxonomy = getSubcategoryTaxonomy("moda")!;
  const items = [
    { name: "Zapatilla Ultraboost 22" },
    { name: "Sandalias de verano" },
    { name: "Chaqueta cortavientos" },
    { name: "Camiseta Running" },
    { name: "Sudadera con capucha" },
    { name: "Mochila deportiva 20L" },
  ];

  it("cuenta correctamente los productos de cada subcategoría", () => {
    const state = buildSubcategoryTabState(items, (i) => i.name, taxonomy);
    expect(state.countByType.get("zapatillas")).toBe(2);
    expect(state.countByType.get("chaquetas")).toBe(1);
    expect(state.countByType.get("camisetas-sudaderas")).toBe(2);
    expect(state.countByType.get("accesorios")).toBe(1);
    expect(state.countByType.get("pantalones")).toBeUndefined();
    expect(state.totalCount).toBe(items.length);
  });

  it("oculta las pestañas sin ningún producto (nunca un callejón sin salida a una lista vacía)", () => {
    const state = buildSubcategoryTabState(items, (i) => i.name, taxonomy);
    const visibleSlugs = state.visibleRules.map((r) => r.slug);
    expect(visibleSlugs).toEqual(["zapatillas", "chaquetas", "camisetas-sudaderas", "accesorios"]);
    expect(visibleSlugs).not.toContain("pantalones");
  });

  it("conserva el orden de la taxonomía en las pestañas visibles", () => {
    const state = buildSubcategoryTabState(items, (i) => i.name, taxonomy);
    const order = state.visibleRules.map((r) => r.slug);
    expect(order).toEqual([...order].sort((a, b) => taxonomy.findIndex((r) => r.slug === a) - taxonomy.findIndex((r) => r.slug === b)));
  });

  it('"todas" devuelve todos los productos sin filtrar, en el mismo orden de entrada', () => {
    const state = buildSubcategoryTabState(items, (i) => i.name, taxonomy);
    expect(state.productsForTab("todas")).toEqual(items);
  });

  it("filtra instantáneamente al pedir una subcategoría concreta", () => {
    const state = buildSubcategoryTabState(items, (i) => i.name, taxonomy);
    expect(state.productsForTab("zapatillas").map((i) => i.name)).toEqual(["Zapatilla Ultraboost 22", "Sandalias de verano"]);
    expect(state.productsForTab("chaquetas").map((i) => i.name)).toEqual(["Chaqueta cortavientos"]);
  });

  it("pedir una subcategoría sin productos devuelve una lista vacía, sin lanzar", () => {
    const state = buildSubcategoryTabState(items, (i) => i.name, taxonomy);
    expect(state.productsForTab("pantalones")).toEqual([]);
  });

  it("con una lista de productos vacía, ninguna pestaña es visible y 'todas' devuelve []", () => {
    const state = buildSubcategoryTabState([], (i: { name: string }) => i.name, taxonomy);
    expect(state.visibleRules).toEqual([]);
    expect(state.totalCount).toBe(0);
    expect(state.productsForTab("todas")).toEqual([]);
  });
});
