import { describe, expect, it } from "vitest";
import { Availability, OfferSource } from "@/generated/prisma";
import { validateNormalizedOfferRow } from "./validation";
import { NormalizedOfferRowError, type NormalizedOfferRow } from "./types";

function baseRow(overrides: Partial<NormalizedOfferRow> = {}): NormalizedOfferRow {
  return {
    source: OfferSource.AWIN,
    merchant: { slug: "comercio-prueba", name: "Comercio de prueba", websiteUrl: "https://example.invalid" },
    externalId: "ext-1",
    gtin: null,
    name: "Producto de prueba",
    brand: "MarcaPrueba",
    model: "ModeloPrueba",
    category: { slug: "categoria-prueba", name: "Categoría de prueba" },
    imageUrl: null,
    price: 19.99,
    shippingCost: null,
    currency: "EUR",
    availability: Availability.IN_STOCK,
    productUrl: "https://example.invalid/p",
    affiliateUrl: null,
    fetchedAt: new Date("2026-09-22T00:00:00.000Z"),
    ...overrides,
  };
}

/** Llama a `validateNormalizedOfferRow` y devuelve el `NormalizedOfferRowError` lanzado (nunca otro tipo de error) — falla la prueba si no lanza. */
function captureError(row: NormalizedOfferRow): NormalizedOfferRowError {
  try {
    validateNormalizedOfferRow(row);
  } catch (error) {
    if (error instanceof NormalizedOfferRowError) return error;
    throw error;
  }
  throw new Error("se esperaba que validateNormalizedOfferRow lanzara NormalizedOfferRowError, pero no lanzó");
}

/** Congela `row` y sus objetos anidados: cualquier intento de mutación lanzaría TypeError (modo estricto de ESM/Vitest), así que "no lanza" prueba de verdad que no se escribió nada. */
function deepFreeze<T>(value: T): T {
  Object.freeze(value);
  if (value && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      const prop = (value as Record<string, unknown>)[key];
      if (prop && typeof prop === "object" && !Object.isFrozen(prop)) deepFreeze(prop);
    }
  }
  return value;
}

describe("validateNormalizedOfferRow: fila válida", () => {
  it("una fila completamente válida no lanza", () => {
    expect(() => validateNormalizedOfferRow(baseRow())).not.toThrow();
  });

  it("los campos opcionales pueden ser null sin que la fila se rechace (logoUrl, brand, model, imageUrl, affiliateUrl, shippingCost, gtin)", () => {
    const row = baseRow({
      merchant: { slug: "comercio-prueba", name: "Comercio de prueba", websiteUrl: "https://example.invalid", logoUrl: null },
      brand: null,
      model: null,
      imageUrl: null,
      affiliateUrl: null,
      shippingCost: null,
      gtin: null,
    });
    expect(() => validateNormalizedOfferRow(row)).not.toThrow();
  });

  it("no modifica la fila recibida: una fila congelada (incluidos sus objetos anidados) valida sin lanzar TypeError por mutación", () => {
    const row = deepFreeze(baseRow());
    expect(() => validateNormalizedOfferRow(row)).not.toThrow();
  });

  it("no modifica la fila recibida: los valores siguen siendo exactamente los mismos después de validar", () => {
    const row = baseRow();
    const snapshot = JSON.parse(JSON.stringify(row));
    validateNormalizedOfferRow(row);
    expect(JSON.parse(JSON.stringify(row))).toEqual(snapshot);
  });
});

describe("validateNormalizedOfferRow: campos obligatorios ausentes o vacíos (MISSING_FIELD)", () => {
  it.each([
    ["externalId", { externalId: "" }],
    ["externalId (solo espacios)", { externalId: "   " }],
    ["merchant.name", { merchant: { slug: "comercio-prueba", name: "", websiteUrl: "https://example.invalid" } }],
    ["category.name", { category: { slug: "categoria-prueba", name: "" } }],
    ["name", { name: "" }],
    ["name (solo espacios)", { name: "   " }],
  ] as const)("rechaza con MISSING_FIELD cuando falta %s", (_label, overrides) => {
    const row = baseRow(overrides as Partial<NormalizedOfferRow>);
    expect(captureError(row).code).toBe("MISSING_FIELD");
  });
});

