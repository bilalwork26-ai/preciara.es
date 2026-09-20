import { describe, expect, it } from "vitest";
import { parseDecimalField, validateRow, RowValidationError } from "./validate";
import { Availability } from "@/generated/prisma";

describe("parseDecimalField", () => {
  it("parses a plain dot decimal", () => {
    expect(parseDecimalField("19.99", "price", { required: true })).toBe(19.99);
  });

  it("normalizes a Spanish comma decimal", () => {
    expect(parseDecimalField("19,99", "price", { required: true })).toBe(19.99);
  });

  it("normalizes a thousands-dot + comma-decimal number", () => {
    expect(parseDecimalField("1.234,56", "price", { required: true })).toBe(1234.56);
  });

  it("normalizes a thousands-comma + dot-decimal number", () => {
    expect(parseDecimalField("1,234.56", "price", { required: true })).toBe(1234.56);
  });

  it("returns null for an empty optional field", () => {
    expect(parseDecimalField("", "shipping_cost", { required: false })).toBeNull();
  });

  it("throws on an empty required field", () => {
    expect(() => parseDecimalField("", "price", { required: true })).toThrow(RowValidationError);
  });

  it("rejects a negative price", () => {
    expect(() => parseDecimalField("-5", "price", { required: true })).toThrow(/no puede ser negativo/);
  });

  it("rejects a non-numeric value", () => {
    expect(() => parseDecimalField("abc", "price", { required: true })).toThrow(/no es un número válido/);
  });

  it("accepts zero", () => {
    expect(parseDecimalField("0", "shipping_cost", { required: true })).toBe(0);
  });
});

function baseRecord(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    category_slug: "tecnologia",
    category_name: "Tecnología",
    product_slug: "producto-x",
    product_name: "Producto X",
    brand: "",
    model: "",
    ean: "",
    image_url: "",
    merchant_slug: "tienda-x",
    merchant_name: "Tienda X",
    merchant_url: "https://tienda-x.example.invalid",
    external_offer_id: "",
    price: "19.99",
    previous_price: "",
    currency: "EUR",
    availability: "in_stock",
    shipping_cost: "",
    product_url: "https://tienda-x.example.invalid/producto-x",
    affiliate_url: "",
    last_checked_at: "",
    ...overrides,
  };
}

describe("validateRow", () => {
  it("normalizes a fully valid row", () => {
    const row = validateRow(baseRecord());
    expect(row.categorySlug).toBe("tecnologia");
    expect(row.price).toBe(19.99);
    expect(row.availability).toBe(Availability.IN_STOCK);
    expect(row.currency).toBe("EUR");
    expect(row.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("rejects a missing required column entirely", () => {
    const record = baseRecord();
    delete (record as Record<string, string | undefined>).merchant_url;
    expect(() => validateRow(record)).toThrow(/Falta la columna/);
  });

  it("rejects an invalid slug", () => {
    expect(() => validateRow(baseRecord({ product_slug: "Producto Con Espacios" }))).toThrow(/minúsculas/);
  });

  it("rejects a non-http(s) URL", () => {
    expect(() => validateRow(baseRecord({ product_url: "javascript:alert(1)" }))).toThrow(/http/);
  });

  it("rejects a malformed URL", () => {
    expect(() => validateRow(baseRecord({ merchant_url: "not-a-url" }))).toThrow(RowValidationError);
  });

  it("rejects an unrecognized availability value", () => {
    expect(() => validateRow(baseRecord({ availability: "quizas" }))).toThrow(/no reconocido/);
  });

  it("accepts Spanish availability aliases", () => {
    expect(validateRow(baseRecord({ availability: "agotado" })).availability).toBe(Availability.OUT_OF_STOCK);
    expect(validateRow(baseRecord({ availability: "disponible" })).availability).toBe(Availability.IN_STOCK);
  });

  it("defaults currency to EUR when empty", () => {
    expect(validateRow(baseRecord({ currency: "" })).currency).toBe("EUR");
  });

  it("rejects an invalid currency code", () => {
    expect(() => validateRow(baseRecord({ currency: "euros" }))).toThrow(/3 letras/);
  });

  it("rejects a negative price", () => {
    expect(() => validateRow(baseRecord({ price: "-10" }))).toThrow(RowValidationError);
  });

  it("rejects an invalid last_checked_at date", () => {
    expect(() => validateRow(baseRecord({ last_checked_at: "not-a-date" }))).toThrow(/fecha válida/);
  });

  it("defaults last_checked_at to now when empty", () => {
    const before = Date.now();
    const row = validateRow(baseRecord({ last_checked_at: "" }));
    expect(row.lastCheckedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
