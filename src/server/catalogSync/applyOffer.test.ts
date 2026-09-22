import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource, Prisma } from "@/generated/prisma";
import { applyNormalizedOfferRow } from "./applyOffer";
import { NormalizedOfferRowError, type NormalizedOfferRow } from "./types";

const PREFIX = "test-apply-offer";

// GTIN-14 válidos (dígito de control calculado y verificado por separado,
// ver gtin.test.ts para el mismo algoritmo probado exhaustivamente).
const GTIN_A = "11111111111113";
const GTIN_B = "22222222222226";

function baseRow(overrides: Partial<NormalizedOfferRow> = {}): NormalizedOfferRow {
  return {
    source: OfferSource.EBAY,
    merchant: { slug: `${PREFIX}-merchant`, name: "Comercio de prueba", websiteUrl: "https://example.invalid" },
    externalId: "ext-1",
    gtin: null,
    name: "Producto de prueba",
    brand: "MarcaPrueba",
    model: "ModeloPrueba",
    category: { slug: `${PREFIX}-cat`, name: "Categoría de prueba" },
    imageUrl: null,
    price: 19.99,
    shippingCost: null,
    currency: "EUR",
    availability: "IN_STOCK" as never,
    productUrl: "https://example.invalid/p",
    affiliateUrl: null,
    fetchedAt: new Date(),
    ...overrides,
  };
}

