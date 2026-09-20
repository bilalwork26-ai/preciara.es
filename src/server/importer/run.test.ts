import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCsvImport } from "./run";
import { prisma } from "@/server/db/client";

const HEADER =
  "category_slug,category_name,product_slug,product_name,brand,model,ean,image_url,merchant_slug,merchant_name,merchant_url,external_offer_id,price,previous_price,currency,availability,shipping_cost,product_url,affiliate_url,last_checked_at";

// Prefijo exclusivo de estas pruebas: permite limpiar sin tocar datos del
// seed ni de otras ejecuciones manuales en la base de pruebas local.
const PREFIX = "test-importer-run";
const CATEGORY = `${PREFIX}-categoria`;
const PRODUCT = `${PREFIX}-producto`;
const MERCHANT_A = `${PREFIX}-comercio-a`;
const MERCHANT_B = `${PREFIX}-comercio-b`;

function row(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    category_slug: CATEGORY,
    category_name: "Categoría de prueba",
    product_slug: PRODUCT,
    product_name: "Producto de prueba",
    brand: "",
    model: "",
    ean: "",
    image_url: "",
    merchant_slug: MERCHANT_A,
    merchant_name: "Comercio de prueba A",
    merchant_url: "https://comercio-prueba-a.example.invalid",
    external_offer_id: "",
    price: "10.00",
    previous_price: "",
    currency: "EUR",
    availability: "in_stock",
    shipping_cost: "",
    product_url: "https://comercio-prueba-a.example.invalid/producto",
    affiliate_url: "",
    last_checked_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
  return [
    "category_slug",
    "category_name",
    "product_slug",
    "product_name",
    "brand",
    "model",
    "ean",
    "image_url",
    "merchant_slug",
    "merchant_name",
    "merchant_url",
    "external_offer_id",
    "price",
    "previous_price",
    "currency",
    "availability",
    "shipping_cost",
    "product_url",
    "affiliate_url",
    "last_checked_at",
  ]
    .map((key) => fields[key])
    .join(",");
}

async function cleanup() {
  if (!prisma) return;
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: CATEGORY } });
}

