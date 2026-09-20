import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  effectiveOfferUrl,
  iconForCategorySlug,
  relativeLabel,
  toLegacyOffer,
  toPricePoint,
} from "./transform";

describe("effectiveOfferUrl", () => {
  it("prioriza affiliateUrl sobre productUrl cuando ambos existen", () => {
    const url = effectiveOfferUrl({
      productUrl: "https://tienda.example.invalid/producto",
      affiliateUrl: "https://tienda.example.invalid/aff/producto",
    });
    expect(url).toBe("https://tienda.example.invalid/aff/producto");
  });

  it("usa productUrl cuando no hay affiliateUrl", () => {
    const url = effectiveOfferUrl({ productUrl: "https://tienda.example.invalid/producto", affiliateUrl: null });
    expect(url).toBe("https://tienda.example.invalid/producto");
  });

  it("rechaza esquemas no http(s) y devuelve un valor neutral", () => {
    const url = effectiveOfferUrl({ productUrl: "javascript:alert(1)", affiliateUrl: null });
    expect(url).toBe("#");
  });

  it("rechaza una URL malformada y devuelve un valor neutral", () => {
    const url = effectiveOfferUrl({ productUrl: "no-es-una-url", affiliateUrl: null });
    expect(url).toBe("#");
  });
});

describe("relativeLabel", () => {
  it("etiqueta en minutos por debajo de una hora", () => {
    const date = new Date(Date.now() - 5 * 60_000);
    expect(relativeLabel(date)).toBe("hace 5 min");
  });

  it("etiqueta en horas por debajo de un día", () => {
    const date = new Date(Date.now() - 3 * 3_600_000);
    expect(relativeLabel(date)).toBe("hace 3 h");
  });

  it("etiqueta en días para fechas más antiguas", () => {
    const date = new Date(Date.now() - 5 * 86_400_000);
    expect(relativeLabel(date)).toBe("hace 5 d");
  });

  it("nunca da un número negativo (fecha futura por reloj desincronizado)", () => {
    const date = new Date(Date.now() + 5_000);
    expect(relativeLabel(date)).not.toMatch(/-/);
  });
});

describe("iconForCategorySlug", () => {
  it("devuelve el icono esperado para una categoría conocida", () => {
    expect(iconForCategorySlug("tecnologia")).toBe("Laptop");
  });

  it("devuelve un icono neutral por defecto para una categoría desconocida (nunca inventa uno específico)", () => {
    expect(iconForCategorySlug("categoria-inexistente")).toBe("Tag");
  });
});

describe("toPricePoint", () => {
  it("convierte Decimal/number a number sin pérdida para importes de 2 decimales", () => {
    const point = toPricePoint({ price: 199.99, recordedAt: new Date("2026-01-15T00:00:00Z") });
    expect(point.price).toBe(199.99);
    expect(point.date).toBe("2026-01-15T00:00:00.000Z");
    expect(point.label.length).toBeGreaterThan(0);
  });

  it("capitaliza la etiqueta de mes (formato coherente con los datos de demo)", () => {
    const point = toPricePoint({ price: 10, recordedAt: new Date("2026-01-15T00:00:00Z") });
    expect(point.label[0]).toBe(point.label[0].toUpperCase());
  });
});

describe("toLegacyOffer: conversión Decimal -> number sin pérdida", () => {
  function baseOffer(overrides: Partial<Parameters<typeof toLegacyOffer>[0]> = {}) {
    return {
      id: 1,
      merchant: { id: 1, slug: "tienda-x", name: "Tienda X" },
      currentPrice: new Prisma.Decimal("129.90"),
      previousPrice: new Prisma.Decimal("149.90"),
      productUrl: "https://tienda-x.example.invalid/p",
      affiliateUrl: null,
      availability: "IN_STOCK",
      lastCheckedAt: new Date(),
      ...overrides,
    } as Parameters<typeof toLegacyOffer>[0];
  }

  it("convierte currentPrice/previousPrice preservando los céntimos exactos", () => {
    const offer = toLegacyOffer(baseOffer());
    expect(offer.price).toBe(129.9);
    expect(offer.previousPrice).toBe(149.9);
  });

  it("previousPrice queda undefined (no null) cuando no existe, como espera el tipo Offer", () => {
    const offer = toLegacyOffer(baseOffer({ previousPrice: null }));
    expect(offer.previousPrice).toBeUndefined();
  });

  it("inStock refleja availability === IN_STOCK", () => {
    expect(toLegacyOffer(baseOffer({ availability: "IN_STOCK" })).inStock).toBe(true);
    expect(toLegacyOffer(baseOffer({ availability: "OUT_OF_STOCK" })).inStock).toBe(false);
  });

  it("nunca marca verified=true sobre datos reales (sin proceso editorial todavía)", () => {
    expect(toLegacyOffer(baseOffer()).verified).toBe(false);
  });

  it("merchantId usa el slug del comercio, no su id numérico interno", () => {
    expect(toLegacyOffer(baseOffer()).merchantId).toBe("tienda-x");
  });
});
