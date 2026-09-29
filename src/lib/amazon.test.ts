import { afterEach, describe, expect, it } from "vitest";
import { buildAmazonAffiliateUrl } from "./amazon";

const ORIGINAL_TAG = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;

afterEach(() => {
  if (ORIGINAL_TAG === undefined) delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
  else process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = ORIGINAL_TAG;
});

describe("buildAmazonAffiliateUrl", () => {
  it("construye la URL de afiliado con el tag configurado y un ASIN válido", () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = "preciaraes-21";
    expect(buildAmazonAffiliateUrl("B08N5WRWNW")).toBe("https://www.amazon.es/dp/B08N5WRWNW?tag=preciaraes-21");
  });

  it("normaliza el ASIN a mayúsculas y quita espacios", () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = "preciaraes-21";
    expect(buildAmazonAffiliateUrl(" b08n5wrwnw ")).toBe("https://www.amazon.es/dp/B08N5WRWNW?tag=preciaraes-21");
  });

  it("devuelve null sin NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG configurado: nunca inventa un tag", () => {
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
    expect(buildAmazonAffiliateUrl("B08N5WRWNW")).toBeNull();
  });

  it("devuelve null con un tag vacío (solo espacios)", () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = "   ";
    expect(buildAmazonAffiliateUrl("B08N5WRWNW")).toBeNull();
  });

  it.each([
    ["vacío", ""],
    ["demasiado corto", "B08N5WR"],
    ["demasiado largo", "B08N5WRWNWXX"],
    ["con caracteres no alfanuméricos", "B08N5-RWNW"],
  ] as const)("devuelve null con un ASIN inválido (%s): nunca construye un enlace roto", (_label, asin) => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = "preciaraes-21";
    expect(buildAmazonAffiliateUrl(asin)).toBeNull();
  });
});
