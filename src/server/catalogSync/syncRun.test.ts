import { inspect } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";
import { runCatalogSync, SyncLockBusyError, SyncSetupError, SyncStreamError } from "./syncRun";
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

/** Un token distintivo y muy improbable de aparecer por azar — actúa de "canario": si aparece en cualquier error público o en `ImportRun`/`ImportError` persistidos, la prueba correspondiente debe fallar. */
const CANARY_SECRET = "CANARY-STREAM-SECRET-token-7f3e";

describe.skipIf(!process.env.DATABASE_URL)("runCatalogSync: contrato streaming (Iterable/AsyncIterable), procesamiento incremental", () => {
  afterAll(cleanup);

  function summaryWithoutVolatileFields(summary: Awaited<ReturnType<typeof runCatalogSync>>) {
    const rest: Partial<typeof summary> = { ...summary };
    delete rest.importRunId;
    return rest;
  }

  it("un array produce EXACTAMENTE el mismo resumen (salvo importRunId) que un Iterable síncrono equivalente", async () => {
    const merchantSlugArray = `${PREFIX}-parity-array`;
    const merchantSlugIterable = `${PREFIX}-parity-iterable`;
    const rowsFor = (merchantSlug: string) => [
      row({ externalId: `${PREFIX}-parity-a`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } }),
      row({ externalId: `${PREFIX}-parity-b`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } }),
    ];
    function* syncIterable(): Generator<NormalizedOfferRow> {
      yield* rowsFor(merchantSlugIterable);
    }

    const arraySummary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: rowsFor(merchantSlugArray),
      scope: { merchantSlugs: [merchantSlugArray] },
      feedFetchedSuccessfully: true,
    });
    const iterableSummary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: syncIterable(),
      scope: { merchantSlugs: [merchantSlugIterable] },
      feedFetchedSuccessfully: true,
    });

    expect(summaryWithoutVolatileFields(iterableSummary)).toEqual(summaryWithoutVolatileFields(arraySummary));
  });

  it("acepta un Iterable SÍNCRONO (generador `function*`, no array) y produce el resumen esperado", async () => {
    const merchantSlug = `${PREFIX}-sync-iterable`;
    function* source(): Generator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-si-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      yield row({ externalId: `${PREFIX}-si-2`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
    }
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: source(),
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.rowsRead).toBe(2);
    expect(summary.offersCreated).toBe(2);
  });

  it("acepta un AsyncIterable (generador `async function*`) y produce el resumen esperado", async () => {
    const merchantSlug = `${PREFIX}-async-iterable`;
    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-ai-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      yield row({ externalId: `${PREFIX}-ai-2`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      yield row({ externalId: `${PREFIX}-ai-3`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
    }
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: source(),
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.rowsRead).toBe(3);
    expect(summary.offersCreated).toBe(3);
  });

  it("un AsyncIterable VACÍO se comporta igual que un array vacío: SUCCESS, rowsRead 0, sin fallar", async () => {
    const merchantSlug = `${PREFIX}-empty-async-iterable`;
    async function* emptySource(): AsyncGenerator<NormalizedOfferRow> {}
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: emptySource(),
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.rowsRead).toBe(0);
  });

  it("consumo VERDADERAMENTE incremental: cada fila queda aplicada en la base de datos ANTES de que el generador produzca la siguiente", async () => {
    const merchantSlug = `${PREFIX}-incremental-order`;
    const total = 6;
    const priorRowAlreadyApplied: boolean[] = [];
    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      for (let i = 0; i < total; i++) {
        if (i > 0) {
          const count = await prisma!.offer.count({ where: { merchant: { slug: merchantSlug }, externalId: `${PREFIX}-inc-${i - 1}` } });
          priorRowAlreadyApplied.push(count === 1);
        }
        yield row({ externalId: `${PREFIX}-inc-${i}`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      }
    }
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: source(),
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.rowsRead).toBe(total);
    expect(priorRowAlreadyApplied).toHaveLength(total - 1);
    expect(priorRowAlreadyApplied.every(Boolean)).toBe(true);
  });

  it("el productor NUNCA se adelanta al consumidor: control de backpressure con un generador perezoso, sin depender de heapUsed", async () => {
    const merchantSlug = `${PREFIX}-lazy-backpressure`;
    const total = 30;
    let produced = 0;
    let consumed = 0;
    let maxLead = 0;
    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      for (let i = 0; i < total; i++) {
        produced += 1;
        maxLead = Math.max(maxLead, produced - consumed);
        yield row({ externalId: `${PREFIX}-lazy-${i}`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
        // Este punto solo se ejecuta cuando el consumidor vuelve a pedir la
        // SIGUIENTE fila — es decir, después de haber terminado por
        // completo con la anterior (incluida su escritura en BD).
        consumed += 1;
      }
    }
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: source(),
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(produced).toBe(total);
    expect(consumed).toBe(total);
    // "lead" máximo de 1 = como mucho la fila que se está procesando ahora
    // mismo — nunca una acumulación proporcional a `total`.
    expect(maxLead).toBeLessThanOrEqual(1);
  });

  it("fallo de la fuente ANTES de la primera fila: ImportRun FAILED con contadores en cero, sin filas aplicadas, lock liberado, error seguro sin el secreto canario", async () => {
    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      throw new Error(`fallo simulado antes de producir nada — contiene ${CANARY_SECRET}`);
    }
    let caught: unknown;
    let summary: Awaited<ReturnType<typeof runCatalogSync>> | undefined;
    try {
      summary = await runCatalogSync({
        source: OfferSource.AWIN,
        rows: source(),
        scope: DEFAULT_SCOPE,
        feedFetchedSuccessfully: true,
      });
    } catch (error) {
      caught = error;
    }
    expect(summary).toBeUndefined();
    expect(caught).toBeInstanceOf(SyncStreamError);
    const err = caught as SyncStreamError;
    expect(err.message).not.toContain(CANARY_SECRET);
    expect(String(err)).not.toContain(CANARY_SECRET);
    expect(JSON.stringify(err)).not.toContain(CANARY_SECRET);
    expect(inspect(err)).not.toContain(CANARY_SECRET);

    const failedRun = await prisma!.importRun.findFirstOrThrow({ where: { source: "sync:awin", status: "FAILED", rowsRead: 0 }, orderBy: { id: "desc" } });
    expect(failedRun.productsCreated).toBe(0);
    expect(failedRun.offersCreated).toBe(0);
    expect(failedRun.errorSummary ?? "").not.toContain(CANARY_SECRET);

    // El lock se liberó: una sincronización inmediatamente posterior de la MISMA fuente no queda bloqueada.
    const nextSummary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-after-early-stream-failure` })],
      scope: DEFAULT_SCOPE,
      feedFetchedSuccessfully: true,
    });
    expect(nextSummary.status).toBe("SUCCESS");
  });

  it("fallo de la fuente DESPUÉS de varias filas: las filas previas quedan aplicadas (idempotentes, nunca se deshacen), ImportRun FAILED con los contadores alcanzados, nunca se desactiva nada", async () => {
    const merchantSlug = `${PREFIX}-fail-after-several`;
    // Oferta vieja previa en el mismo comercio, para comprobar que el fallo posterior tampoco la desactiva.
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-fail-after-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });

    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-fail-after-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      yield row({ externalId: `${PREFIX}-fail-after-2`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      throw new Error(`fallo simulado a mitad de stream — contiene ${CANARY_SECRET}`);
    }
    let caught: unknown;
    try {
      await runCatalogSync({
        source: OfferSource.AWIN,
        rows: source(),
        scope: { merchantSlugs: [merchantSlug] },
        feedFetchedSuccessfully: true,
        deactivateStaleAfterHours: 72,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SyncStreamError);
    expect((caught as SyncStreamError).message).not.toContain(CANARY_SECRET);

    // Las 2 filas producidas antes del fallo SÍ quedaron aplicadas (idempotentes).
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const appliedOffers = await prisma!.offer.findMany({ where: { merchantId: merchant.id, externalId: { in: [`${PREFIX}-fail-after-1`, `${PREFIX}-fail-after-2`] } } });
    expect(appliedOffers).toHaveLength(2);

    const failedRun = await prisma!.importRun.findFirstOrThrow({ where: { source: "sync:awin", status: "FAILED" }, orderBy: { id: "desc" } });
    expect(failedRun.offersCreated).toBe(2); // contadores alcanzados hasta el fallo, no en cero
    expect(failedRun.rowsRead).toBe(2);
    expect(failedRun.errorSummary ?? "").not.toContain(CANARY_SECRET);

    // La oferta vieja del mismo comercio NUNCA se desactivó: el fallo del stream nunca dispara desactivación.
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-fail-after-old` } });
    expect(oldOffer.isActive).toBe(true);
  });

  it("violación de contrato TARDÍA — source distinto en una fila del stream tras varias válidas: FAILED, filas previas aplicadas, sin desactivar, SyncSetupError, return() del generador ejecutado", async () => {
    const merchantSlug = `${PREFIX}-late-source-violation`;
    let generatorClosed = false;
    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      try {
        yield row({ externalId: `${PREFIX}-late-source-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
        yield row({ source: OfferSource.EBAY, externalId: `${PREFIX}-late-source-bad`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
        yield row({ externalId: `${PREFIX}-late-source-never-reached`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      } finally {
        generatorClosed = true;
      }
    }
    let caught: unknown;
    try {
      await runCatalogSync({
        source: OfferSource.AWIN,
        rows: source(),
        scope: { merchantSlugs: [merchantSlug] },
        feedFetchedSuccessfully: true,
        deactivateStaleAfterHours: 72,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SyncSetupError);
    expect(generatorClosed).toBe(true); // return() se ejecutó al abortar el consumo

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const firstOffer = await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId: `${PREFIX}-late-source-1` } });
    expect(firstOffer).not.toBeNull(); // la fila válida anterior sí quedó aplicada (idempotente)
    const neverReached = await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId: `${PREFIX}-late-source-never-reached` } });
    expect(neverReached).toBeNull(); // la fila posterior a la violación NUNCA se llegó a consumir

    const failedRun = await prisma!.importRun.findFirstOrThrow({ where: { source: "sync:awin", status: "FAILED" }, orderBy: { id: "desc" } });
    expect(failedRun.offersCreated).toBe(1);
  });

  it("comercio fuera del scope en una fila TARDÍA del stream: FAILED, sin desactivar, filas previas aplicadas", async () => {
    const merchantSlug = `${PREFIX}-late-scope-violation`;
    const outOfScopeSlug = `${PREFIX}-late-scope-violation-other`;
    // Oferta vieja previa en el mismo comercio, para comprobar que la violación tardía tampoco la desactiva.
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-late-scope-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });

    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-late-scope-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      yield row({ externalId: `${PREFIX}-late-scope-bad`, merchant: { slug: outOfScopeSlug, name: "M2", websiteUrl: "https://example.invalid" } });
    }
    let caught: unknown;
    try {
      await runCatalogSync({
        source: OfferSource.AWIN,
        rows: source(),
        scope: { merchantSlugs: [merchantSlug] }, // NUNCA declara outOfScopeSlug
        feedFetchedSuccessfully: true,
        deactivateStaleAfterHours: 72,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SyncSetupError);

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-late-scope-old` } });
    expect(oldOffer.isActive).toBe(true); // nunca desactivada pese a deactivateStaleAfterHours

    const failedRun = await prisma!.importRun.findFirstOrThrow({ where: { source: "sync:awin", status: "FAILED" }, orderBy: { id: "desc" } });
    expect(failedRun.offersCreated).toBe(1); // solo la fila válida anterior a la violación
  });

  it("desactivación SOLO después de agotar el stream por completo con éxito: un stream válido con deactivateStaleAfterHours SÍ desactiva ofertas viejas del alcance declarado", async () => {
    const merchantSlug = `${PREFIX}-stream-deactivate-success`;
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-stream-deact-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });

    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-stream-deact-new`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
    }
    const summary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: source(),
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
      deactivateStaleAfterHours: 72,
    });
    expect(summary.status).toBe("SUCCESS");
    expect(summary.staleDeactivated).toBe(1);

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-stream-deact-old` } });
    expect(oldOffer.isActive).toBe(false);
  });

  it("un array con una violación de scope TARDÍA (no en la primera fila) sigue prevalidándose ENTERO por adelantado: SyncSetupError, cero ImportRun creado, cero filas escritas", async () => {
    const merchantSlug = `${PREFIX}-array-late-violation`;
    const outOfScopeSlug = `${PREFIX}-array-late-violation-other`;
    const importRunsBefore = await prisma!.importRun.count();
    await expect(
      runCatalogSync({
        source: OfferSource.AWIN,
        rows: [
          row({ externalId: `${PREFIX}-array-late-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } }),
          row({ externalId: `${PREFIX}-array-late-2`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } }),
          row({ externalId: `${PREFIX}-array-late-bad`, merchant: { slug: outOfScopeSlug, name: "M2", websiteUrl: "https://example.invalid" } }),
        ],
        scope: { merchantSlugs: [merchantSlug] }, // nunca declara outOfScopeSlug
        feedFetchedSuccessfully: true,
      })
    ).rejects.toThrow(SyncSetupError);
    const importRunsAfter = await prisma!.importRun.count();
    expect(importRunsAfter).toBe(importRunsBefore); // ninguna fila (ni siquiera las válidas) llegó a escribirse: prevalidación completa por adelantado

    const offer = await prisma!.offer.findFirst({ where: { externalId: `${PREFIX}-array-late-1` } });
    expect(offer).toBeNull();
  });

  it("dos ejecuciones concurrentes de la MISMA fuente con entrada en streaming siguen protegidas por el bloqueo distribuido", async () => {
    const distributedLock = await import("@/server/importer/distributedLock");
    const acquireSpy = vi.spyOn(distributedLock, "acquireDistributedLock").mockResolvedValue(false);
    const releaseSpy = vi.spyOn(distributedLock, "releaseDistributedLock").mockResolvedValue(undefined);

    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-concurrent-stream` });
    }
    const importRunsBefore = await prisma!.importRun.count();
    try {
      await expect(
        runCatalogSync({
          source: OfferSource.EBAY,
          rows: source(),
          scope: DEFAULT_SCOPE,
          feedFetchedSuccessfully: true,
        })
      ).rejects.toThrow(SyncLockBusyError);
    } finally {
      acquireSpy.mockRestore();
      releaseSpy.mockRestore();
    }
    const importRunsAfter = await prisma!.importRun.count();
    expect(importRunsAfter).toBe(importRunsBefore);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runCatalogSync: el error crudo de un stream NUNCA se registra ni se persiste (auditoría de seguridad)", () => {
  afterAll(cleanup);

  const CANARY_URL_WITH_KEY = `https://productdata.awin.com/datafeed/download/apikey/CANARY-URL-KEY-4d2a1c/fid/1/format/csv`;
  const CANARY_TOKEN = "CANARY-TOKEN-9f8e7d6c5b4a";
  const CANARY_PAYLOAD_FRAGMENT = "CANARY-PAYLOAD-precio:19.99-externalId:secret-sku-123";
  const ALL_CANARIES = [CANARY_URL_WITH_KEY, CANARY_TOKEN, CANARY_PAYLOAD_FRAGMENT];

  /** Un error "hostil" cuyo mensaje, `.stack` Y `.cause` (nativo de `Error`) contienen los tres canarios — simula un adaptador todavía sin auditar que filtrara una URL de descarga, un token y un fragmento de payload dentro de su propio error. */
  function buildCanaryLeakError(): Error {
    const cause = new Error(`causa anidada — url=${CANARY_URL_WITH_KEY} token=${CANARY_TOKEN}`);
    cause.stack = `Error: causa anidada\n    at adapterInternals (/adapter.ts:9:9) — ${CANARY_PAYLOAD_FRAGMENT}`;
    const err = new Error(`fallo de transporte simulado — url=${CANARY_URL_WITH_KEY} token=${CANARY_TOKEN} payload=${CANARY_PAYLOAD_FRAGMENT}`, { cause });
    err.stack = `Error: fallo de transporte simulado — ${CANARY_URL_WITH_KEY} ${CANARY_TOKEN}\n    at simulatedAdapter (/adapter.ts:1:1) — ${CANARY_PAYLOAD_FRAGMENT}`;
    return err;
  }

  function safeString(value: unknown): string {
    try {
      return String(value);
    } catch {
      return "";
    }
  }
  function safeJson(value: unknown): string {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return "";
    }
  }

  it("un error del stream con URL+API key, token y fragmento de payload canarios NUNCA aparece en console.error/console.warn, en el error propagado ni en ImportRun.errorSummary — el run queda FAILED, sin desactivar, y el lock se libera", async () => {
    const merchantSlug = `${PREFIX}-stream-log-leak`;
    // Oferta vieja previa, para comprobar que el fallo del stream tampoco la desactiva.
    await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-log-leak-old`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" }, fetchedAt: new Date(Date.now() - 200 * 3_600_000) })],
      scope: { merchantSlugs: [merchantSlug] },
      feedFetchedSuccessfully: true,
    });

    async function* source(): AsyncGenerator<NormalizedOfferRow> {
      yield row({ externalId: `${PREFIX}-log-leak-1`, merchant: { slug: merchantSlug, name: "M", websiteUrl: "https://example.invalid" } });
      throw buildCanaryLeakError();
    }

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let caught: unknown;
    try {
      await runCatalogSync({
        source: OfferSource.AWIN,
        rows: source(),
        scope: { merchantSlugs: [merchantSlug] },
        feedFetchedSuccessfully: true,
        deactivateStaleAfterHours: 72,
      });
    } catch (error) {
      caught = error;
    }
    // IMPORTANTE: `mockRestore()` también limpia `.mock.calls` (hace lo
    // mismo que `mockClear()` además de restaurar la implementación
    // original) — hay que copiar las llamadas registradas ANTES de
    // restaurar los espías, o se perderían.
    const allCalls = [...errorSpy.mock.calls, ...warnSpy.mock.calls];
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    // 1) El error propagado es el tipo seguro esperado, y ninguna de sus representaciones contiene ningún canario.
    expect(caught).toBeInstanceOf(SyncStreamError);
    const err = caught as SyncStreamError;
    for (const canary of ALL_CANARIES) {
      expect(err.message).not.toContain(canary);
      expect(safeString(err)).not.toContain(canary);
      expect(safeJson(err)).not.toContain(canary);
      expect(inspect(err)).not.toContain(canary);
    }

    // 2) NINGÚN argumento de NINGUNA llamada a console.error/console.warn contiene ningún canario, en ninguna representación habitual.
    expect(allCalls.length).toBeGreaterThan(0); // sí se registró ALGO (el evento seguro) — la prueba no pasa trivialmente por falta de logs.
    for (const call of allCalls) {
      for (const arg of call) {
        for (const canary of ALL_CANARIES) {
          expect(safeString(arg)).not.toContain(canary);
          expect(safeJson(arg)).not.toContain(canary);
          expect(inspect(arg, { depth: null })).not.toContain(canary);
        }
      }
    }

    // 3) El log operativo permitido son metadatos fijos y estructurados, nunca texto de la excepción.
    const structuredCall = allCalls.find((call) => call.some((arg) => typeof arg === "object" && arg !== null && (arg as Record<string, unknown>).event === "catalog_sync_stream_failed"));
    expect(structuredCall).toBeDefined();

    // 4) La fila válida anterior quedó aplicada; ImportRun.errorSummary tampoco contiene ningún canario.
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: merchantSlug } });
    const appliedOffer = await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId: `${PREFIX}-log-leak-1` } });
    expect(appliedOffer).not.toBeNull();

    const failedRun = await prisma!.importRun.findFirstOrThrow({ where: { source: "sync:awin", status: "FAILED" }, orderBy: { id: "desc" } });
    expect(failedRun.rowsRead).toBe(1);
    expect(failedRun.offersCreated).toBe(1);
    for (const canary of ALL_CANARIES) {
      expect(failedRun.errorSummary ?? "").not.toContain(canary);
    }

    // 5) Nunca se desactivó nada, pese a deactivateStaleAfterHours.
    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-log-leak-old` } });
    expect(oldOffer.isActive).toBe(true);

    // 6) El lock se liberó: una sincronización inmediatamente posterior de la MISMA fuente no queda bloqueada.
    const nextSummary = await runCatalogSync({
      source: OfferSource.AWIN,
      rows: [row({ externalId: `${PREFIX}-after-log-leak-failure` })],
      scope: DEFAULT_SCOPE,
      feedFetchedSuccessfully: true,
    });
    expect(nextSummary.status).toBe("SUCCESS");
  });
});