describe.skipIf(!process.env.DATABASE_URL)("runCsvImport (integración, BD local de pruebas)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("crea categoría, producto, comercio, oferta y un snapshot inicial", async () => {
    const csv = `${HEADER}\n${row()}\n`;
    const summary = await runCsvImport({ csvContent: csv, source: "test" });

    expect(summary.status).toBe("SUCCESS");
    expect(summary.rowsRejected).toBe(0);
    expect(summary.productsCreated).toBe(1);
    expect(summary.offersCreated).toBe(1);

    const product = await prisma!.product.findUnique({ where: { slug: PRODUCT }, include: { offers: true } });
    expect(product).not.toBeNull();
    expect(product!.offers).toHaveLength(1);
    expect(product!.offers[0].currentPrice.toNumber()).toBe(10);

    const snapshots = await prisma!.priceSnapshot.count({ where: { offerId: product!.offers[0].id } });
    expect(snapshots).toBe(1);
  });

  it("es idempotente: reimportar el mismo CSV no duplica nada ni crea un snapshot nuevo", async () => {
    const csv = `${HEADER}\n${row()}\n`;
    const before = await prisma!.product.findUnique({ where: { slug: PRODUCT }, include: { offers: true } });
    const snapshotsBefore = await prisma!.priceSnapshot.count({ where: { offerId: before!.offers[0].id } });

    const summary = await runCsvImport({ csvContent: csv, source: "test-rerun" });

    expect(summary.status).toBe("SUCCESS");
    expect(summary.productsCreated).toBe(0);
    expect(summary.productsUpdated).toBe(1);
    expect(summary.offersCreated).toBe(0);
    expect(summary.offersUpdated).toBe(1);

    const productCount = await prisma!.product.count({ where: { slug: PRODUCT } });
    expect(productCount).toBe(1);

    const snapshotsAfter = await prisma!.priceSnapshot.count({ where: { offerId: before!.offers[0].id } });
    expect(snapshotsAfter).toBe(snapshotsBefore); // sin cambios de precio/disponibilidad -> sin snapshot nuevo
  });

  it("crea un nuevo snapshot cuando el precio cambia, pero no cuando se repite", async () => {
    const priceChanged = `${HEADER}\n${row({ price: "12.50", last_checked_at: "2026-01-02T00:00:00Z" })}\n`;
    await runCsvImport({ csvContent: priceChanged, source: "test-price-change" });

    const offer = await prisma!.offer.findFirst({ where: { product: { slug: PRODUCT }, merchant: { slug: MERCHANT_A } } });
    const snapshotsAfterChange = await prisma!.priceSnapshot.count({ where: { offerId: offer!.id } });

    const samePrice = `${HEADER}\n${row({ price: "12.50", last_checked_at: "2026-01-03T00:00:00Z" })}\n`;
    await runCsvImport({ csvContent: samePrice, source: "test-price-same" });
    const snapshotsAfterRepeat = await prisma!.priceSnapshot.count({ where: { offerId: offer!.id } });

    expect(snapshotsAfterChange).toBeGreaterThan(1);
    expect(snapshotsAfterRepeat).toBe(snapshotsAfterChange);
  });

  it("añade una segunda oferta del mismo producto en otro comercio sin afectar a la primera", async () => {
    const csv = `${HEADER}\n${row({
      merchant_slug: MERCHANT_B,
      merchant_name: "Comercio de prueba B",
      merchant_url: "https://comercio-prueba-b.example.invalid",
      product_url: "https://comercio-prueba-b.example.invalid/producto",
      price: "9.00",
    })}\n`;
    const summary = await runCsvImport({ csvContent: csv, source: "test-second-merchant" });

    expect(summary.offersCreated).toBe(1);
    const product = await prisma!.product.findUnique({ where: { slug: PRODUCT }, include: { offers: true } });
    expect(product!.offers).toHaveLength(2);
  });

  it("rechaza filas inválidas sin cancelar el resto de la importación", async () => {
    const csv = [
      HEADER,
      row({ merchant_slug: `${PREFIX}-comercio-c`, merchant_name: "C", price: "-1" }), // precio negativo
      row({ merchant_slug: `${PREFIX}-comercio-d`, merchant_name: "D", price: "15.00" }), // válida
    ].join("\n");

    const summary = await runCsvImport({ csvContent: csv, source: "test-partial" });

    expect(summary.status).toBe("PARTIAL");
    expect(summary.rowsRejected).toBe(1);
    expect(summary.offersCreated).toBeGreaterThanOrEqual(1);
    expect(summary.errors[0].code).toBe("NEGATIVE_PRICE");

    await prisma!.merchant.deleteMany({ where: { slug: { in: [`${PREFIX}-comercio-c`, `${PREFIX}-comercio-d`] } } });
  });

  it("el modo simulación (dryRun) no escribe nada en la base de datos", async () => {
    const newProductSlug = `${PREFIX}-producto-dry`;
    const csv = `${HEADER}\n${row({ product_slug: newProductSlug, product_name: "Producto dry-run" })}\n`;

    const summary = await runCsvImport({ csvContent: csv, source: "test-dry", dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.importRunId).toBeNull();
    expect(summary.productsCreated).toBe(1); // clasificación, no escritura

    const product = await prisma!.product.findUnique({ where: { slug: newProductSlug } });
    expect(product).toBeNull();
  });

  it("guarda un ImportRun con los contadores correctos para una ejecución real", async () => {
    const csv = `${HEADER}\n${row({ price: "20.00", last_checked_at: "2026-01-04T00:00:00Z" })}\n`;
    const summary = await runCsvImport({ csvContent: csv, source: "test-importrun-check" });

    expect(summary.importRunId).not.toBeNull();
    const run = await prisma!.importRun.findUnique({ where: { id: summary.importRunId! } });
    expect(run).not.toBeNull();
    expect(run!.source).toBe("test-importrun-check");
    expect(run!.status).toBe("SUCCESS");
  });
});
