import { describe, expect, it } from "vitest";
import { OfferSource } from "@/generated/prisma";
import { resolveProductMetadata, type ExistingProductMetadata } from "./metadataPolicy";

function existing(overrides: Partial<ExistingProductMetadata> = {}): ExistingProductMetadata {
  return {
    name: "Nombre existente",
    brand: null,
    model: null,
    imageUrl: null,
    ean: null,
    canonicalGtin: null,
    metadataSource: null,
    ...overrides,
  };
}

describe("resolveProductMetadata: producto sin dueño todavía", () => {
  it("la primera fuente que lo toca toma posesión de todos los campos", () => {
    const result = resolveProductMetadata(existing(), {
      source: OfferSource.EBAY,
      name: "Nombre eBay",
      brand: "MarcaX",
      model: "ModeloY",
      imageUrl: "https://example.invalid/img.jpg",
      normalizedGtin: null,
    });
    expect(result).toEqual({
      name: "Nombre eBay",
      brand: "MarcaX",
      model: "ModeloY",
      imageUrl: "https://example.invalid/img.jpg",
      ean: null,
      canonicalGtin: null,
      metadataSource: OfferSource.EBAY,
    });
  });
});

describe("resolveProductMetadata: no reemplaza contenido por valores vacíos", () => {
  it("una fuente de MENOR prioridad con campos vacíos nunca borra los valores ya existentes de la dueña", () => {
    const result = resolveProductMetadata(
      existing({ name: "Nombre bueno", brand: "MarcaBuena", model: "ModeloBueno", imageUrl: "https://example.invalid/bueno.jpg", metadataSource: OfferSource.CSV }),
      { source: OfferSource.EBAY, name: "Nombre eBay", brand: null, model: null, imageUrl: null, normalizedGtin: null }
    );
    // eBay (prioridad menor que CSV) no toma posesión: todo se mantiene igual.
    expect(result).toEqual({
      name: "Nombre bueno",
      brand: "MarcaBuena",
      model: "ModeloBueno",
      imageUrl: "https://example.invalid/bueno.jpg",
      ean: null,
      canonicalGtin: null,
      metadataSource: OfferSource.CSV,
    });
  });

  it("una fuente de menor prioridad SÍ puede rellenar un campo individual que está vacío", () => {
    const result = resolveProductMetadata(
      existing({ name: "Nombre bueno", brand: null, model: null, imageUrl: null, metadataSource: OfferSource.CSV }),
      { source: OfferSource.EBAY, name: "Nombre eBay", brand: "MarcaEbay", model: "ModeloEbay", imageUrl: "https://example.invalid/ebay.jpg", normalizedGtin: null }
    );
    expect(result).toEqual({
      name: "Nombre bueno", // name nunca cambia si no hay posesión (y nunca está vacío)
      brand: "MarcaEbay", // relleno: estaba vacío
      model: "ModeloEbay",
      imageUrl: "https://example.invalid/ebay.jpg",
      ean: null,
      canonicalGtin: null,
      metadataSource: OfferSource.CSV, // la posesión no cambia
    });
  });
});

describe("resolveProductMetadata: no oscila entre sincronizaciones alternas de distintas fuentes", () => {
  it("una fuente de MAYOR prioridad SÍ corrige/toma posesión de una de menor prioridad", () => {
    const result = resolveProductMetadata(
      existing({ name: "Nombre eBay antiguo", brand: "MarcaVieja", metadataSource: OfferSource.EBAY }),
      { source: OfferSource.AWIN, name: "Nombre Awin", brand: "MarcaNueva", model: "ModeloAwin", imageUrl: null, normalizedGtin: null }
    );
    expect(result.metadataSource).toBe(OfferSource.AWIN);
    expect(result.name).toBe("Nombre Awin");
    expect(result.brand).toBe("MarcaNueva");
  });

  it("simula sincronizaciones alternas de dos fuentes de menor/igual prioridad: el resultado se mantiene estable, no oscila", () => {
    let state = existing({ name: "Original CSV", brand: "MarcaCSV", metadataSource: OfferSource.CSV });

    // eBay sincroniza primero (prioridad menor que CSV): no debe tomar posesión.
    state = resolveProductMetadata(state, {
      source: OfferSource.EBAY,
      name: "Nombre eBay 1",
      brand: "MarcaEbay1",
      model: null,
      imageUrl: null,
      normalizedGtin: null,
    });
    expect(state.metadataSource).toBe(OfferSource.CSV);
    expect(state.name).toBe("Original CSV");

    // Awin sincroniza después (también menor prioridad que CSV): tampoco toma posesión.
    state = resolveProductMetadata(state, {
      source: OfferSource.AWIN,
      name: "Nombre Awin 1",
      brand: "MarcaAwin1",
      model: null,
      imageUrl: null,
      normalizedGtin: null,
    });
    expect(state.metadataSource).toBe(OfferSource.CSV);
    expect(state.name).toBe("Original CSV");

    // Vuelve a sincronizar eBay: el resultado sigue siendo el mismo (estable, no oscila).
    state = resolveProductMetadata(state, {
      source: OfferSource.EBAY,
      name: "Nombre eBay 2",
      brand: "MarcaEbay2",
      model: null,
      imageUrl: null,
      normalizedGtin: null,
    });
    expect(state.metadataSource).toBe(OfferSource.CSV);
    expect(state.name).toBe("Original CSV");
  });

  it("la misma fuente dueña actualiza sus propios valores en cada sincronización", () => {
    let state = existing({ name: "eBay v1", brand: "MarcaV1", metadataSource: OfferSource.EBAY });
    state = resolveProductMetadata(state, {
      source: OfferSource.EBAY,
      name: "eBay v2",
      brand: "MarcaV2",
      model: "ModeloV2",
      imageUrl: null,
      normalizedGtin: null,
    });
    expect(state).toEqual({
      name: "eBay v2",
      brand: "MarcaV2",
      model: "ModeloV2",
      imageUrl: null,
      ean: null,
      canonicalGtin: null,
      metadataSource: OfferSource.EBAY,
    });
  });
});

