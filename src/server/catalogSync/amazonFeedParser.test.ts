import { describe, expect, it, afterEach } from "vitest";
import { Availability, OfferSource } from "@/generated/prisma";
import { AMAZON_ES_MERCHANT, parseAmazonItems, type AmazonPaapiItem } from "./amazonFeedParser";

const ORIGINAL_TAG = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
afterEach(() => {
  if (ORIGINAL_TAG === undefined) delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
  else process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = ORIGINAL_TAG;
});

function item(overrides: Partial<AmazonPaapiItem> = {}): AmazonPaapiItem {
  return {
    ASIN: "B08N5WRWNW",
    DetailPageURL: "https://www.amazon.es/dp/B08N5WRWNW",
    Images: { Primary: { Large: { URL: "https://m.media-amazon.com/images/I/example.jpg" } } },
    ItemInfo: {
      Title: { DisplayValue: "Zapatilla Ejemplo" },
      ByLineInfo: { Brand: { DisplayValue: "MarcaX" } },
      Classifications: { ProductGroup: { DisplayValue: "Shoes" } },
      ExternalIds: { EANs: { DisplayValues: ["04006632423456"] } },
    },
    Offers: {
      Listings: [{ Price: { Amount: 59.99, Currency: "EUR" }, Availability: { Type: "Now", Message: "En stock." } }],
    },
    ...overrides,
  };
}

function valid(results: ReturnType<typeof parseAmazonItems>) {
  return results.filter((r) => r.status === "valid");
}
function invalid(results: ReturnType<typeof parseAmazonItems>) {
  return results.filter((r) => r.status === "invalid");
}

describe("parseAmazonItems: artículo válido", () => {
  it("normaliza un artículo completo con OfferSource.AMAZON, GTIN, imagen hotlinked y enlace de afiliado con el tag configurado", () => {
    process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG = "preciaraes-21";
    const results = parseAmazonItems([item()], { fetchedAt: new Date("2026-09-29T10:00:00.000Z") });
    expect(invalid(results)).toHaveLength(0);
    const [result] = valid(results);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.row).toEqual({
      source: OfferSource.AMAZON,
      merchant: AMAZON_ES_MERCHANT,
      externalId: "B08N5WRWNW",
      gtin: "04006632423456",
      name: "Zapatilla Ejemplo",
      brand: "MarcaX",
      model: null,
      category: { slug: expect.any(String), name: expect.any(String) },
      imageUrl: "https://m.media-amazon.com/images/I/example.jpg",
      price: 59.99,
      shippingCost: null,
      currency: "EUR",
      availability: Availability.IN_STOCK,
      productUrl: "https://www.amazon.es/dp/B08N5WRWNW",
      affiliateUrl: "https://www.amazon.es/dp/B08N5WRWNW?tag=preciaraes-21",
      fetchedAt: new Date("2026-09-29T10:00:00.000Z"),
    });
  });

  it("usa UPC como respaldo cuando no hay EAN", () => {
    const results = parseAmazonItems([
      item({ ItemInfo: { ...item().ItemInfo, ExternalIds: { UPCs: { DisplayValues: ["012345678905"] } } } }),
    ]);
    const [result] = valid(results);
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.gtin).toBe("012345678905");
  });

  it("sin ningún identificador externo, gtin es null (nunca se inventa)", () => {
    const results = parseAmazonItems([item({ ItemInfo: { ...item().ItemInfo, ExternalIds: undefined } })]);
    const [result] = valid(results);
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.gtin).toBeNull();
  });

  it("sin NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG configurado, affiliateUrl es null pero la fila sigue siendo válida (productUrl es DetailPageURL)", () => {
    delete process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;
    const results = parseAmazonItems([item()]);
    const [result] = valid(results);
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.affiliateUrl).toBeNull();
    expect(result.row.productUrl).toBe("https://www.amazon.es/dp/B08N5WRWNW");
  });

  it("sin DetailPageURL, construye productUrl a partir del ASIN en vez de dejarlo vacío", () => {
    const results = parseAmazonItems([item({ DetailPageURL: undefined })]);
    const [result] = valid(results);
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.productUrl).toBe("https://www.amazon.es/dp/B08N5WRWNW");
  });

  it("mapea Availability.Type: 'Now' → IN_STOCK, 'OutOfStock' → OUT_OF_STOCK, valor ausente/desconocido → UNKNOWN (nunca asume en stock)", () => {
    const [inStock] = valid(parseAmazonItems([item({ Offers: { Listings: [{ Price: { Amount: 10, Currency: "EUR" }, Availability: { Type: "Now" } }] } })]));
    const [outOfStock] = valid(parseAmazonItems([item({ Offers: { Listings: [{ Price: { Amount: 10, Currency: "EUR" }, Availability: { Type: "OutOfStock" } }] } })]));
    const [unknown] = valid(parseAmazonItems([item({ Offers: { Listings: [{ Price: { Amount: 10, Currency: "EUR" }, Availability: undefined }] } })]));
    if (inStock.status !== "valid" || outOfStock.status !== "valid" || unknown.status !== "valid") throw new Error("expected valid");
    expect(inStock.row.availability).toBe(Availability.IN_STOCK);
    expect(outOfStock.row.availability).toBe(Availability.OUT_OF_STOCK);
    expect(unknown.row.availability).toBe(Availability.UNKNOWN);
  });

  it("model siempre es null (PA-API no aporta un campo de modelo fiable): nunca se rellena con Brand ni otro campo", () => {
    const [result] = valid(parseAmazonItems([item()]));
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.model).toBeNull();
  });

  it("shippingCost siempre es null (PA-API no aporta un importe de envío fiable)", () => {
    const [result] = valid(parseAmazonItems([item()]));
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.shippingCost).toBeNull();
  });

  it("merchant es siempre AMAZON_ES_MERCHANT, sin importar el contenido del artículo", () => {
    const [result] = valid(parseAmazonItems([item()]));
    if (result.status !== "valid") throw new Error("expected valid");
    expect(result.row.merchant).toEqual(AMAZON_ES_MERCHANT);
  });
});

describe("parseAmazonItems: artículos inválidos, sin interrumpir el resto del lote", () => {
  it("rechaza un artículo sin ASIN sin abortar el resto del lote", () => {
    const results = parseAmazonItems([item({ ASIN: "" }), item({ ASIN: "B000000002" })]);
    expect(invalid(results)).toHaveLength(1);
    expect(valid(results)).toHaveLength(1);
  });

  it("rechaza un artículo sin título", () => {
    const results = parseAmazonItems([item({ ItemInfo: { ...item().ItemInfo, Title: undefined } })]);
    expect(invalid(results)).toHaveLength(1);
    expect(invalid(results)[0]).toMatchObject({ code: "MISSING_FIELD", asin: "B08N5WRWNW" });
  });

  it("rechaza un artículo sin ninguna oferta comprable (Offers ausente): nunca inventa un precio", () => {
    const results = parseAmazonItems([item({ Offers: undefined })]);
    expect(invalid(results)).toHaveLength(1);
    expect(invalid(results)[0]).toMatchObject({ code: "MISSING_FIELD" });
  });

  it("rechaza un artículo con Offers.Listings vacío", () => {
    const results = parseAmazonItems([item({ Offers: { Listings: [] } })]);
    expect(invalid(results)).toHaveLength(1);
  });

  it("rechaza un artículo sin Price.Amount", () => {
    const results = parseAmazonItems([item({ Offers: { Listings: [{ Availability: { Type: "Now" } }] } })]);
    expect(invalid(results)).toHaveLength(1);
  });
});
