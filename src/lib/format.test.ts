import { describe, expect, it } from "vitest";
import { bestOfferDiscountPercent, calcDiscountPercent, formatPrice, formatProductDisplayName } from "./format";

describe("formatPrice", () => {
  it("formatea en euros con el estilo es-ES", () => {
    expect(formatPrice(19.99)).toContain("19,99");
  });
});

describe("calcDiscountPercent", () => {
  it("calcula el % de descuento redondeado", () => {
    expect(calcDiscountPercent(75, 100)).toBe(25);
  });

  it("devuelve 0 si el precio actual no es menor que el anterior", () => {
    expect(calcDiscountPercent(100, 100)).toBe(0);
    expect(calcDiscountPercent(110, 100)).toBe(0);
  });

  it("devuelve 0 con un previousPrice inválido (<= 0)", () => {
    expect(calcDiscountPercent(10, 0)).toBe(0);
  });
});

describe("formatProductDisplayName", () => {
  it("inserta un separador cuando la marca viene pegada al nombre sin espacio (caso real del feed de Awin)", () => {
    expect(formatProductDisplayName("adidasPantalón Tastigo 3 Training XS", "adidas")).toBe(
      "Adidas - Pantalón Tastigo 3 Training XS"
    );
  });

  it("es insensible a mayúsculas al detectar la marca pegada, pero capitaliza el resultado de forma consistente", () => {
    expect(formatProductDisplayName("ADIDASCamiseta Running", "adidas")).toBe("Adidas - Camiseta Running");
  });

  it("no toca un nombre que ya trae un espacio real entre la marca y el resto", () => {
    expect(formatProductDisplayName("Adidas Pantalón Tastigo", "adidas")).toBe("Adidas Pantalón Tastigo");
  });

  it("no toca un nombre que ya trae un guion real entre la marca y el resto", () => {
    expect(formatProductDisplayName("Adidas - Pantalón Tastigo", "adidas")).toBe("Adidas - Pantalón Tastigo");
  });

  it("no toca el nombre si no empieza por la marca (marcas de otro origen, formato distinto)", () => {
    expect(formatProductDisplayName("Zapatillas urbanas", "adidas")).toBe("Zapatillas urbanas");
  });

  it("no toca el nombre sin marca conocida (null/undefined/vacía)", () => {
    expect(formatProductDisplayName("adidasPantalón Tastigo", null)).toBe("adidasPantalón Tastigo");
    expect(formatProductDisplayName("adidasPantalón Tastigo", undefined)).toBe("adidasPantalón Tastigo");
    expect(formatProductDisplayName("adidasPantalón Tastigo", "   ")).toBe("adidasPantalón Tastigo");
  });

  it("no toca el nombre si es exactamente igual a la marca (nada que reformatear)", () => {
    expect(formatProductDisplayName("adidas", "adidas")).toBe("adidas");
  });

  it("convierte un nombre completamente en mayúsculas a formato normal (caso real del feed)", () => {
    expect(formatProductDisplayName("BOLSA DE VIAJE FAVORITE", null)).toBe("Bolsa de viaje favorite");
  });

  it("aplica el mismo arreglo de mayúsculas al 'resto' cuando también corrige la marca pegada", () => {
    expect(formatProductDisplayName("ADIDASPANTALÓN TASTIGO 3 TRAINING XS", "adidas")).toBe(
      "Adidas - Pantalón tastigo 3 training xs"
    );
  });

  it("no toca un nombre en mayúsculas y minúsculas mezcladas (capitalización ya intencional)", () => {
    expect(formatProductDisplayName("Smartphone 128 GB", null)).toBe("Smartphone 128 GB");
  });

  it("no confunde un nombre sin ninguna letra (solo números/símbolos) con mayúsculas gritando", () => {
    expect(formatProductDisplayName("5,5 L", null)).toBe("5,5 L");
  });
});

describe("bestOfferDiscountPercent", () => {
  it("usa el mayor descuento entre TODAS las ofertas, no solo la de precio más bajo", () => {
    const offers = [
      { price: 45, previousPrice: undefined }, // la más barata, pero sin previousPrice registrado
      { price: 50, previousPrice: 100 }, // la que sí trae un descuento real del 50%
    ];
    expect(bestOfferDiscountPercent(offers)).toBe(50);
  });

  it("devuelve 0 cuando ninguna oferta tiene previousPrice", () => {
    expect(bestOfferDiscountPercent([{ price: 45, previousPrice: undefined }])).toBe(0);
  });

  it("devuelve 0 con una lista vacía de ofertas", () => {
    expect(bestOfferDiscountPercent([])).toBe(0);
  });
});