async function cleanup() {
  if (!prisma) return;
  // Los productos creados por GTIN-matching o por identidad estable
  // (fuente+comercio+externalId) no siempre tienen el prefijo en su propio
  // slug (p. ej. "ext-ebay-..."), así que se limpian por categoría — todas
  // las filas de esta prueba usan una categoría con el prefijo.
  await prisma.product.deleteMany({ where: { category: { slug: { startsWith: PREFIX } } } });
  await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

describe.skipIf(!process.env.DATABASE_URL)("applyNormalizedOfferRow (integración, BD local de pruebas)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("sin GTIN, crea un producto nuevo con slug derivado de fuente+comercio+externalId", async () => {
    const row = baseRow({ externalId: `${PREFIX}-sin-gtin-1` });
    const outcome = await applyNormalizedOfferRow(prisma!, row, { dryRun: false });
    expect(outcome).toEqual({ product: "created", merchant: "created", offer: "created" });

    const offer = await prisma!.offer.findUniqueOrThrow({
      where: { source_merchantId_externalId: { source: OfferSource.EBAY, merchantId: (await prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-merchant` } })).id, externalId: row.externalId } },
      include: { product: true },
    });
    expect(offer.product.slug).toBe(`ext-ebay-${PREFIX}-merchant-${PREFIX}-sin-gtin-1`);
    expect(offer.product.ean).toBeNull();
    expect(offer.product.metadataSource).toBe(OfferSource.EBAY);
  });

  it("con un GTIN válido que no coincide con nada, crea un producto nuevo y guarda el GTIN normalizado", async () => {
    const row = baseRow({ externalId: `${PREFIX}-gtin-nuevo`, gtin: GTIN_A });
    await applyNormalizedOfferRow(prisma!, row, { dryRun: false });
    const product = await prisma!.product.findFirstOrThrow({ where: { ean: GTIN_A } });
    expect(product.ean).toBe(GTIN_A);
  });

  it("con un GTIN válido idéntico a uno ya existente, relaciona la nueva oferta con el producto existente (no duplica)", async () => {
    const first = baseRow({ externalId: `${PREFIX}-gtin-compartido-1`, gtin: GTIN_B, source: OfferSource.EBAY });
    await applyNormalizedOfferRow(prisma!, first, { dryRun: false });
    const productAfterFirst = await prisma!.product.findFirstOrThrow({ where: { ean: GTIN_B } });

    // Misma GTIN, pero otro comercio y otro externalId (otra oferta).
    const second = baseRow({
      externalId: `${PREFIX}-gtin-compartido-2`,
      gtin: GTIN_B,
      merchant: { slug: `${PREFIX}-merchant-2`, name: "Comercio 2", websiteUrl: "https://example.invalid" },
    });
    await applyNormalizedOfferRow(prisma!, second, { dryRun: false });

    const productsWithGtin = await prisma!.product.findMany({ where: { ean: GTIN_B } });
    expect(productsWithGtin).toHaveLength(1); // sigue habiendo un único producto
    expect(productsWithGtin[0].id).toBe(productAfterFirst.id);

    const offersForProduct = await prisma!.offer.findMany({ where: { productId: productAfterFirst.id } });
    expect(offersForProduct).toHaveLength(2); // pero dos ofertas (dos comercios) enlazadas al mismo producto
  });

  it("re-sincronizar la misma oferta (mismo source+merchant+externalId) actualiza la misma fila, nunca duplica", async () => {
    const externalId = `${PREFIX}-resync-1`;
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, price: 10 }), { dryRun: false });
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, price: 12 }), { dryRun: false });

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-merchant` } });
    const offers = await prisma!.offer.findMany({ where: { merchantId: merchant.id, externalId, source: OfferSource.EBAY } });
    expect(offers).toHaveLength(1);
    expect(offers[0].currentPrice.toNumber()).toBe(12);
    expect(offers[0].previousPrice?.toNumber()).toBe(10);
  });

  it("crea un snapshot cuando cambia el precio, pero no cuando se repite", async () => {
    const externalId = `${PREFIX}-snapshot-1`;
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, price: 20 }), { dryRun: false });
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-merchant` } });
    const offer1 = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId, source: OfferSource.EBAY } });
    const snapshotsAfterCreate = await prisma!.priceSnapshot.count({ where: { offerId: offer1.id } });

    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, price: 25 }), { dryRun: false });
    const snapshotsAfterChange = await prisma!.priceSnapshot.count({ where: { offerId: offer1.id } });
    expect(snapshotsAfterChange).toBeGreaterThan(snapshotsAfterCreate);

    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, price: 25 }), { dryRun: false });
    const snapshotsAfterRepeat = await prisma!.priceSnapshot.count({ where: { offerId: offer1.id } });
    expect(snapshotsAfterRepeat).toBe(snapshotsAfterChange);
  });

  it("dos externalId distintos del mismo comercio y producto (mismo GTIN) coexisten como dos ofertas", async () => {
    const gtinShared = "33333333333339";
    const merchant = { slug: `${PREFIX}-merchant-multi`, name: "Comercio multi", websiteUrl: "https://example.invalid" };
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId: `${PREFIX}-multi-a`, gtin: gtinShared, merchant }), { dryRun: false });
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId: `${PREFIX}-multi-b`, gtin: gtinShared, merchant }), { dryRun: false });

    const product = await prisma!.product.findFirstOrThrow({ where: { ean: gtinShared } });
    const merchantRow = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchant.slug } });
    const offers = await prisma!.offer.findMany({ where: { productId: product.id, merchantId: merchantRow.id } });
    expect(offers).toHaveLength(2); // mismo producto, mismo comercio, dos externalId -> dos ofertas
    expect(new Set(offers.map((o) => o.externalId)).size).toBe(2);
  });

  it("un GTIN con dígito de control inválido se trata como ausente (crea producto por identidad estable, no lanza)", async () => {
    const row = baseRow({ externalId: `${PREFIX}-gtin-invalido`, gtin: "11111111111119" }); // dígito de control incorrecto
    await expect(applyNormalizedOfferRow(prisma!, row, { dryRun: false })).resolves.toBeDefined();
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-merchant` } });
    const offer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: row.externalId }, include: { product: true } });
    expect(offer.product.ean).toBeNull(); // el GTIN inválido nunca se guarda
  });

  it("dry-run no escribe nada en la base de datos", async () => {
    const externalId = `${PREFIX}-dry-1`;
    const before = await prisma!.product.count();
    const outcome = await applyNormalizedOfferRow(prisma!, baseRow({ externalId }), { dryRun: true });
    expect(outcome.offer).toBe("created");
    const after = await prisma!.product.count();
    expect(after).toBe(before);
    const merchant = await prisma!.merchant.findFirst({ where: { slug: `${PREFIX}-merchant` } });
    const offer = merchant ? await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId } }) : null;
    expect(offer).toBeNull();
  });

  it("rechaza una fila con precio negativo sin escribir nada", async () => {
    const row = baseRow({ externalId: `${PREFIX}-precio-negativo`, price: -5 });
    await expect(applyNormalizedOfferRow(prisma!, row, { dryRun: false })).rejects.toThrow(NormalizedOfferRowError);
    const merchant = await prisma!.merchant.findFirst({ where: { slug: `${PREFIX}-merchant` } });
    const offer = merchant ? await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId: row.externalId } }) : null;
    expect(offer).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("applyNormalizedOfferRow: política de metadatos aplicada de extremo a extremo", () => {
  const gtin = "44444444444442";
  const merchantA = { slug: `${PREFIX}-meta-merchant-a`, name: "Comercio meta A", websiteUrl: "https://example.invalid" };
  const merchantB = { slug: `${PREFIX}-meta-merchant-b`, name: "Comercio meta B", websiteUrl: "https://example.invalid" };

  afterAll(cleanup);

  it("eBay crea el producto primero; Awin (mayor prioridad) lo corrige después; eBay ya no puede volver a cambiarlo", async () => {
    await applyNormalizedOfferRow(
      prisma!,
      baseRow({ externalId: `${PREFIX}-meta-1`, gtin, merchant: merchantA, source: OfferSource.EBAY, name: "Nombre eBay" }),
      { dryRun: false }
    );
    let product = await prisma!.product.findFirstOrThrow({ where: { ean: gtin } });
    expect(product.name).toBe("Nombre eBay");
    expect(product.metadataSource).toBe(OfferSource.EBAY);

    await applyNormalizedOfferRow(
      prisma!,
      baseRow({ externalId: `${PREFIX}-meta-2`, gtin, merchant: merchantB, source: OfferSource.AWIN, name: "Nombre Awin" }),
      { dryRun: false }
    );
    product = await prisma!.product.findFirstOrThrow({ where: { ean: gtin } });
    expect(product.name).toBe("Nombre Awin");
    expect(product.metadataSource).toBe(OfferSource.AWIN);

    // eBay vuelve a sincronizar (misma oferta de antes, actualización): no debe recuperar la posesión.
    await applyNormalizedOfferRow(
      prisma!,
      baseRow({ externalId: `${PREFIX}-meta-1`, gtin, merchant: merchantA, source: OfferSource.EBAY, name: "Nombre eBay otra vez" }),
      { dryRun: false }
    );
    product = await prisma!.product.findFirstOrThrow({ where: { ean: gtin } });
    expect(product.name).toBe("Nombre Awin"); // sigue siendo el de Awin, no oscila
    expect(product.metadataSource).toBe(OfferSource.AWIN);
  });
});

