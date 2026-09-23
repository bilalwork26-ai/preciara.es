import { describe, expect, it } from "vitest";
import { Availability, OfferSource } from "@/generated/prisma";
import { AwinFeedFatalError, parseAwinProductFeed, type AwinFeedRowResult } from "./awinFeedParser";
import { StreamingCsvTruncatedError, chunked } from "./streamingCsv";
import type { NormalizedMerchant } from "./types";

const MERCHANT_A: NormalizedMerchant = { slug: "tienda-a", name: "Tienda A", websiteUrl: "https://tienda-a.example.invalid" };
const MERCHANT_B: NormalizedMerchant = { slug: "tienda-b", name: "Tienda B", websiteUrl: "https://tienda-b.example.invalid" };

const FULL_HEADER =
  "aw_product_id,merchant_product_id,product_name,brand_name,product_model,model_number,merchant_category,merchant_image_url,aw_image_url,large_image,image_url,search_price,currency,delivery_cost,merchant_deep_link,aw_deep_link,in_stock,product_GTIN,ean,upc";

/** Entrecomilla un valor al estilo RFC 4180 si contiene coma, comilla o salto de línea (duplicando las comillas internas); si no, lo deja tal cual. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function row(fields: Record<string, string>): string {
  const header = FULL_HEADER.split(",");
  return header.map((col) => csvField(fields[col] ?? "")).join(",");
}

async function collect(csv: string, merchant: NormalizedMerchant = MERCHANT_A): Promise<AwinFeedRowResult[]> {
  const results: AwinFeedRowResult[] = [];
  for await (const result of parseAwinProductFeed(csv, { merchant, fetchedAt: new Date("2026-09-22T10:00:00.000Z") })) {
    results.push(result);
  }
  return results;
}

function valid(results: AwinFeedRowResult[]): Extract<AwinFeedRowResult, { status: "valid" }>[] {
  return results.filter((r): r is Extract<AwinFeedRowResult, { status: "valid" }> => r.status === "valid");
}
function invalid(results: AwinFeedRowResult[]): Extract<AwinFeedRowResult, { status: "invalid" }>[] {
  return results.filter((r): r is Extract<AwinFeedRowResult, { status: "invalid" }> => r.status === "invalid");
}

describe("parseAwinProductFeed: feed válido con varias tiendas y productos", () => {
  it("varios productos del MISMO feed se etiquetan con el mismo comercio del contexto", async () => {
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: "Producto uno", merchant_category: "Electrónica", search_price: "19.99", currency: "EUR", aw_deep_link: "https://x.invalid/1" }),
      row({ aw_product_id: "2", product_name: "Producto dos", merchant_category: "Electrónica", search_price: "29.99", currency: "EUR", aw_deep_link: "https://x.invalid/2" }),
    ].join("\n");
    const results = valid(await collect(csv, MERCHANT_A));
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.row.merchant).toEqual(MERCHANT_A);
      expect(r.row.source).toBe(OfferSource.AWIN);
    }
    expect(results.map((r) => r.row.externalId)).toEqual(["1", "2"]);
  });

  it("dos feeds distintos (dos tiendas descargadas por separado) etiquetan cada uno con su propio comercio — un feed de Awin es siempre de UN solo comercio", async () => {
    const csvA = [FULL_HEADER, row({ aw_product_id: "a1", product_name: "Producto A", merchant_category: "Hogar", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/a1" })].join("\n");
    const csvB = [FULL_HEADER, row({ aw_product_id: "b1", product_name: "Producto B", merchant_category: "Hogar", search_price: "20", currency: "EUR", aw_deep_link: "https://x.invalid/b1" })].join("\n");

    const resultsA = valid(await collect(csvA, MERCHANT_A));
    const resultsB = valid(await collect(csvB, MERCHANT_B));
    expect(resultsA[0].row.merchant).toEqual(MERCHANT_A);
    expect(resultsB[0].row.merchant).toEqual(MERCHANT_B);
  });
});

describe("parseAwinProductFeed: comas, comillas, saltos de línea y Unicode dentro de campos", () => {
  it("un nombre de producto con comas y comillas dentro (campo entre comillas RFC 4180) se interpreta como un único valor", async () => {
    const trickyName = `"Pantalla 24'', HD" — edición especial, con coma`;
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: trickyName, merchant_category: "Electrónica", search_price: "19.99", currency: "EUR", aw_deep_link: "https://x.invalid/1" }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results).toHaveLength(1);
    expect(results[0].row.name).toBe(trickyName);
  });

  it("un campo con salto de línea dentro de comillas se conserva íntegro", async () => {
    const nameWithNewline = "Producto\ncon salto de línea en el nombre";
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: nameWithNewline, merchant_category: "Electrónica", search_price: "19.99", currency: "EUR", aw_deep_link: "https://x.invalid/1" }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.name).toBe(nameWithNewline);
  });

  it("caracteres Unicode (acentos, eñes, emoji, CJK) se preservan intactos en el nombre y la marca", async () => {
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: "Cámara réflex 📷 日本語", brand_name: "Marca Ñoño", merchant_category: "Fotografía", search_price: "199.99", currency: "EUR", aw_deep_link: "https://x.invalid/1" }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.name).toBe("Cámara réflex 📷 日本語");
    expect(results[0].row.brand).toBe("Marca Ñoño");
  });
});

describe("parseAwinProductFeed: campos opcionales ausentes", () => {
  it("brand, model, imageUrl, shippingCost y gtin ausentes (columnas vacías) producen null, sin rechazar la fila", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "Producto mínimo", merchant_category: "Varios", search_price: "5", currency: "EUR", aw_deep_link: "https://tienda-a.example.invalid/p/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results).toHaveLength(1);
    const r = results[0].row;
    expect(r.brand).toBeNull();
    expect(r.model).toBeNull();
    expect(r.imageUrl).toBeNull();
    expect(r.shippingCost).toBeNull();
    expect(r.gtin).toBeNull();
  });

  it("una cabecera que ni siquiera incluye columnas opcionales (brand_name, model_number...) sigue produciendo filas válidas", async () => {
    const minimalHeader = "aw_product_id,product_name,merchant_category,search_price,currency,aw_deep_link";
    const csv = [minimalHeader, "1,Producto sin opcionales,Varios,5,EUR,https://tienda-a.example.invalid/p/1"].join("\n");
    const results = valid(await collect(csv));
    expect(results).toHaveLength(1);
    expect(results[0].row.brand).toBeNull();
    expect(results[0].row.gtin).toBeNull();
  });
});

describe("parseAwinProductFeed: precio y moneda, válidos e inválidos", () => {
  it("acepta un precio con coma decimal (formato europeo habitual)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "19,99", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.price).toBe(19.99);
  });

  it("normaliza una moneda en minúsculas a mayúsculas (no la rechaza)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "eur", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.currency).toBe("EUR");
  });

  it("rechaza (fila inválida, no fatal) un precio negativo", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "-5", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(valid(results)).toHaveLength(0);
    expect(invalid(results)[0].code).toBe("NEGATIVE_PRICE");
  });

  it("rechaza (fila inválida, no fatal) un precio no numérico", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "no-es-un-numero", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results)[0].code).toBe("INVALID_NUMBER");
  });

  it("rechaza (fila inválida, no fatal) una moneda con un código que no son 3 letras", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EU1", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results)[0].code).toBe("INVALID_CURRENCY");
  });

  it("rechaza (fila inválida, no fatal) una fila sin precio", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results)[0].code).toBe("MISSING_FIELD");
  });
});

describe("parseAwinProductFeed: prioridad GTIN determinista entre product_GTIN, ean y upc", () => {
  const EAN_13 = "5001234567890";
  const UPC_12 = "036000291452";
  const GTIN_14 = "12345678901231";

  it("con las tres columnas presentes, gana product_GTIN", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", product_GTIN: GTIN_14, ean: EAN_13, upc: UPC_12 })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.gtin).toBe(GTIN_14);
  });

  it("sin product_GTIN pero con ean y upc, gana ean", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", ean: EAN_13, upc: UPC_12 })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.gtin).toBe(EAN_13);
  });

  it("solo con upc presente, se usa upc", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", upc: UPC_12 })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.gtin).toBe(UPC_12);
  });

  it("sin ninguna de las tres columnas con valor, gtin es null (nunca se inventa)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.gtin).toBeNull();
  });

  it("el valor de gtin se conserva EN BRUTO, sin normalizar aquí (la normalización real es responsabilidad de gtin.ts, más adelante)", async () => {
    // "0123" no es un GTIN válido (longitud no reconocida), pero esta capa
    // nunca lo valida ni lo rechaza por eso: se conserva tal cual.
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", ean: "0123" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.gtin).toBe("0123");
  });

  it("product_GTIN es la PRIMERA opción confirmada en la documentación oficial de Awin (Product Feed List Download): con las tres columnas presentes, siempre gana sobre ean y upc, aunque estos también tengan un GTIN sintácticamente válido", async () => {
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", product_GTIN: GTIN_14, ean: EAN_13, upc: UPC_12 }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.gtin).toBe(GTIN_14);
    expect(results[0].row.gtin).not.toBe(EAN_13);
    expect(results[0].row.gtin).not.toBe(UPC_12);
  });
});

describe("parseAwinProductFeed: prioridad determinista de las columnas de imagen (merchant_image_url > aw_image_url > large_image > image_url)", () => {
  it("con las cuatro columnas presentes, gana merchant_image_url", async () => {
    const csv = [
      FULL_HEADER,
      row({
        aw_product_id: "1",
        product_name: "P",
        merchant_category: "C",
        search_price: "10",
        currency: "EUR",
        aw_deep_link: "https://x.invalid/1",
        merchant_image_url: "https://x.invalid/merchant.jpg",
        aw_image_url: "https://x.invalid/aw.jpg",
        large_image: "https://x.invalid/large.jpg",
        image_url: "https://x.invalid/generic.jpg",
      }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.imageUrl).toBe("https://x.invalid/merchant.jpg");
  });

  it("sin merchant_image_url, gana aw_image_url", async () => {
    const csv = [
      FULL_HEADER,
      row({
        aw_product_id: "1",
        product_name: "P",
        merchant_category: "C",
        search_price: "10",
        currency: "EUR",
        aw_deep_link: "https://x.invalid/1",
        aw_image_url: "https://x.invalid/aw.jpg",
        large_image: "https://x.invalid/large.jpg",
        image_url: "https://x.invalid/generic.jpg",
      }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.imageUrl).toBe("https://x.invalid/aw.jpg");
  });

  it("sin merchant_image_url ni aw_image_url, gana large_image", async () => {
    const csv = [
      FULL_HEADER,
      row({
        aw_product_id: "1",
        product_name: "P",
        merchant_category: "C",
        search_price: "10",
        currency: "EUR",
        aw_deep_link: "https://x.invalid/1",
        large_image: "https://x.invalid/large.jpg",
        image_url: "https://x.invalid/generic.jpg",
      }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.imageUrl).toBe("https://x.invalid/large.jpg");
  });

  it("image_url funciona SOLO como alias de compatibilidad final: se usa únicamente cuando ninguna de las tres columnas oficiales tiene valor", async () => {
    const csv = [
      FULL_HEADER,
      row({
        aw_product_id: "1",
        product_name: "P",
        merchant_category: "C",
        search_price: "10",
        currency: "EUR",
        aw_deep_link: "https://x.invalid/1",
        image_url: "https://x.invalid/generic.jpg",
      }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.imageUrl).toBe("https://x.invalid/generic.jpg");
  });

  it("cada columna de imagen probada de forma AISLADA (las otras tres ausentes) se usa correctamente", async () => {
    const columns = ["merchant_image_url", "aw_image_url", "large_image", "image_url"] as const;
    for (const column of columns) {
      const url = `https://x.invalid/${column}.jpg`;
      const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", [column]: url })].join("\n");
      const results = valid(await collect(csv));
      expect(results[0].row.imageUrl).toBe(url);
    }
  });

  it("sin ninguna de las cuatro columnas de imagen, imageUrl es null (nunca se inventa)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.imageUrl).toBeNull();
  });
});

describe("parseAwinProductFeed: modelo — product_model primero, model_number como alias de compatibilidad", () => {
  it("con product_model presente, se usa esa columna", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", product_model: "MOD-OFICIAL-123" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.model).toBe("MOD-OFICIAL-123");
  });

  it("sin product_model, recurre a model_number (alias de compatibilidad)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", model_number: "MOD-LEGADO-456" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.model).toBe("MOD-LEGADO-456");
  });

  it("con ambas columnas presentes, gana product_model sobre model_number", async () => {
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", product_model: "MOD-OFICIAL-123", model_number: "MOD-LEGADO-456" }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.model).toBe("MOD-OFICIAL-123");
    expect(results[0].row.model).not.toBe("MOD-LEGADO-456");
  });

  it("sin ninguna de las dos columnas, model es null", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.model).toBeNull();
  });
});

describe("parseAwinProductFeed: URL afiliada y URL directa", () => {
  it("con merchant_deep_link y aw_deep_link distintos, productUrl usa la directa y affiliateUrl la de afiliado", async () => {
    const csv = [
      FULL_HEADER,
      row({
        aw_product_id: "1",
        product_name: "P",
        merchant_category: "C",
        search_price: "10",
        currency: "EUR",
        merchant_deep_link: "https://tienda-a.example.invalid/producto-directo",
        aw_deep_link: "https://awin.example.invalid/click?id=abc",
      }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.productUrl).toBe("https://tienda-a.example.invalid/producto-directo");
    expect(results[0].row.affiliateUrl).toBe("https://awin.example.invalid/click?id=abc");
  });

  it("sin merchant_deep_link, productUrl recurre al enlace de afiliado (nunca se inventa una URL nueva)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://awin.example.invalid/click?id=xyz" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.productUrl).toBe("https://awin.example.invalid/click?id=xyz");
    expect(results[0].row.affiliateUrl).toBe("https://awin.example.invalid/click?id=xyz");
  });

  it("sin ninguna URL en absoluto, la fila se rechaza (productUrl es obligatoria)", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR" })].join("\n");
    const results = await collect(csv);
    expect(valid(results)).toHaveLength(0);
    expect(invalid(results)[0].code).toBe("INVALID_URL");
  });
});

describe("parseAwinProductFeed: filas vacías", () => {
  it("líneas completamente en blanco entre filas de datos se omiten, sin afectar a las filas válidas", async () => {
    const csv = [
      FULL_HEADER,
      row({ aw_product_id: "1", product_name: "Uno", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" }),
      "",
      "",
      row({ aw_product_id: "2", product_name: "Dos", merchant_category: "C", search_price: "20", currency: "EUR", aw_deep_link: "https://x.invalid/2" }),
    ].join("\n");
    const results = valid(await collect(csv));
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.row.externalId)).toEqual(["1", "2"]);
  });
});

describe("parseAwinProductFeed: encabezados ausentes (error FATAL de feed, no de fila)", () => {
  it("un feed completamente vacío (sin cabecera ni datos) lanza AwinFeedFatalError, nunca se trata como un feed vacío válido", async () => {
    await expect(async () => {
      for await (const _ of parseAwinProductFeed("", { merchant: MERCHANT_A })) void _;
    }).rejects.toThrow(AwinFeedFatalError);
  });

  it("una cabecera presente pero sin ninguna de las columnas mínimas esperadas también es un error fatal (MISSING_REQUIRED_COLUMNS)", async () => {
    const csv = "columna_irrelevante_1,columna_irrelevante_2\nvalor1,valor2";
    let caught: unknown;
    try {
      for await (const _ of parseAwinProductFeed(csv, { merchant: MERCHANT_A })) void _;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinFeedFatalError);
    expect((caught as AwinFeedFatalError).code).toBe("MISSING_REQUIRED_COLUMNS");
  });

  it("una cabecera con SOLO product_name (sin ID ni precio) también es fatal", async () => {
    const csv = "product_name\nAlgo";
    await expect(async () => {
      for await (const _ of parseAwinProductFeed(csv, { merchant: MERCHANT_A })) void _;
    }).rejects.toThrow(AwinFeedFatalError);
  });
});

describe("parseAwinProductFeed: fila malformada (rechazo de fila, no del feed entero)", () => {
  it("una fila con menos columnas que la cabecera se rechaza como COLUMN_COUNT_MISMATCH, sin abortar el resto del feed", async () => {
    const csv = [FULL_HEADER, "1,,Producto incompleto", row({ aw_product_id: "2", product_name: "Producto bueno", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/2" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results).some((r) => r.code === "COLUMN_COUNT_MISMATCH")).toBe(true);
    expect(valid(results)).toHaveLength(1);
    expect(valid(results)[0].row.externalId).toBe("2");
  });
});

describe("parseAwinProductFeed: stream interrumpido/truncado — nunca se trata como descarga completa", () => {
  it("si la fuente de fragmentos falla a mitad, la excepción se propaga (StreamingCsvTruncatedError), sin completar en silencio", async () => {
    async function* source() {
      yield `${FULL_HEADER}\n`;
      yield row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" }) + "\n";
      throw new Error("conexión cortada a mitad de la descarga (simulado)");
    }
    await expect(async () => {
      for await (const _ of parseAwinProductFeed(source(), { merchant: MERCHANT_A })) void _;
    }).rejects.toThrow(StreamingCsvTruncatedError);
  });

  it("un feed que termina con un campo entre comillas sin cerrar (fichero cortado a mitad de una fila) lanza StreamingCsvTruncatedError", async () => {
    async function* source() {
      yield `${FULL_HEADER}\n`;
      yield '1,,"Producto que se corta a mitad de la descarga y nunca cierra la comilla';
    }
    await expect(async () => {
      for await (const _ of parseAwinProductFeed(source(), { merchant: MERCHANT_A })) void _;
    }).rejects.toThrow(StreamingCsvTruncatedError);
  });
});

describe("parseAwinProductFeed: catálogo grande — procesamiento incremental real", () => {
  const ROW_COUNT = 6000;

  function buildLargeCsv(): string {
    const lines = [FULL_HEADER];
    for (let i = 1; i <= ROW_COUNT; i++) {
      lines.push(
        row({
          aw_product_id: `p-${i}`,
          product_name: `Producto número ${i}`,
          merchant_category: "Categoría de prueba",
          search_price: (10 + (i % 100) / 100).toFixed(2),
          currency: "EUR",
          aw_deep_link: `https://tienda-a.example.invalid/p/${i}`,
        })
      );
    }
    return lines.join("\n");
  }

  it("procesa un catálogo de 6000 filas en fragmentos pequeños, emitiendo resultados ANTES de haber consumido todo el contenido (no espera a tenerlo todo)", async () => {
    const csv = buildLargeCsv();
    const CHUNK_SIZE = 512; // deliberadamente pequeño: parte campos y filas a mitad entre fragmentos
    const totalChunks = Math.ceil(csv.length / CHUNK_SIZE);

    let consumedChunks = 0;
    async function* instrumentedSource() {
      for await (const chunk of chunked(csv, CHUNK_SIZE)) {
        consumedChunks += 1;
        yield chunk;
      }
    }

    let firstValidAtChunk: number | null = null;
    let validCount = 0;
    let invalidCount = 0;
    for await (const result of parseAwinProductFeed(instrumentedSource(), { merchant: MERCHANT_A })) {
      if (result.status === "valid") {
        validCount += 1;
        if (firstValidAtChunk === null) firstValidAtChunk = consumedChunks;
      } else {
        invalidCount += 1;
      }
    }

    expect(validCount).toBe(ROW_COUNT);
    expect(invalidCount).toBe(0);
    // La primera fila válida se emitió mucho antes de consumir el ÚLTIMO
    // fragmento — prueba directa de que el procesamiento es incremental,
    // no "leer todo y luego procesar".
    expect(firstValidAtChunk).not.toBeNull();
    expect(firstValidAtChunk!).toBeLessThan(totalChunks / 2);
  });

  it("emite TODAS las filas válidas del catálogo grande, nunca una muestra parcial", async () => {
    const csv = buildLargeCsv();
    const externalIds: string[] = [];
    for await (const result of parseAwinProductFeed(csv, { merchant: MERCHANT_A })) {
      if (result.status === "valid") externalIds.push(result.row.externalId);
    }
    expect(externalIds).toHaveLength(ROW_COUNT);
    expect(new Set(externalIds).size).toBe(ROW_COUNT); // todas distintas, ninguna repetida ni perdida
    expect(externalIds[0]).toBe("p-1");
    expect(externalIds[ROW_COUNT - 1]).toBe(`p-${ROW_COUNT}`);
  });
});

describe("parseAwinProductFeed: confirmación de que se emiten todas las filas válidas de un lote mixto, no solo una muestra", () => {
  it("con un lote de 300 filas (parte inválidas a propósito), el total de resultados coincide exactamente con las filas de datos, sin muestreo", async () => {
    const TOTAL = 300;
    const lines = [FULL_HEADER];
    for (let i = 1; i <= TOTAL; i++) {
      const invalidRow = i % 7 === 0; // ~1 de cada 7 filas es inválida a propósito (precio negativo)
      lines.push(
        row({
          aw_product_id: `x-${i}`,
          product_name: `Producto ${i}`,
          merchant_category: "C",
          search_price: invalidRow ? "-1" : "10",
          currency: "EUR",
          aw_deep_link: `https://x.invalid/${i}`,
        })
      );
    }
    const results = await collect(lines.join("\n"));
    const expectedInvalid = Math.floor(TOTAL / 7);
    expect(results).toHaveLength(TOTAL);
    expect(valid(results)).toHaveLength(TOTAL - expectedInvalid);
    expect(invalid(results)).toHaveLength(expectedInvalid);
  });
});

describe("parseAwinProductFeed: casos límite adicionales", () => {
  it("una categoría cuyo texto no produce ningún carácter válido de slug (solo símbolos) se rechaza con INVALID_SLUG", async () => {
    const csv = [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "!!!", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = await collect(csv);
    expect(invalid(results)[0].code).toBe("INVALID_SLUG");
  });

  it("in_stock=1 y in_stock=0 se mapean a IN_STOCK/OUT_OF_STOCK; un valor ausente o no reconocido se mapea a UNKNOWN (nunca se asume 'en stock')", async () => {
    const build = (inStock: string) =>
      [FULL_HEADER, row({ aw_product_id: "1", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1", in_stock: inStock })].join("\n");

    expect(valid(await collect(build("1")))[0].row.availability).toBe(Availability.IN_STOCK);
    expect(valid(await collect(build("0")))[0].row.availability).toBe(Availability.OUT_OF_STOCK);
    expect(valid(await collect(build("")))[0].row.availability).toBe(Availability.UNKNOWN);
    expect(valid(await collect(build("maybe")))[0].row.availability).toBe(Availability.UNKNOWN);
  });

  it("acepta tanto merchant_product_id como aw_product_id cuando aw_product_id está ausente", async () => {
    const csv = [FULL_HEADER, row({ merchant_product_id: "sku-123", product_name: "P", merchant_category: "C", search_price: "10", currency: "EUR", aw_deep_link: "https://x.invalid/1" })].join("\n");
    const results = valid(await collect(csv));
    expect(results[0].row.externalId).toBe("sku-123");
  });
});