describe("resolveProductMetadata: ean (GTIN) — solo se rellena, nunca se sobrescribe", () => {
  it("rellena el ean si estaba vacío, incluso sin tomar posesión de los demás campos", () => {
    const result = resolveProductMetadata(
      existing({ name: "Nombre bueno", ean: null, metadataSource: OfferSource.CSV }),
      { source: OfferSource.EBAY, name: "x", brand: null, model: null, imageUrl: null, normalizedGtin: "00036000291452" }
    );
    expect(result.ean).toBe("00036000291452");
    expect(result.metadataSource).toBe(OfferSource.CSV); // sigue sin tomar posesión de los demás campos
  });

  it("nunca sobrescribe un ean ya guardado, aunque llegue uno distinto de una fuente de mayor prioridad", () => {
    const result = resolveProductMetadata(
      existing({ ean: "00000000000001", metadataSource: OfferSource.EBAY }),
      { source: OfferSource.CSV, name: "x", brand: null, model: null, imageUrl: null, normalizedGtin: "00000000000002" }
    );
    expect(result.ean).toBe("00000000000001");
  });
});

describe("resolveProductMetadata: canonicalGtin — misma regla backfill-only, en paralelo con ean", () => {
  it("rellena canonicalGtin si estaba vacío, incluso sin tomar posesión de los demás campos", () => {
    const result = resolveProductMetadata(
      existing({ name: "Nombre bueno", canonicalGtin: null, metadataSource: OfferSource.CSV }),
      { source: OfferSource.EBAY, name: "x", brand: null, model: null, imageUrl: null, normalizedGtin: "00036000291452" }
    );
    expect(result.canonicalGtin).toBe("00036000291452");
    expect(result.ean).toBe("00036000291452"); // se mantienen en paralelo
    expect(result.metadataSource).toBe(OfferSource.CSV);
  });

  it("nunca sobrescribe un canonicalGtin ya guardado, aunque llegue uno distinto de una fuente de mayor prioridad", () => {
    const result = resolveProductMetadata(
      existing({ ean: "00000000000001", canonicalGtin: "00000000000001", metadataSource: OfferSource.EBAY }),
      { source: OfferSource.CSV, name: "x", brand: null, model: null, imageUrl: null, normalizedGtin: "00000000000002" }
    );
    expect(result.canonicalGtin).toBe("00000000000001");
    expect(result.ean).toBe("00000000000001");
  });

  it("ean y canonicalGtin pueden resolverse de forma independiente (uno ya establecido, el otro no)", () => {
    // Caso posible tras una migración de datos históricos: un producto con
    // `ean` heredado del CSV, pero sin `canonicalGtin` propio todavía.
    const result = resolveProductMetadata(
      existing({ ean: "00000000000009", canonicalGtin: null, metadataSource: OfferSource.CSV }),
      { source: OfferSource.EBAY, name: "x", brand: null, model: null, imageUrl: null, normalizedGtin: "00036000291452" }
    );
    expect(result.ean).toBe("00000000000009"); // ya tenía valor: no se toca
    expect(result.canonicalGtin).toBe("00036000291452"); // estaba vacío: se rellena con lo entrante
  });
});
