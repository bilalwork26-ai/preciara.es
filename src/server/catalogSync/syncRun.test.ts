import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";
import { runCatalogSync, SyncLockBusyError, SyncSetupError } from "./syncRun";
import type { NormalizedOfferRow } from "./types";

const PREFIX = "test-sync-run";

function row(overrides: Partial<NormalizedOfferRow> = {}): NormalizedOfferRow {
  return {
    source: OfferSource.AWIN,
    merchant: { slug: `${PREFIX}-merchant`, name: "Comercio sync", websiteUrl: "https://example.invalid" },
    externalId: "ext-1",
    gtin: null,
    name: "Producto sync",
    brand: null,
    model: null,
    category: { slug: `${PREFIX}-cat`, name: "Categoría sync" },
    imageUrl: null,
    price: 15,
    shippingCost: null,
    currency: "EUR",
    availability: "IN_STOCK" as never,
    productUrl: "https://example.invalid/p",
    affiliateUrl: null,
    fetchedAt: new Date(),
    ...overrides,
  };
}

/** Alcance por defecto para las pruebas que no ejercitan el punto 9 a propósito: el único comercio que usan las filas de `row()`. */
const DEFAULT_SCOPE = { merchantSlugs: [`${PREFIX}-merchant`] };

async function cleanup() {
  if (!prisma) return;
  await prisma.product.deleteMany({ where: { category: { slug: { startsWith: PREFIX } } } });
  await prisma.merchant.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.importRun.deleteMany({ where: { source: { startsWith: "sync:" } } });
}

