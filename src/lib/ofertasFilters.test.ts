import { describe, expect, it } from "vitest";
import {
  ALL_FILTER_VALUE,
  availableCategoryOptions,
  availableMerchantOptions,
  bestOfferMerchantId,
  expandSearchSynonyms,
  filterOfertas,
  normalizeForSearch,
} from "./ofertasFilters";
import type { Merchant, Product } from "@/types";

function fakeOffer(overrides: Partial<Product["offers"][number]> & { merchantId: string; price: number }): Product["offers"][number] {
  return {
    id: `offer-${overrides.merchantId}-${overrides.price}`,
    currency: "EUR",
    url: "https://example.invalid",
    inStock: true,
    verified: false,
    lastCheckedLabel: "hoy",
    ...overrides,
  };
}

function fakeProduct(overrides: Partial<Product> & { id: string; categoryId: string; offers: Product["offers"] }): Product {
  return {
    slug: overrides.id,
    name: `Producto ${overrides.id}`,
    icon: "Package",
    priceHistory: [],
    ...overrides,
  };
}

const adidasShoe = fakeProduct({
  id: "p-adidas-1",
  categoryId: "deporte",
  offers: [fakeOffer({ merchantId: "adidas-es", price: 59.99 })],
});
const adidasShoe2 = fakeProduct({
  id: "p-adidas-2",
  categoryId: "moda",
  offers: [fakeOffer({ merchantId: "adidas-es", price: 39.99 })],
});
const trotecDehumidifier = fakeProduct({
  id: "p-trotec-1",
  categoryId: "hogar",
  offers: [fakeOffer({ merchantId: "trotec", price: 129.0 })],
});

const merchants: Merchant[] = [
  { id: "adidas-es", slug: "adidas-es", name: "adidas ES", accentColor: "#000" },
  { id: "trotec", slug: "trotec", name: "Trotec", accentColor: "#111" },
];

describe("bestOfferMerchantId", () => {
  it("devuelve el comercio de la oferta más barata, no de la primera del array", () => {
    const product = fakeProduct({
      id: "multi",
      categoryId: "moda",
      offers: [fakeOffer({ merchantId: "caro", price: 100 }), fakeOffer({ merchantId: "barato", price: 50 })],
    });
    expect(bestOfferMerchantId(product)).toBe("barato");
  });

  it("null si el producto no tiene ninguna oferta", () => {
    expect(bestOfferMerchantId(fakeProduct({ id: "sin-ofertas", categoryId: "moda", offers: [] }))).toBeNull();
  });
});