// GTIN-14 válidos adicionales para las pruebas de carrera/relink (dígito de
// control verificado por separado con gtin.ts, igual que arriba).
const GTIN_RACE = "66666666666668";
const GTIN_RELINK_A = "77777777777771";
const GTIN_RELINK_B = "88888888888884";
const GTIN_RELINK_C = "99999999999980";

describe.skipIf(!process.env.DATABASE_URL)("applyNormalizedOfferRow: bloqueo 2 — sin duplicados de GTIN entre fuentes concurrentes", () => {
  afterAll(cleanup);

  it("dos sincronizaciones 'simultáneas' (Promise.all) con el mismo GTIN, desde fuentes distintas, nunca crean dos productos ni dos categorías (sin precargar nada)", async () => {
    const merchantA = { slug: `${PREFIX}-race-merchant-a`, name: "Comercio carrera A", websiteUrl: "https://example.invalid" };
    const merchantB = { slug: `${PREFIX}-race-merchant-b`, name: "Comercio carrera B", websiteUrl: "https://example.invalid" };
    // Ninguna categoría, comercio ni producto se precarga: ambas filas
    // comparten la misma categoría nueva por defecto de `baseRow`
    // (`${PREFIX}-cat`), así que esta prueba ejercita TAMBIÉN la carrera de
    // creación de categoría (bloqueo 1 de la segunda ronda de endurecimiento),
    // no solo la de `Product.canonicalGtin`.
    const rowAwin = baseRow({ externalId: `${PREFIX}-race-awin`, gtin: GTIN_RACE, source: OfferSource.AWIN, merchant: merchantA });
    const rowEbay = baseRow({ externalId: `${PREFIX}-race-ebay`, gtin: GTIN_RACE, source: OfferSource.EBAY, merchant: merchantB });

    // Carrera real a nivel de base de datos: dos llamadas independientes a
    // applyNormalizedOfferRow lanzadas a la vez, cada una sobre su propia
    // conexión del pool de Prisma — no es una simulación, es la misma
    // condición que dos procesos de sincronización distintos (Awin/eBay) a
    // la vez (punto 8).
    const [outcomeA, outcomeB] = await Promise.all([
      applyNormalizedOfferRow(prisma!, rowAwin, { dryRun: false }),
      applyNormalizedOfferRow(prisma!, rowEbay, { dryRun: false }),
    ]);
    expect([outcomeA.product, outcomeB.product].sort()).toEqual(["created", "updated"]); // una gana la creación, la otra la reutiliza

    const products = await prisma!.product.findMany({ where: { canonicalGtin: GTIN_RACE } });
    expect(products).toHaveLength(1); // nunca hay dos productos para el mismo GTIN

    const categories = await prisma!.category.findMany({ where: { slug: `${PREFIX}-cat` } });
    expect(categories).toHaveLength(1); // ni dos categorías para el mismo slug

    const offers = await prisma!.offer.findMany({ where: { productId: products[0].id } });
    expect(offers).toHaveLength(2); // pero las dos ofertas (Awin y eBay) están enlazadas al mismo producto
  });

  it("si la creación de categoría pierde la carrera (P2002 en slug), relee a la ganadora en vez de duplicar", async () => {
    const categorySlug = `${PREFIX}-race-cat-p2002-category`;
    const winner = await prisma!.category.create({ data: { slug: categorySlug, name: "Ganadora de la carrera" } });

    // Simula que, entre nuestra lectura ("¿ya existe?") y nuestro create(),
    // otro proceso ganó la carrera y creó la categoría — el mismo patrón de
    // prueba usado para la carrera de canonicalGtin más abajo.
    const findUniqueSpy = vi.spyOn(prisma!.category, "findUnique").mockResolvedValueOnce(null);
    const createSpy = vi.spyOn(prisma!.category, "create").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`slug`)", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["slug"] },
      })
    );
    try {
      const row = baseRow({ externalId: `${PREFIX}-race-cat-p2002-offer`, category: { slug: categorySlug, name: "Categoría (nombre distinto, no se usa)" } });
      const outcome = await applyNormalizedOfferRow(prisma!, row, { dryRun: false });
      expect(outcome.product).toBe("created"); // la categoría no bloquea la creación del producto/oferta

      const categories = await prisma!.category.findMany({ where: { slug: categorySlug } });
      expect(categories).toHaveLength(1);
      expect(categories[0].id).toBe(winner.id);
      expect(categories[0].name).toBe("Ganadora de la carrera"); // nunca se sobrescribe con el nombre de la fila perdedora

      const offer = await prisma!.offer.findFirstOrThrow({ where: { externalId: row.externalId }, include: { product: true } });
      expect(offer.product.categoryId).toBe(winner.id);
    } finally {
      findUniqueSpy.mockRestore();
      createSpy.mockRestore();
    }
  });

  it("si la creación pierde la carrera (P2002 en canonicalGtin), relee al ganador en vez de duplicar", async () => {
    const merchant = { slug: `${PREFIX}-race-merchant-p2002`, name: "Comercio P2002", websiteUrl: "https://example.invalid" };
    const category = await prisma!.category.create({ data: { slug: `${PREFIX}-race-cat-p2002`, name: "Categoría P2002" } });
    // "Otro proceso" ya ganó la carrera justo antes de que nuestro create()
    // llegara a ejecutarse: simulamos ese estado directamente en la base y
    // forzamos el P2002 que Prisma lanzaría en ese instante exacto.
    const winner = await prisma!.product.create({
      data: { slug: `${PREFIX}-race-p2002-winner`, name: "Ganador de la carrera", categoryId: category.id, canonicalGtin: GTIN_RELINK_C, ean: GTIN_RELINK_C, isDemo: false },
    });

    // La comprobación inicial ("¿ya existe?") se fuerza a `null` UNA vez,
    // como si nuestra lectura hubiera llegado justo antes de que el
    // ganador escribiera su fila — así el código realmente entra en la
    // rama `create()` y choca con el P2002, en vez de encontrar al ganador
    // ya en la primera lectura (que también sería correcto, pero no
    // probaría la recuperación tras el conflicto). El segundo `findFirst`
    // (el "re-fetch del ganador" dentro del catch) no está simulado: usa
    // la base de datos real y encuentra al ganador de verdad.
    const findFirstSpy = vi.spyOn(prisma!.product, "findFirst").mockResolvedValueOnce(null);
    const createSpy = vi.spyOn(prisma!.product, "create").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`canonicalGtin`)", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["canonicalGtin"] },
      })
    );
    try {
      const row = baseRow({ externalId: `${PREFIX}-race-p2002-loser`, gtin: GTIN_RELINK_C, merchant });
      const outcome = await applyNormalizedOfferRow(prisma!, row, { dryRun: false });
      expect(outcome.product).toBe("updated"); // no crea uno nuevo: usa el que ganó la carrera

      const productsWithGtin = await prisma!.product.findMany({ where: { canonicalGtin: GTIN_RELINK_C } });
      expect(productsWithGtin).toHaveLength(1);
      expect(productsWithGtin[0].id).toBe(winner.id);

      const offer = await prisma!.offer.findFirstOrThrow({ where: { externalId: row.externalId } });
      expect(offer.productId).toBe(winner.id);
    } finally {
      findFirstSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("applyNormalizedOfferRow: bloqueo 4 — GTIN que aparece posteriormente (relink seguro)", () => {
  afterAll(cleanup);

  it("una oferta creada sin GTIN cuyo producto luego recibe uno válido lo reclama en solitario (nadie más lo tenía)", async () => {
    const externalId = `${PREFIX}-relink-claim`;
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: null }), { dryRun: false });
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: `${PREFIX}-merchant` } });
    const offerBefore = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId }, include: { product: true } });
    expect(offerBefore.product.canonicalGtin).toBeNull();
    const productId = offerBefore.productId;

    const outcome = await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: GTIN_RELINK_A }), { dryRun: false });
    expect(outcome.gtinRelink).toEqual({ code: "GTIN_RELINK_CLAIMED", normalizedGtin: GTIN_RELINK_A, productId });

    const offerAfter = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId }, include: { product: true } });
    expect(offerAfter.productId).toBe(productId); // sigue siendo el mismo producto: solo lo reclama, no lo cambia
    expect(offerAfter.product.canonicalGtin).toBe(GTIN_RELINK_A);
  });

  it("una oferta creada sin GTIN cuyo producto luego recibe uno que YA pertenece a otro producto se relaciona con el canónico (nunca duplica ni fusiona por texto)", async () => {
    const canonicalMerchant = { slug: `${PREFIX}-relink-canonical-merchant`, name: "Comercio canónico", websiteUrl: "https://example.invalid" };
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId: `${PREFIX}-relink-canonical-offer`, gtin: GTIN_RELINK_B, merchant: canonicalMerchant }), { dryRun: false });
    const canonicalProduct = await prisma!.product.findFirstOrThrow({ where: { canonicalGtin: GTIN_RELINK_B } });

    const orphanMerchant = { slug: `${PREFIX}-relink-orphan-merchant`, name: "Comercio huérfano", websiteUrl: "https://example.invalid" };
    const externalId = `${PREFIX}-relink-orphan-offer`;
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: null, merchant: orphanMerchant, name: "Nombre sin GTIN" }), { dryRun: false });
    const orphanMerchantRow = await prisma!.merchant.findUniqueOrThrow({ where: { slug: orphanMerchant.slug } });
    const offerBefore = await prisma!.offer.findFirstOrThrow({ where: { merchantId: orphanMerchantRow.id, externalId } });
    const orphanProductId = offerBefore.productId;
    expect(orphanProductId).not.toBe(canonicalProduct.id);

    const outcome = await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: GTIN_RELINK_B, merchant: orphanMerchant }), { dryRun: false });
    expect(outcome.gtinRelink).toEqual({
      code: "GTIN_RELINK_APPLIED",
      normalizedGtin: GTIN_RELINK_B,
      fromProductId: orphanProductId,
      toProductId: canonicalProduct.id,
    });

    const offerAfter = await prisma!.offer.findFirstOrThrow({ where: { merchantId: orphanMerchantRow.id, externalId } });
    expect(offerAfter.productId).toBe(canonicalProduct.id); // relacionada con el canónico

    // El producto anterior NUNCA se borra automáticamente, aunque quede huérfano.
    const orphanProductStillExists = await prisma!.product.findUnique({ where: { id: orphanProductId } });
    expect(orphanProductStillExists).not.toBeNull();

    const offersOnCanonical = await prisma!.offer.findMany({ where: { productId: canonicalProduct.id } });
    expect(offersOnCanonical.map((o) => o.externalId).sort()).toEqual([`${PREFIX}-relink-canonical-offer`, externalId].sort());
  });

  it("nunca fusiona automáticamente cuando hay ambigüedad: el producto ya tiene su propio GTIN distinto al entrante", async () => {
    const gtinOriginal = "30000000000001"; // GTIN-14 propio de esta prueba (evita cualquier acoplamiento con otras)
    const gtinIncoming = "40000000000008";
    const merchantX = { slug: `${PREFIX}-relink-ambig-x`, name: "Comercio ambiguo X", websiteUrl: "https://example.invalid" };
    const externalId = `${PREFIX}-relink-ambig-offer`;
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: gtinOriginal, merchant: merchantX }), { dryRun: false });
    const merchantXRow = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantX.slug } });
    const offerBefore = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchantXRow.id, externalId } });
    const productId = offerBefore.productId;

    // La misma oferta se re-sincroniza, pero esta vez la fuente aporta un
    // GTIN válido DISTINTO al que ya tenía asignado el producto: nunca se
    // sobrescribe ni se fusiona con otro producto por esto.
    const outcome = await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: gtinIncoming, merchant: merchantX }), { dryRun: false });
    expect(outcome.gtinRelink).toEqual({
      code: "GTIN_RELINK_AMBIGUOUS_SKIPPED",
      normalizedGtin: gtinIncoming,
      productId,
      existingCanonicalGtin: gtinOriginal,
    });

    const offerAfter = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchantXRow.id, externalId } });
    expect(offerAfter.productId).toBe(productId); // no se movió

    const product = await prisma!.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.canonicalGtin).toBe(gtinOriginal); // el GTIN original nunca se sobrescribe
  });

  it("re-sincronizar la misma oferta con el mismo GTIN de siempre no genera ninguna decisión de relink (estado estable)", async () => {
    const gtinStable = "20000000000004"; // GTIN-14 propio de esta prueba, para no depender del estado dejado por otras
    const externalId = `${PREFIX}-relink-stable-offer`;
    const merchant = { slug: `${PREFIX}-relink-stable-merchant`, name: "M", websiteUrl: "https://example.invalid" };
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: gtinStable, merchant }), { dryRun: false });
    const outcome = await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: gtinStable, merchant, price: 50 }), { dryRun: false });
    expect(outcome.gtinRelink).toBeUndefined();
  });

  it("dry-run detecta la decisión de relink que se aplicaría, pero no escribe nada", async () => {
    const canonicalMerchant = { slug: `${PREFIX}-relink-dry-canonical-merchant`, name: "Comercio canónico dry", websiteUrl: "https://example.invalid" };
    const gtinDry = "10000000000007"; // GTIN-14 válido, distinto de los usados arriba
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId: `${PREFIX}-relink-dry-canonical-offer`, gtin: gtinDry, merchant: canonicalMerchant }), { dryRun: false });
    const canonicalProduct = await prisma!.product.findFirstOrThrow({ where: { canonicalGtin: gtinDry } });

    const orphanMerchant = { slug: `${PREFIX}-relink-dry-orphan-merchant`, name: "Comercio huérfano dry", websiteUrl: "https://example.invalid" };
    const externalId = `${PREFIX}-relink-dry-orphan-offer`;
    await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: null, merchant: orphanMerchant }), { dryRun: false });
    const orphanMerchantRow = await prisma!.merchant.findUniqueOrThrow({ where: { slug: orphanMerchant.slug } });
    const offerBefore = await prisma!.offer.findFirstOrThrow({ where: { merchantId: orphanMerchantRow.id, externalId } });

    const outcome = await applyNormalizedOfferRow(prisma!, baseRow({ externalId, gtin: gtinDry, merchant: orphanMerchant }), { dryRun: true });
    expect(outcome.gtinRelink).toEqual({
      code: "GTIN_RELINK_APPLIED",
      normalizedGtin: gtinDry,
      fromProductId: offerBefore.productId,
      toProductId: canonicalProduct.id,
    });

    const offerAfter = await prisma!.offer.findFirstOrThrow({ where: { merchantId: orphanMerchantRow.id, externalId } });
    expect(offerAfter.productId).toBe(offerBefore.productId); // dry-run: no se escribió nada de verdad
  });
});