describe("validateNormalizedOfferRow: slugs (merchant.slug / category.slug)", () => {
  it("acepta slugs válidos (minúsculas, números y guiones simples entre segmentos)", () => {
    const row = baseRow({ merchant: { slug: "comercio-123", name: "X", websiteUrl: "https://example.invalid" }, category: { slug: "cat-2", name: "Y" } });
    expect(() => validateNormalizedOfferRow(row)).not.toThrow();
  });

  it.each([
    ["mayúsculas", "Comercio-Prueba"],
    ["espacios", "comercio prueba"],
    ["guion al inicio", "-comercio"],
    ["guion al final", "comercio-"],
    ["guiones dobles (segmento vacío)", "comercio--prueba"],
    ["vacío", ""],
  ] as const)("rechaza merchant.slug inválido (%s) con INVALID_SLUG", (_label, badSlug) => {
    const row = baseRow({ merchant: { slug: badSlug, name: "X", websiteUrl: "https://example.invalid" } });
    expect(captureError(row).code).toBe("INVALID_SLUG");
  });

  it("rechaza category.slug inválido con INVALID_SLUG", () => {
    const row = baseRow({ category: { slug: "Categoría Inválida", name: "Y" } });
    expect(captureError(row).code).toBe("INVALID_SLUG");
  });
});

describe("validateNormalizedOfferRow: precio inválido, negativo o no finito (INVALID_PRICE)", () => {
  it("acepta price = 0 (valor límite, no negativo)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ price: 0 }))).not.toThrow();
  });

  it.each([
    ["negativo", -0.01],
    ["muy negativo", -1000],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ] as const)("rechaza price %s con INVALID_PRICE", (_label, price) => {
    expect(captureError(baseRow({ price })).code).toBe("INVALID_PRICE");
  });
});

describe("validateNormalizedOfferRow: shippingCost inválido, negativo o no finito (INVALID_SHIPPING_COST)", () => {
  it("acepta shippingCost null (ausente: la fuente no lo aporta)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ shippingCost: null }))).not.toThrow();
  });

  it("acepta shippingCost = 0 (valor límite, no negativo)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ shippingCost: 0 }))).not.toThrow();
  });

  it.each([
    ["negativo", -0.01],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ] as const)("rechaza shippingCost %s con INVALID_SHIPPING_COST", (_label, shippingCost) => {
    expect(captureError(baseRow({ shippingCost })).code).toBe("INVALID_SHIPPING_COST");
  });
});

describe("validateNormalizedOfferRow: moneda inválida (INVALID_CURRENCY)", () => {
  it.each(["EUR", "USD", "GBP"])("acepta un código de 3 letras mayúsculas válido (%s)", (currency) => {
    expect(() => validateNormalizedOfferRow(baseRow({ currency }))).not.toThrow();
  });

  it.each([
    ["minúsculas", "eur"],
    ["2 letras", "EU"],
    ["4 letras", "EURO"],
    ["con dígito", "EU1"],
    ["vacío", ""],
  ] as const)("rechaza moneda inválida (%s) con INVALID_CURRENCY", (_label, currency) => {
    expect(captureError(baseRow({ currency })).code).toBe("INVALID_CURRENCY");
  });
});