describe("filterOfertas", () => {
  const all = [adidasShoe, adidasShoe2, trotecDehumidifier];

  it("con ALL_FILTER_VALUE en ambos filtros, devuelve todo sin filtrar", () => {
    expect(filterOfertas(all, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE })).toEqual(all);
  });

  it("filtra por categoría", () => {
    const result = filterOfertas(all, { categoryId: "hogar", merchantId: ALL_FILTER_VALUE });
    expect(result.map((p) => p.slug)).toEqual(["p-trotec-1"]);
  });

  it("filtra por tienda", () => {
    const result = filterOfertas(all, { categoryId: ALL_FILTER_VALUE, merchantId: "adidas-es" });
    expect(result.map((p) => p.slug)).toEqual(["p-adidas-1", "p-adidas-2"]);
  });

  it("combina categoría Y tienda (no O): ambos criterios deben cumplirse", () => {
    const result = filterOfertas(all, { categoryId: "deporte", merchantId: "adidas-es" });
    expect(result.map((p) => p.slug)).toEqual(["p-adidas-1"]);
  });

  it("una combinación que no cumple ningún producto devuelve una lista vacía, nunca lanza", () => {
    const result = filterOfertas(all, { categoryId: "hogar", merchantId: "adidas-es" });
    expect(result).toEqual([]);
  });

  describe("búsqueda por texto (query)", () => {
    const zapatillas = fakeProduct({
      id: "p-zapatillas",
      name: "Zapatillas running Ultraboost",
      categoryId: "deporte",
      offers: [fakeOffer({ merchantId: "adidas-es", price: 89.99 })],
    });
    const bateria = fakeProduct({
      id: "p-bateria",
      name: "Batería externa 10000mAh",
      categoryId: "tecnologia",
      offers: [fakeOffer({ merchantId: "trotec", price: 24.99 })],
    });
    const products = [zapatillas, bateria];

    it("sin query (u omitida), no filtra por texto", () => {
      expect(filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE })).toEqual(products);
      expect(filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "" })).toEqual(products);
      expect(filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "   " })).toEqual(products);
    });

    it("filtra por coincidencia parcial en el nombre, insensible a mayúsculas", () => {
      const result = filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "ZAPATILLAS" });
      expect(result.map((p) => p.slug)).toEqual(["p-zapatillas"]);
    });

    it("insensible a tildes en ambos sentidos: 'bateria' encuentra 'Batería' y viceversa", () => {
      expect(filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "bateria" }).map((p) => p.slug)).toEqual([
        "p-bateria",
      ]);
      expect(
        filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "báteríá" }).map((p) => p.slug)
      ).toEqual(["p-bateria"]);
    });

    it("se combina con categoría y tienda (Y, no O)", () => {
      const result = filterOfertas(products, { categoryId: "deporte", merchantId: ALL_FILTER_VALUE, query: "bateria" });
      expect(result).toEqual([]);
    });

    it("una query que no coincide con nada devuelve lista vacía, nunca lanza", () => {
      expect(filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "monopatín" })).toEqual([]);
    });
  });

  describe("búsqueda conceptual: sinónimos de subcategoría (ver expandSearchSynonyms)", () => {
    const botaFutbol = fakeProduct({
      id: "p-bota",
      name: "Bota de fútbol Nike césped artificial",
      categoryId: "deporte",
      offers: [fakeOffer({ merchantId: "adidas-es", price: 45 })],
    });
    const sudadera = fakeProduct({
      id: "p-sudadera",
      name: "Sudadera con capucha",
      categoryId: "moda",
      offers: [fakeOffer({ merchantId: "adidas-es", price: 30 })],
    });
    const ventilador = fakeProduct({
      id: "p-ventilador",
      name: "Ventilador de torre silencioso",
      categoryId: "hogar",
      offers: [fakeOffer({ merchantId: "trotec", price: 60 })],
    });
    const products = [botaFutbol, sudadera, ventilador];

    it("'zapatillas' encuentra 'Bota de fútbol' (misma subcategoría 'Zapatillas y calzado'), no solo coincidencia literal", () => {
      const result = filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "zapatillas" });
      expect(result.map((p) => p.slug)).toEqual(["p-bota"]);
    });

    it("el nombre de la subcategoría en sí ('calzado') también encuentra sus productos", () => {
      const result = filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "calzado" });
      expect(result.map((p) => p.slug)).toEqual(["p-bota"]);
    });

    it("'climatizacion' (otra subcategoría, de Hogar) encuentra 'Ventilador', aunque el nombre no contenga esa palabra", () => {
      const result = filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "climatizacion" });
      expect(result.map((p) => p.slug)).toEqual(["p-ventilador"]);
    });

    it("sigue encontrando por coincidencia literal cuando la query no activa ninguna regla de subcategoría (p. ej. 'capucha', que no es palabra clave de ninguna)", () => {
      expect(expandSearchSynonyms(normalizeForSearch("capucha"))).toEqual([]);
      const result = filterOfertas(products, { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "capucha" });
      expect(result.map((p) => p.slug)).toEqual(["p-sudadera"]);
    });

    it("límite conocido: un modelo sin ninguna palabra de categoría en su nombre ('Adidas Ultraboost') no se encuentra buscando 'zapatillas' — no hay ningún dato de subcategoría/modelo guardado para enlazarlo", () => {
      const ultraboost = fakeProduct({
        id: "p-ultraboost",
        name: "Adidas Ultraboost 22",
        categoryId: "deporte",
        offers: [fakeOffer({ merchantId: "adidas-es", price: 150 })],
      });
      const result = filterOfertas([...products, ultraboost], { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "zapatillas" });
      expect(result.map((p) => p.slug)).toEqual(["p-bota"]);
    });
  });

  describe("búsqueda multicampo: también por descripción, no solo por nombre", () => {
    it("encuentra un producto cuyo nombre no contiene la query pero su descripción sí", () => {
      const withDescription = fakeProduct({
        id: "p-desc",
        name: "Modelo XR-200",
        description: "Altavoz bluetooth portátil resistente al agua",
        categoryId: "tecnologia",
        offers: [fakeOffer({ merchantId: "adidas-es", price: 25 })],
      });
      const result = filterOfertas([withDescription], { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "altavoz" });
      expect(result.map((p) => p.slug)).toEqual(["p-desc"]);
    });

    it("sin descripción (null/ausente), no lanza y simplemente no aporta coincidencias extra", () => {
      const withoutDescription = fakeProduct({
        id: "p-sin-desc",
        name: "Modelo YZ-100",
        categoryId: "tecnologia",
        offers: [fakeOffer({ merchantId: "adidas-es", price: 25 })],
      });
      expect(() =>
        filterOfertas([withoutDescription], { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "altavoz" })
      ).not.toThrow();
      expect(
        filterOfertas([withoutDescription], { categoryId: ALL_FILTER_VALUE, merchantId: ALL_FILTER_VALUE, query: "altavoz" })
      ).toEqual([]);
    });
  });
});

