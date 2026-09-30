import { describe, expect, it } from "vitest";
import {
  ALL_FILTER_VALUE,
  availableCategoryOptions,
  availableMerchantOptions,
  bestOfferMerchantId,
  filterOfertas,
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
  it("solo incluye tiendas con al menos un producto (el de mejor precio), en orden alfabético", () => {
    const options = availableMerchantOptions([adidasShoe, trotecDehumidifier], merchants);
    expect(options).toEqual([
      { value: "adidas-es", label: "adidas ES" },
      { value: "trotec", label: "Trotec" },
    ]);
  });

  it("productos sin ninguna oferta no aportan ninguna opción", () => {
    const options = availableMerchantOptions([fakeProduct({ id: "sin-ofertas", categoryId: "moda", offers: [] })], merchants);
    expect(options).toEqual([]);
  });
});
