import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCsvImport } from "./run";
import { prisma } from "@/server/db/client";

const HEADER =
  "category_slug,category_name,product_slug,product_name,brand,model,ean,image_url,merchant_slug,merchant_name,merchant_url,external_offer_id,price,previous_price,currency,availability,shipping_cost,product_url,affiliate_url,last_checked_at,is_demo";

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
    // Estas pruebas simulan una importación REAL (feed de producción), no
    // el CSV de ejemplo: is_demo=false explícito, como exige el README
    // para cualquier fichero real.
    is_demo: "false",
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
    "is_demo",
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

  it("una importación real (is_demo=false) crea producto, comercio y oferta marcados isDemo=false", async () => {
    const product = await prisma!.product.findUnique({ where: { slug: PRODUCT } });
    const merchant = await prisma!.merchant.findUnique({ where: { slug: MERCHANT_A } });
    const offer = await prisma!.offer.findUnique({ where: { productId_merchantId: { productId: product!.id, merchantId: merchant!.id } } });
    expect(product!.isDemo).toBe(false);
    expect(merchant!.isDemo).toBe(false);
    expect(offer!.isDemo).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runCsvImport: is_demo (integración, BD local de pruebas)", () => {
  const DEMO_PREFIX = "test-importer-isdemo";
  const DEMO_CATEGORY = `${DEMO_PREFIX}-categoria`;
  const DEMO_PRODUCT = `${DEMO_PREFIX}-producto`;
  const DEMO_MERCHANT = `${DEMO_PREFIX}-comercio`;

  function demoRow(overrides: Record<string, string> = {}) {
    return row({
      category_slug: DEMO_CATEGORY,
      product_slug: DEMO_PRODUCT,
      merchant_slug: DEMO_MERCHANT,
      merchant_name: "Comercio de prueba demo",
      merchant_url: "https://comercio-prueba-demo.example.invalid",
      product_url: "https://comercio-prueba-demo.example.invalid/producto",
      ...overrides,
    });
  }

  async function cleanupDemo() {
    if (!prisma) return;
    await prisma.product.deleteMany({ where: { slug: { startsWith: DEMO_PREFIX } } });
    await prisma.merchant.deleteMany({ where: { slug: { startsWith: DEMO_PREFIX } } });
    await prisma.category.deleteMany({ where: { slug: DEMO_CATEGORY } });
  }

  beforeAll(cleanupDemo);
  afterAll(cleanupDemo);

  it("una importación con is_demo=true crea producto, comercio y oferta marcados isDemo=true", async () => {
    const csv = `${HEADER}\n${demoRow({ is_demo: "true" })}\n`;
    const summary = await runCsvImport({ csvContent: csv, source: "test-isdemo-true" });
    expect(summary.status).toBe("SUCCESS");

    const product = await prisma!.product.findUnique({ where: { slug: DEMO_PRODUCT } });
    const merchant = await prisma!.merchant.findUnique({ where: { slug: DEMO_MERCHANT } });
    const offer = await prisma!.offer.findUnique({ where: { productId_merchantId: { productId: product!.id, merchantId: merchant!.id } } });
    expect(product!.isDemo).toBe(true);
    expect(merchant!.isDemo).toBe(true);
    expect(offer!.isDemo).toBe(true);
  });

  it("sin columna is_demo en absoluto, el valor por defecto también es demo (nunca se asume real)", async () => {
    const headerWithoutIsDemo = HEADER.replace(",is_demo", "");
    const rowWithoutIsDemo = demoRow({ product_slug: `${DEMO_PRODUCT}-sin-columna` })
      .split(",")
      .slice(0, -1) // quita el último campo (is_demo) para que coincida con la cabecera sin esa columna
      .join(",");
    const csv = `${headerWithoutIsDemo}\n${rowWithoutIsDemo}\n`;
    const summary = await runCsvImport({ csvContent: csv, source: "test-isdemo-missing-column" });
    expect(summary.status).toBe("SUCCESS");

    const product = await prisma!.product.findUnique({ where: { slug: `${DEMO_PRODUCT}-sin-columna` } });
    expect(product!.isDemo).toBe(true);
  });

  it("una fila demo nunca degrada a demo un producto/comercio/oferta ya marcado como real (protección contra mezclar)", async () => {
    // Primero, una importación real de verdad.
    const realCsv = `${HEADER}\n${demoRow({ is_demo: "false", price: "10.00" })}\n`;
    await runCsvImport({ csvContent: realCsv, source: "test-mix-real-first" });

    // Después, una fila demo para el MISMO producto/comercio (p. ej. una resubida
    // accidental de ofertas-ejemplo.csv): no debe poder ocultar el dato real.
    const demoCsv = `${HEADER}\n${demoRow({ is_demo: "true", price: "12.00" })}\n`;
    await runCsvImport({ csvContent: demoCsv, source: "test-mix-demo-second" });

    const product = await prisma!.product.findUnique({ where: { slug: DEMO_PRODUCT } });
    const merchant = await prisma!.merchant.findUnique({ where: { slug: DEMO_MERCHANT } });
    const offer = await prisma!.offer.findUnique({ where: { productId_merchantId: { productId: product!.id, merchantId: merchant!.id } } });
    expect(product!.isDemo).toBe(false);
    expect(merchant!.isDemo).toBe(false);
    expect(offer!.isDemo).toBe(false);
    // El precio sí se actualiza con normalidad: solo se protege la etiqueta demo/real.
    expect(offer!.currentPrice.toNumber()).toBe(12);
  });

  it("una fila real confirma como real un producto/comercio/oferta que hasta ahora solo se conocía por demo", async () => {
    const upgradeProduct = `${DEMO_PREFIX}-upgrade-producto`;
    const upgradeMerchant = `${DEMO_PREFIX}-upgrade-comercio`;

    const demoCsv = `${HEADER}\n${row({
      category_slug: DEMO_CATEGORY,
      product_slug: upgradeProduct,
      merchant_slug: upgradeMerchant,
      merchant_name: "Comercio de prueba upgrade",
      merchant_url: "https://comercio-prueba-upgrade.example.invalid",
      product_url: "https://comercio-prueba-upgrade.example.invalid/producto",
      is_demo: "true",
    })}\n`;
    await runCsvImport({ csvContent: demoCsv, source: "test-mix-upgrade-demo-first" });

    const realCsv = `${HEADER}\n${row({
      category_slug: DEMO_CATEGORY,
      product_slug: upgradeProduct,
      merchant_slug: upgradeMerchant,
      merchant_name: "Comercio de prueba upgrade",
      merchant_url: "https://comercio-prueba-upgrade.example.invalid",
      product_url: "https://comercio-prueba-upgrade.example.invalid/producto",
      is_demo: "false",
    })}\n`;
    await runCsvImport({ csvContent: realCsv, source: "test-mix-upgrade-real-second" });

    const product = await prisma!.product.findUnique({ where: { slug: upgradeProduct } });
    const merchant = await prisma!.merchant.findUnique({ where: { slug: upgradeMerchant } });
    const offer = await prisma!.offer.findUnique({ where: { productId_merchantId: { productId: product!.id, merchantId: merchant!.id } } });
    expect(product!.isDemo).toBe(false);
    expect(merchant!.isDemo).toBe(false);
    expect(offer!.isDemo).toBe(false);
  });
});
