import { prisma, isDatabaseConfigured } from "@/server/db/client";
import { Prisma, type PrismaClient } from "@/generated/prisma";
import { parseCsv, csvRowsToRecords } from "./csv";
import { validateRow, RowValidationError, type NormalizedOfferRow } from "./validate";

export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_CSV_ROWS = 5000;

export type ImportRowError = {
  rowNumber: number;
  code: string;
  message: string;
  rowData?: Record<string, string>;
};

export type ImportSummary = {
  importRunId: number | null;
  dryRun: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  rowsRead: number;
  productsCreated: number;
  productsUpdated: number;
  offersCreated: number;
  offersUpdated: number;
  rowsRejected: number;
  errors: ImportRowError[];
};

export class ImportSetupError extends Error {}

/**
 * Ejecuta una importación de ofertas desde un CSV ya leído en memoria como
 * texto. `dryRun: true` valida y clasifica cada fila (crearía / actualizaría)
 * sin escribir nada en la base de datos y sin dejar rastro en `ImportRun`.
 * Sin base de datos configurada, lanza `ImportSetupError` inmediatamente
 * (el llamador decide cómo mostrarlo; nunca se ejecuta a medias).
 */
export async function runCsvImport(params: {
  csvContent: string;
  source: string;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<ImportSummary> {
  const { csvContent, source, dryRun = false, metadata } = params;

  if (!isDatabaseConfigured() || !prisma) {
    throw new ImportSetupError("No hay una base de datos configurada (falta DATABASE_URL).");
  }

  const byteLength = Buffer.byteLength(csvContent, "utf8");
  if (byteLength > MAX_CSV_BYTES) {
    throw new ImportSetupError(`El fichero supera el límite de ${Math.round(MAX_CSV_BYTES / 1024 / 1024)} MB.`);
  }

  const { records } = csvRowsToRecords(parseCsv(csvContent));
  if (records.length > MAX_CSV_ROWS) {
    throw new ImportSetupError(`El CSV supera el límite de ${MAX_CSV_ROWS} filas de datos.`);
  }

  const db = prisma;
  const errors: ImportRowError[] = [];
  let productsCreated = 0;
  let productsUpdated = 0;
  let offersCreated = 0;
  let offersUpdated = 0;

  const importRun = dryRun
    ? null
    : await db.importRun.create({
        data: {
          source,
          status: "RUNNING",
          rowsRead: records.length,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
        },
      });

  for (let index = 0; index < records.length; index++) {
    const rowNumber = index + 1;
    const record = records[index];

    let normalized: NormalizedOfferRow;
    try {
      normalized = validateRow(record);
    } catch (error) {
      if (error instanceof RowValidationError) {
        errors.push({ rowNumber, code: error.code, message: error.message, rowData: record });
        continue;
      }
      throw error;
    }

    try {
      const outcome = await applyRow(db, normalized, { dryRun });
      if (outcome.product === "created") productsCreated += 1;
      if (outcome.product === "updated") productsUpdated += 1;
      if (outcome.offer === "created") offersCreated += 1;
      if (outcome.offer === "updated") offersUpdated += 1;
    } catch (error) {
      if (error instanceof RowValidationError) {
        errors.push({ rowNumber, code: error.code, message: error.message, rowData: record });
        continue;
      }
      // Error inesperado (p. ej. fallo de conexión a mitad de importación):
      // se registra la fila como rechazada y se sigue con las siguientes. El
      // detalle técnico completo (que podría incluir fragmentos de la
      // consulta o de la cadena de conexión) solo va al log del servidor;
      // el panel y el CSV de errores nunca muestran el mensaje crudo.
      console.error(`[importer] Error inesperado en la fila ${rowNumber}:`, error);
      errors.push({
        rowNumber,
        code: "UNEXPECTED_ERROR",
        message: "Error inesperado al procesar esta fila. Revisa los logs del servidor para más detalle.",
        rowData: record,
      });
    }
  }

  const rowsRejected = errors.length;
  const status = computeStatus(records.length, rowsRejected);

  if (!dryRun && importRun) {
    if (errors.length > 0) {
      await db.importError.createMany({
        data: errors.map((e) => ({
          importRunId: importRun.id,
          rowNumber: e.rowNumber,
          errorCode: e.code,
          message: e.message,
          rowData: e.rowData ?? undefined,
        })),
      });
    }
    await db.importRun.update({
      where: { id: importRun.id },
      data: {
        status,
        finishedAt: new Date(),
        productsCreated,
        productsUpdated,
        offersCreated,
        offersUpdated,
        rowsRejected,
        errorSummary: rowsRejected > 0 ? summarizeErrors(errors) : null,
      },
    });
  }

  return {
    importRunId: importRun?.id ?? null,
    dryRun,
    status,
    rowsRead: records.length,
    productsCreated,
    productsUpdated,
    offersCreated,
    offersUpdated,
    rowsRejected,
    errors,
  };
}

function computeStatus(rowsRead: number, rowsRejected: number): ImportSummary["status"] {
  if (rowsRead === 0) return "FAILED";
  if (rowsRejected === 0) return "SUCCESS";
  if (rowsRejected >= rowsRead) return "FAILED";
  return "PARTIAL";
}

function summarizeErrors(errors: ImportRowError[]): string {
  const preview = errors.slice(0, 3).map((e) => `fila ${e.rowNumber}: ${e.code}`);
  const suffix = errors.length > 3 ? ` (+${errors.length - 3} más)` : "";
  return `${errors.length} fila(s) rechazada(s) — ${preview.join("; ")}${suffix}`.slice(0, 500);
}

type RowOutcome = { product: "created" | "updated"; offer: "created" | "updated" };

/**
 * Aplica una fila ya validada: resuelve/crea categoría y comercio, crea o
 * actualiza el producto y la oferta, y añade un `PriceSnapshot` solo si el
 * precio o la disponibilidad cambiaron respecto al último registro. En modo
 * simulación (`dryRun`) solo lee para clasificar creación/actualización, sin
 * escribir nada.
 */
async function applyRow(
  db: PrismaClient,
  row: NormalizedOfferRow,
  { dryRun }: { dryRun: boolean }
): Promise<RowOutcome> {
  const existingCategory = await db.category.findUnique({ where: { slug: row.categorySlug } });
  if (!existingCategory && !row.categoryName) {
    throw new RowValidationError(
      "NEW_CATEGORY_NEEDS_NAME",
      `La categoría "${row.categorySlug}" no existe todavía: aporta "category_name" para crearla.`
    );
  }
  let categoryId: number;
  if (dryRun) {
    categoryId = existingCategory?.id ?? -1;
  } else if (existingCategory) {
    categoryId = existingCategory.id;
  } else {
    categoryId = (await db.category.create({ data: { slug: row.categorySlug, name: row.categoryName! } })).id;
  }

  const existingMerchant = await db.merchant.findUnique({ where: { slug: row.merchantSlug } });
  let merchantId: number;
  if (dryRun) {
    merchantId = existingMerchant?.id ?? -1;
  } else if (existingMerchant) {
    merchantId = existingMerchant.id;
    await db.merchant.update({
      where: { id: existingMerchant.id },
      data: { name: row.merchantName, websiteUrl: row.merchantUrl, isDemo: false },
    });
  } else {
    merchantId = (
      await db.merchant.create({
        data: { slug: row.merchantSlug, name: row.merchantName, websiteUrl: row.merchantUrl, isDemo: false },
      })
    ).id;
  }

  const existingProduct = await db.product.findUnique({ where: { slug: row.productSlug } });
  const productData = {
    name: row.productName,
    brand: row.brand,
    model: row.model,
    ean: row.ean,
    imageUrl: row.imageUrl,
    categoryId,
    isDemo: false,
  };
  let productId: number;
  let productOutcome: RowOutcome["product"];
  if (dryRun) {
    productId = existingProduct?.id ?? -1;
    productOutcome = existingProduct ? "updated" : "created";
  } else if (existingProduct) {
    productId = existingProduct.id;
    await db.product.update({ where: { id: existingProduct.id }, data: productData });
    productOutcome = "updated";
  } else {
    productId = (await db.product.create({ data: { slug: row.productSlug, ...productData } })).id;
    productOutcome = "created";
  }

  const existingOffer = dryRun
    ? existingProduct && existingMerchant
      ? await db.offer.findUnique({ where: { productId_merchantId: { productId, merchantId } } })
      : null
    : await db.offer.findUnique({ where: { productId_merchantId: { productId, merchantId } } });

  const offerData = {
    externalId: row.externalId,
    currentPrice: row.price,
    previousPrice: row.previousPrice,
    currency: row.currency,
    productUrl: row.productUrl,
    affiliateUrl: row.affiliateUrl,
    availability: row.availability,
    shippingCost: row.shippingCost,
    lastCheckedAt: row.lastCheckedAt,
    isActive: true,
    isDemo: false,
  };

  let offerId: number;
  let offerOutcome: RowOutcome["offer"];
  if (dryRun) {
    offerId = existingOffer?.id ?? -1;
    offerOutcome = existingOffer ? "updated" : "created";
  } else if (existingOffer) {
    offerId = existingOffer.id;
    await db.offer.update({ where: { id: existingOffer.id }, data: offerData });
    offerOutcome = "updated";
  } else {
    offerId = (await db.offer.create({ data: { productId, merchantId, ...offerData } })).id;
    offerOutcome = "created";
  }

  if (!dryRun) {
    const lastSnapshot = await db.priceSnapshot.findFirst({
      where: { offerId },
      orderBy: { recordedAt: "desc" },
    });
    const priceChanged = !lastSnapshot || lastSnapshot.price.toNumber() !== row.price;
    const availabilityChanged = !lastSnapshot || lastSnapshot.availability !== row.availability;
    if (priceChanged || availabilityChanged) {
      await db.priceSnapshot.create({
        data: {
          offerId,
          price: row.price,
          shippingCost: row.shippingCost,
          availability: row.availability,
          recordedAt: row.lastCheckedAt,
        },
      });
    }
  }

  return { product: productOutcome, offer: offerOutcome };
}