describe("expandSearchSynonyms", () => {
  it("query vacía no expande a nada", () => {
    expect(expandSearchSynonyms("")).toEqual([]);
  });

  it("una query que no reconoce ninguna subcategoría no expande a nada", () => {
    expect(expandSearchSynonyms("bateria")).toEqual([]);
  });

  it("'zapatillas' expande a todas las palabras clave de esa subcategoría (incluye 'bota', 'sneaker'...)", () => {
    const terms = expandSearchSynonyms(normalizeForSearch("zapatillas"));
    expect(terms).toEqual(
      expect.arrayContaining(["zapatilla", "zapato", "calzado", "sandalia", "chancla", "bota", "sneaker"])
    );
  });
});

describe("normalizeForSearch", () => {
  it("quita tildes/diéresis (incluida la virgulilla de la ñ, que NFD descompone en n + tilde combinante) y pasa a minúsculas", () => {
    expect(normalizeForSearch("Batería ÑOÑO Über")).toBe("bateria nono uber");
  });
});

describe("availableCategoryOptions", () => {
  it("solo incluye categorías con al menos un producto, en orden alfabético por nombre", () => {
    const options = availableCategoryOptions([adidasShoe, adidasShoe2, trotecDehumidifier], {
      deporte: "Deporte",
      moda: "Moda",
      hogar: "Hogar",
      tecnologia: "Tecnología",
    });
    expect(options).toEqual([
      { value: "deporte", label: "Deporte" },
      { value: "hogar", label: "Hogar" },
      { value: "moda", label: "Moda" },
    ]);
  });

  it("nunca duplica una categoría aunque varios productos la compartan", () => {
    const options = availableCategoryOptions([adidasShoe, fakeProduct({ id: "otro-deporte", categoryId: "deporte", offers: [] })], {
      deporte: "Deporte",
    });
    expect(options).toEqual([{ value: "deporte", label: "Deporte" }]);
  });

  it("sin traducción de nombre disponible, usa el propio id (nunca descarta la opción)", () => {
    const options = availableCategoryOptions([adidasShoe], {});
    expect(options).toEqual([{ value: "deporte", label: "deporte" }]);
  });
});

describe("availableMerchantOptions", () => {
  it("lista TODAS las tiendas recibidas, en orden alfabético — ya no depende de qué productos tengan descuento ahora mismo (requisito de negocio: nunca ocultar una tienda real por no tener ninguna rebaja en este momento, caso real Vatrer/BIKILA ES)", () => {
    const vatrer: Merchant = { id: "vatrer", slug: "vatrer", name: "Vatrer", accentColor: "#222" };
    const options = availableMerchantOptions([...merchants, vatrer]);
    expect(options).toEqual([
      { value: "adidas-es", label: "adidas ES" },
      { value: "trotec", label: "Trotec" },
      { value: "vatrer", label: "Vatrer" },
    ]);
  });

  it("una tienda sin ningún producto en el catálogo actual sigue apareciendo (antes se excluía del desplegable por completo)", () => {
    const bikila: Merchant = { id: "bikila-es", slug: "bikila-es", name: "BIKILA ES", accentColor: "#333" };
    expect(availableMerchantOptions([bikila])).toEqual([{ value: "bikila-es", label: "BIKILA ES" }]);
  });

  it("sin tiendas, lista vacía, nunca lanza", () => {
    expect(availableMerchantOptions([])).toEqual([]);
  });
});