describe.skipIf(!process.env.DATABASE_URL)("runCatalogSync (integración, BD local de pruebas)", () => {
  afterAll(cleanup);

  it("una sincronización correcta crea un ImportRun con los contadores esperados", async () => {
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-a` }), row({ externalId: `${PREFIX}-b`, merchant: { slug: `${PREFIX}-merchant-2`, name: "M2", websiteUrl: "https://example.invalid" } })],
      scope: { merchantSlugs: [`${PREFIX}-merchant`, `${PREFIX}-merchant-2`] },
      feedFetchedSuccessfully: true,
    });

    expect(summary.status).toBe("SUCCESS");
    expect(summary.rowsRead).toBe(2);
    expect(summary.offersCreated).toBe(2);
    expect(summary.rowsRejected).toBe(0);
    expect(summary.importRunId).not.toBeNull();

    const run = await prisma!.importRun.findUniqueOrThrow({ where: { id: summary.importRunId! } });
    expect(run.source).toBe("sync:awin");
    expect(run.status).toBe("SUCCESS");
  });

  it("dos filas del MISMO lote con el mismo GTIN (comercios distintos) no crean productos duplicados: un producto, dos ofertas", async () => {
    const gtinSameBatch = "90000000000003";
    const merchantSlugA = `${PREFIX}-same-batch-merchant-a`;
    const merchantSlugB = `${PREFIX}-same-batch-merchant-b`;
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [
        row({ externalId: `${PREFIX}-same-batch-a`, gtin: gtinSameBatch, merchant: { slug: merchantSlugA, name: "MA", websiteUrl: "https://example.invalid" } }),
        row({ externalId: `${PREFIX}-same-batch-b`, gtin: gtinSameBatch, merchant: { slug: merchantSlugB, name: "MB", websiteUrl: "https://example.invalid" } }),
      ],
      scope: { merchantSlugs: [merchantSlugA, merchantSlugB] },
      feedFetchedSuccessfully: true,
    });

    expect(summary.status).toBe("SUCCESS");
    expect(summary.productsCreated).toBe(1); // la segunda fila reutiliza el producto que creó la primera
    expect(summary.productsUpdated).toBe(1);
    expect(summary.offersCreated).toBe(2);

    const products = await prisma!.product.findMany({ where: { canonicalGtin: gtinSameBatch } });
    expect(products).toHaveLength(1);

    const offers = await prisma!.offer.findMany({ where: { productId: products[0].id } });
    expect(offers).toHaveLength(2);
    expect(new Set(offers.map((o) => o.externalId))).toEqual(new Set([`${PREFIX}-same-batch-a`, `${PREFIX}-same-batch-b`]));
  });

  it("una fila inválida se rechaza sin cancelar el resto (PARTIAL) y queda registrada en ImportError", async () => {
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-partial-ok` }), row({ externalId: `${PREFIX}-partial-bad`, price: -1 })],
      scope: DEFAULT_SCOPE,
      feedFetchedSuccessfully: true,
    });
    expect(summary.status).toBe("PARTIAL");
    expect(summary.rowsRejected).toBe(1);
    expect(summary.errors[0].code).toBe("INVALID_PRICE");

    const run = await prisma!.importRun.findUniqueOrThrow({ where: { id: summary.importRunId! }, include: { errors: true } });
    expect(run.errors).toHaveLength(1);
  });

  it("dry-run no crea ImportRun ni escribe nada", async () => {
    const before = await prisma!.importRun.count();
    const beforeOffers = await prisma!.offer.count();
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-dry` })],
      scope: DEFAULT_SCOPE,
      feedFetchedSuccessfully: true,
      dryRun: true,
    });
    expect(summary.importRunId).toBeNull();
    expect(summary.dryRun).toBe(true);
    const after = await prisma!.importRun.count();
    const afterOffers = await prisma!.offer.count();
    expect(after).toBe(before);
    expect(afterOffers).toBe(beforeOffers);
  });

  it("rechaza un lote con filas de más de una fuente distinta (SyncSetupError)", async () => {
    await expect(
      runCatalogSync({
        source: OfferSource.AWIN,
        rows: [row({ source: OfferSource.AWIN }), row({ source: OfferSource.EBAY, externalId: "otro" })],
        scope: DEFAULT_SCOPE,
        feedFetchedSuccessfully: true,
      })
    ).rejects.toThrow(SyncSetupError);
  });

  it("rechaza una fila cuyo comercio no está declarado en scope.merchantSlugs (SyncSetupError), sin escribir nada", async () => {
    const importRunsBefore = await prisma!.importRun.count();
    await expect(
      runCatalogSync({
        source: OfferSource.AWIN,
        rows: [row({ externalId: `${PREFIX}-out-of-scope`, merchant: { slug: `${PREFIX}-merchant-no-declarado`, name: "M", websiteUrl: "https://example.invalid" } })],
        scope: DEFAULT_SCOPE, // no incluye "test-sync-run-merchant-no-declarado"
        feedFetchedSuccessfully: true,
      })
    ).rejects.toThrow(SyncSetupError);
    const importRunsAfter = await prisma!.importRun.count();
    expect(importRunsAfter).toBe(importRunsBefore); // se detuvo antes de crear el ImportRun
  });

  it("si el bloqueo de esa fuente ya está ocupado, lanza SyncLockBusyError y no toca nada", async () => {
    // GET_LOCK es por conexión MySQL: probar la contención real de "otra
    // sesión" a través del pool de Prisma no es fiable (ver la nota
    // equivalente en distributedLock.test.ts) — aquí se simula el bloqueo
    // ocupado sustituyendo `acquireDistributedLock` para probar de forma
    // determinista que runCatalogSync respeta su resultado sin escribir
    // nada cuando es `false`.
    const distributedLock = await import("@/server/importer/distributedLock");
    const acquireSpy = vi.spyOn(distributedLock, "acquireDistributedLock").mockResolvedValue(false);
    const releaseSpy = vi.spyOn(distributedLock, "releaseDistributedLock").mockResolvedValue(undefined);

    const importRunsBefore = await prisma!.importRun.count();
    try {
      await expect(
        runCatalogSync({
          source: OfferSource.EBAY,
          rows: [row({ source: OfferSource.EBAY, externalId: `${PREFIX}-lock-test` })],
          scope: DEFAULT_SCOPE,
          feedFetchedSuccessfully: true,
        })
      ).rejects.toThrow(SyncLockBusyError);
    } finally {
      acquireSpy.mockRestore();
      releaseSpy.mockRestore();
    }
    const importRunsAfter = await prisma!.importRun.count();
    expect(importRunsAfter).toBe(importRunsBefore); // no se creó ningún ImportRun: se detuvo antes de escribir nada
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runCatalogSync: bloqueo 3 — alcance explícito de la desactivación de ofertas viejas", () => {
  afterAll(cleanup);

  it("una sincronización PARCIAL nunca desactiva ofertas, aunque se pida deactivateStaleAfterHours", { timeout: 15_000 }, async () => {
    const merchantSlug = `${PREFIX}-stale-merchant-partial`;
    await runCatalogSync({
      source: OfferSource.EBAY,
      rows: [row({ source: OfferSource.EBAY, externalId: `${PREFIX}-stale-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });

    const summary = await runCatalogSync({
      source: OfferSource.EBAY,
      rows: [
        row({ source: OfferSource.EBAY, externalId: `${PREFIX}-stale-ok`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } }),
        row({ source: OfferSource.EBAY, externalId: `${PREFIX}-stale-bad`, price: -1, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } }),
      ],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
      deactivateStaleAfterHours: 72,
    });
    expect(summary.status).toBe("PARTIAL");
    expect(summary.staleDeactivated).toBe(0);

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-stale-old` } });
    expect(oldOffer.isActive).toBe(true); // nunca se desactivó, pese a ser vieja
  });

  it("una descarga fallida (feedFetchedSuccessfully: false) es siempre FAILED, no procesa filas y no desactiva nada", async () => {
    const merchantSlug = `${PREFIX}-stale-merchant-failed-download`;
    // Oferta vieja previa, para comprobar que de verdad no se toca.
    await runCatalogSync({
      source: OfferSource.EBAY,
      rows: [row({ source: OfferSource.EBAY, externalId: `${PREFIX}-failed-download-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });
    const offersBefore = await prisma!.offer.count({ where: { merchant: { slug: merchantSlug } } });

    const summary = await runCatalogSync({
      source: OfferSource.EBAY,
      // Aunque el adaptador aportara filas (p. ej. un feed truncado a
      // mitad de descarga), una descarga marcada como fallida nunca las
      // procesa: `rows` no vacío no cambia el resultado.
      rows: [row({ source: OfferSource.EBAY, externalId: `${PREFIX}-failed-download-new`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: false,
      deactivateStaleAfterHours: 72,
    });

    expect(summary.status).toBe("FAILED");
    expect(summary.offersCreated).toBe(0);
    expect(summary.offersUpdated).toBe(0);
    expect(summary.staleDeactivated).toBe(0);

    const offersAfter = await prisma!.offer.count({ where: { merchant: { slug: merchantSlug } } });
    expect(offersAfter).toBe(offersBefore); // no se creó/actualizó ninguna oferta a partir de las filas

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-failed-download-old` } });
    expect(oldOffer.isActive).toBe(true); // nunca se desactivó
  });

  it("un feed válido pero vacío (feedFetchedSuccessfully: true, rows: []) es SUCCESS y SÍ desactiva ofertas viejas de los comercios declarados en el alcance", async () => {
    const merchantSlug = `${PREFIX}-stale-merchant-empty-feed`;
    await runCatalogSync({
      source: OfferSource.EBAY,
      rows: [row({ source: OfferSource.EBAY, externalId: `${PREFIX}-empty-feed-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });

    const summary = await runCatalogSync({
      source: OfferSource.EBAY,
      rows: [], // feed confirmado, sin filas esta vez (p. ej. el comercio se quedó sin stock)
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
      deactivateStaleAfterHours: 72,
    });

    expect(summary.status).toBe("SUCCESS"); // un feed vacío pero confirmado nunca es un fallo
    expect(summary.rowsRead).toBe(0);
    expect(summary.staleDeactivated).toBe(1);

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-empty-feed-old` } });
    expect(oldOffer.isActive).toBe(false);
  });

  it("un comercio declarado en el alcance pero ausente en las filas de este lote también ve desactivadas sus ofertas viejas", async () => {
    const touchedMerchantSlug = `${PREFIX}-stale-merchant-touched`;
    const absentMerchantSlug = `${PREFIX}-stale-merchant-absent-from-rows`;

    // Oferta vieja en el comercio que SÍ traerá una fila en el próximo lote.
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ source: OfferSource.AWIN, externalId: `${PREFIX}-touched-old`, merchant: { slug: touchedMerchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [touchedMerchantSlug] },
      feedFetchedSuccessfully: true,
    });
    // Oferta vieja en un comercio que seguirá DECLARADO en el alcance del
    // próximo lote, pero que no traerá ninguna fila esta vez (p. ej. sin
    // stock momentáneamente, no dado de baja de la fuente).
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ source: OfferSource.AWIN, externalId: `${PREFIX}-absent-old`, merchant: { slug: absentMerchantSlug, name: "M2", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [absentMerchantSlug] },
      feedFetchedSuccessfully: true,
    });

    // Nuevo lote: el alcance declara AMBOS comercios, pero las filas solo traen el "touched".
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ source: OfferSource.AWIN, externalId: `${PREFIX}-touched-new`, merchant: { slug: touchedMerchantSlug, name: "M", websiteUrl: "https://example.invalid" } })],
      scope: { merchantSlugs: [touchedMerchantSlug, absentMerchantSlug] },
      feedFetchedSuccessfully: true,
      deactivateStaleAfterHours: 72,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.staleDeactivated).toBe(2); // AMBOS comercios declarados en el alcance, no solo el que trajo filas

    const touchedMerchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: touchedMerchantSlug } });
    const absentMerchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: absentMerchantSlug } });
    const touchedOldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: touchedMerchant.id, externalId: `${PREFIX}-touched-old` } });
    const absentOldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: absentMerchant.id, externalId: `${PREFIX}-absent-old` } });

    expect(touchedOldOffer.isActive).toBe(false);
    expect(absentOldOffer.isActive).toBe(false); // vieja, sin fila este lote, pero SÍ estaba en el alcance -> también desactivada
  });

  it("un comercio NO declarado en el alcance nunca ve tocadas sus ofertas, aunque tenga otras viejas", async () => {
    const inScopeMerchantSlug = `${PREFIX}-stale-merchant-in-scope`;
    const outOfScopeMerchantSlug = `${PREFIX}-stale-merchant-out-of-scope`;

    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ source: OfferSource.AWIN, externalId: `${PREFIX}-in-scope-old`, merchant: { slug: inScopeMerchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [inScopeMerchantSlug] },
      feedFetchedSuccessfully: true,
    });
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ source: OfferSource.AWIN, externalId: `${PREFIX}-out-of-scope-old`, merchant: { slug: outOfScopeMerchantSlug, name: "M2", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [outOfScopeMerchantSlug] },
      feedFetchedSuccessfully: true,
    });

    // El alcance de este lote NUNCA declara outOfScopeMerchantSlug.
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ source: OfferSource.AWIN, externalId: `${PREFIX}-in-scope-new`, merchant: { slug: inScopeMerchantSlug, name: "M", websiteUrl: "https://example.invalid" } })],
      scope: { merchantSlugs: [inScopeMerchantSlug] },
      feedFetchedSuccessfully: true,
      deactivateStaleAfterHours: 72,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.staleDeactivated).toBe(1);

    const outOfScopeMerchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: outOfScopeMerchantSlug } });
    const outOfScopeOldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: outOfScopeMerchant.id, externalId: `${PREFIX}-out-of-scope-old` } });
    expect(outOfScopeOldOffer.isActive).toBe(true); // nunca declarado en el alcance -> nunca tocado
  });
});