describe("validateNormalizedOfferRow: URLs inválidas (INVALID_URL)", () => {
  it("rechaza productUrl inválida con INVALID_URL", () => {
    expect(captureError(baseRow({ productUrl: "no-es-una-url" })).code).toBe("INVALID_URL");
    expect(captureError(baseRow({ productUrl: "ftp://example.invalid/x" })).code).toBe("INVALID_URL");
  });

  it("acepta http:// y https:// para las URLs obligatorias", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ productUrl: "http://example.invalid/p" }))).not.toThrow();
    expect(() => validateNormalizedOfferRow(baseRow({ productUrl: "https://example.invalid/p" }))).not.toThrow();
  });

  it.each([
    ["merchant.websiteUrl", (url: string) => ({ merchant: { slug: "comercio-prueba", name: "X", websiteUrl: url } })],
    ["merchant.logoUrl", (url: string) => ({ merchant: { slug: "comercio-prueba", name: "X", websiteUrl: "https://example.invalid", logoUrl: url } })],
    ["imageUrl", (url: string) => ({ imageUrl: url })],
    ["affiliateUrl", (url: string) => ({ affiliateUrl: url })],
  ] as const)("rechaza %s inválida (si se aporta) con INVALID_URL", (_label, buildOverrides) => {
    expect(captureError(baseRow(buildOverrides("no-es-una-url") as Partial<NormalizedOfferRow>)).code).toBe("INVALID_URL");
  });

  it("las URLs opcionales ausentes (null) nunca se validan ni rechazan la fila, incluido merchant.websiteUrl — una fuente (p. ej. el adaptador de Awin) puede no aportar jamás un sitio web de comercio fiable", () => {
    const row = baseRow({
      merchant: { slug: "comercio-prueba", name: "X", websiteUrl: null, logoUrl: null },
      imageUrl: null,
      affiliateUrl: null,
    });
    expect(() => validateNormalizedOfferRow(row)).not.toThrow();
  });
});

describe("validateNormalizedOfferRow: identificadores externos inválidos (externalId)", () => {
  it("rechaza externalId vacío con MISSING_FIELD", () => {
    expect(captureError(baseRow({ externalId: "" })).code).toBe("MISSING_FIELD");
  });

  it("acepta externalId de exactamente 120 caracteres (valor límite)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ externalId: "x".repeat(120) }))).not.toThrow();
  });

  it("rechaza externalId de 121 caracteres (justo por encima del límite) con FIELD_TOO_LONG", () => {
    expect(captureError(baseRow({ externalId: "x".repeat(121) })).code).toBe("FIELD_TOO_LONG");
  });
});

describe("validateNormalizedOfferRow: GTIN (válido, ausente e inválido) — deliberadamente NO se valida en esta capa", () => {
  // gtin.ts documenta explícitamente que un GTIN con dígito de control
  // incorrecto (o no numérico, o de longitud no reconocida) se trata como
  // "sin GTIN" en el resto del núcleo — NUNCA como un error fatal de la
  // fila completa. La validación/normalización real ocurre en
  // normalizeGtinOrNull (gtin.ts), llamado desde applyOffer.ts — no aquí.
  // Estas pruebas confirman ese diseño: los tres casos deben aceptarse por
  // igual en esta capa.
  it("acepta un GTIN sintácticamente válido (EAN-13 con dígito de control correcto)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ gtin: "5001234567890" }))).not.toThrow();
  });

  it("acepta gtin: null (la fuente no lo aporta)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ gtin: null }))).not.toThrow();
  });

  it("acepta un GTIN con formato inválido (dígito de control incorrecto, no numérico, o longitud no reconocida) sin rechazar la fila", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ gtin: "5001234567899" }))).not.toThrow(); // dígito de control incorrecto
    expect(() => validateNormalizedOfferRow(baseRow({ gtin: "no-es-un-gtin" }))).not.toThrow(); // no numérico
    expect(() => validateNormalizedOfferRow(baseRow({ gtin: "123" }))).not.toThrow(); // longitud no reconocida
  });
});

describe("validateNormalizedOfferRow: longitud de \"name\" (FIELD_TOO_LONG)", () => {
  it("acepta name de exactamente 200 caracteres (valor límite)", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ name: "x".repeat(200) }))).not.toThrow();
  });

  it("rechaza name de 201 caracteres (justo por encima del límite) con FIELD_TOO_LONG", () => {
    expect(captureError(baseRow({ name: "x".repeat(201) })).code).toBe("FIELD_TOO_LONG");
  });
});

describe("validateNormalizedOfferRow: fecha inválida (INVALID_DATE)", () => {
  it("acepta una fecha válida", () => {
    expect(() => validateNormalizedOfferRow(baseRow({ fetchedAt: new Date() }))).not.toThrow();
  });

  it("rechaza una fecha inválida (Invalid Date) con INVALID_DATE", () => {
    expect(captureError(baseRow({ fetchedAt: new Date("esto-no-es-una-fecha") })).code).toBe("INVALID_DATE");
  });
});
