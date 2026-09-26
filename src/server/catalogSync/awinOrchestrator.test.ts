import { inspect } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/client";
import { OfferSource } from "@/generated/prisma";
import {
  AWIN_CYCLE_LOCK_NAME,
  AwinOrchestratorLockBusyError,
  deriveAwinMerchantSlug,
  runAwinCatalogSyncCycle,
  type AwinOrchestratorDeps,
  type AwinOrchestratorSummary,
} from "./awinOrchestrator";
import { parseAwinFeedList, SensitiveFeedUrl, type AwinFeedListResult } from "./awinFeedListParser";
import { parseAwinProductFeed, type AwinFeedContext, type AwinFeedRowResult } from "./awinFeedParser";
import { downloadAwinProductFeed, type AwinTransportOptions } from "./awinTransport";
import { StreamingCsvTruncatedError } from "./streamingCsv";
import type { NormalizedOfferRow } from "./types";

const PREFIX = "test-orch";

// ───────────────────────── Fixtures de listas/feeds ─────────────────────────

const FEED_LIST_HEADER = "Advertiser ID,Advertiser Name,Primary Region,Membership Status,Feed ID,Feed Name,Language,Vertical,Last Imported,URL";
const PRODUCT_HEADER =
  "aw_product_id,merchant_product_id,product_name,brand_name,product_model,model_number,merchant_category,merchant_image_url,aw_image_url,large_image,image_url,search_price,currency,delivery_cost,merchant_deep_link,aw_deep_link,in_stock,product_GTIN,ean,upc";

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function row(header: string, fields: Record<string, string>): string {
  return header
    .split(",")
    .map((col) => csvField(fields[col] ?? ""))
    .join(",");
}
function feedListRow(fields: Record<string, string>): string {
  return row(FEED_LIST_HEADER, fields);
}
function productRow(fields: Record<string, string>): string {
  return row(PRODUCT_HEADER, fields);
}
function buildFeedListCsv(rows: Record<string, string>[]): string {
  return [FEED_LIST_HEADER, ...rows.map(feedListRow)].join("\n");
}
function buildProductCsv(rows: Record<string, string>[]): string {
  return [PRODUCT_HEADER, ...rows.map(productRow)].join("\n");
}

/** URL de feed sintética con un marcador identificable en la ruta — el `downloadProductFeed` simulado la usa para decidir qué CSV (o fallo) devolver por feed, sin tocar la red. */
function feedUrlFor(marker: string): string {
  return `https://productdata.awin.com/datafeed/download/apikey/fake/fid/${marker}/format/csv`;
}
function markerFromFeedUrl(feedUrl: SensitiveFeedUrl): string {
  const raw = feedUrl.revealSensitiveUrlForDownload();
  const match = raw.match(/\/fid\/([^/]+)\/format/);
  if (!match) throw new Error("marcador no encontrado en la URL de feed simulada");
  return match[1];
}

type ProductFeedBehavior = { csv: string } | { throws: () => Error };

/** `downloadProductFeed` simulado: nunca hace red, reutiliza el parser REAL (`parseAwinProductFeed`) sobre CSV en memoria — transporte sustituido, parsing real. */
function makeDownloadProductFeed(byMarker: Record<string, ProductFeedBehavior>): NonNullable<AwinOrchestratorDeps["downloadProductFeed"]> {
  return (feedUrl: SensitiveFeedUrl, context: AwinFeedContext): AsyncGenerator<AwinFeedRowResult> => {
    const marker = markerFromFeedUrl(feedUrl);
    const behavior = byMarker[marker];
    if (!behavior) {
      throw new Error(`fake downloadProductFeed: sin comportamiento configurado para "${marker}"`);
    }
    if ("throws" in behavior) {
      const err = behavior.throws;
      return (async function* (): AsyncGenerator<AwinFeedRowResult> {
        throw err();
      })();
    }
    return parseAwinProductFeed(behavior.csv, context);
  };
}

/** `downloadFeedList` simulado a partir de un CSV en memoria — mismo motivo: transporte sustituido, parsing real. */
function makeDownloadFeedList(csv: string): NonNullable<AwinOrchestratorDeps["downloadFeedList"]> {
  return (): AsyncGenerator<AwinFeedListResult> => parseAwinFeedList(csv);
}
function makeThrowingDownloadFeedList(error: () => Error): NonNullable<AwinOrchestratorDeps["downloadFeedList"]> {
  return (): AsyncGenerator<AwinFeedListResult> =>
    (async function* (): AsyncGenerator<AwinFeedListResult> {
      throw error();
    })();
}

// Debe representar el momento de ESTA ejecución: una fecha literal acaba
// convirtiendo las ofertas recién importadas en "viejas" cuando el calendario
// real avanza más de `deactivateStaleAfterHours` (72 h).
const FIXED_NOW = new Date();
const NO_WAIT: AwinTransportOptions["wait"] = async () => undefined;

function baseDeps(overrides: Partial<AwinOrchestratorDeps> = {}): AwinOrchestratorDeps {
  return { now: () => FIXED_NOW, ...overrides };
}

async function cleanup() {
  if (!prisma) return;
  await prisma.product.deleteMany({ where: { category: { slug: { startsWith: PREFIX } } } });
  await prisma.merchant.deleteMany({ where: { slug: { startsWith: "awin-" } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.importRun.deleteMany({ where: { source: { startsWith: "sync:awin:" } } });
}

function feedOutcomesFor(summary: AwinOrchestratorSummary, advertiserId: string) {
  return summary.feeds.filter((f) => f.advertiserId === advertiserId);
}
function advertiserOutcome(summary: AwinOrchestratorSummary, advertiserId: string) {
  const found = summary.advertisers.find((a) => a.advertiserId === advertiserId);
  if (!found) throw new Error(`no se encontró el anunciante ${advertiserId} en el resumen`);
  return found;
}

describe.skipIf(!process.env.DATABASE_URL)("runAwinCatalogSyncCycle: descubrimiento y agrupación automática", () => {
  afterAll(cleanup);

  it("dos anunciantes aprobados se procesan automáticamente, sin selección manual", async () => {
    const advA = "910001";
    const advB = "910002";
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": advA, "Advertiser Name": "Tienda A", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "Feed A", URL: feedUrlFor("a1") },
      { "Advertiser ID": advB, "Advertiser Name": "Tienda B", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "Feed B", URL: feedUrlFor("b1") },
    ]);
    const productCsvA = buildProductCsv([{ aw_product_id: "p1", product_name: "Producto A1", merchant_category: `${PREFIX}-cat`, search_price: "9.99", currency: "EUR", aw_deep_link: "https://x.invalid/a1" }]);
    const productCsvB = buildProductCsv([{ aw_product_id: "p1", product_name: "Producto B1", merchant_category: `${PREFIX}-cat`, search_price: "8.99", currency: "EUR", aw_deep_link: "https://x.invalid/b1" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: makeDownloadProductFeed({ a1: { csv: productCsvA }, b1: { csv: productCsvB } }),
      }),
    });

    expect(summary.listFatalError).toBe(false);
    expect(summary.advertisersProcessed).toBe(2);
    expect(summary.advertisersSuccessful).toBe(2);
    expect(summary.feedsCompleted).toBe(2);
    expect(summary.validRowsTotal).toBe(2);

    const merchantA = await prisma!.merchant.findUniqueOrThrow({ where: { slug: deriveAwinMerchantSlug(advA) } });
    const merchantB = await prisma!.merchant.findUniqueOrThrow({ where: { slug: deriveAwinMerchantSlug(advB) } });
    expect(merchantA.name).toBe("Tienda A");
    expect(merchantB.name).toBe("Tienda B");
    expect(merchantA.websiteUrl).toBeNull(); // nunca inventado
  });

  it("varios feeds/idiomas del MISMO anunciante se agrupan bajo un único merchant (slug derivado solo de advertiserId)", async () => {
    const adv = "910010";
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": adv, "Advertiser Name": "Tienda Multi", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "Feed ES", Language: "es", URL: feedUrlFor("multi-es") },
      { "Advertiser ID": adv, "Advertiser Name": "Tienda Multi", "Membership Status": "Joined", "Feed ID": "2", "Feed Name": "Feed PT", Language: "pt", URL: feedUrlFor("multi-pt") },
    ]);
    const csvEs = buildProductCsv([{ aw_product_id: "es-1", product_name: "Producto ES", merchant_category: `${PREFIX}-cat`, search_price: "5", currency: "EUR", aw_deep_link: "https://x.invalid/es-1" }]);
    const csvPt = buildProductCsv([{ aw_product_id: "pt-1", product_name: "Producto PT", merchant_category: `${PREFIX}-cat`, search_price: "6", currency: "EUR", aw_deep_link: "https://x.invalid/pt-1" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: makeDownloadProductFeed({ "multi-es": { csv: csvEs }, "multi-pt": { csv: csvPt } }),
      }),
    });

    expect(summary.advertisersProcessed).toBe(1);
    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.feedCount).toBe(2);
    expect(outcome.feedsCompleted).toBe(2);

    const merchants = await prisma!.merchant.findMany({ where: { slug: deriveAwinMerchantSlug(adv) } });
    expect(merchants).toHaveLength(1); // un único comercio, aunque haya 2 feeds/idiomas

    const offers = await prisma!.offer.findMany({ where: { merchantId: merchants[0].id } });
    expect(offers).toHaveLength(2); // ambas ofertas (ES y PT), cada una con su propio externalId
  });

  it("el orden de procesamiento de anunciantes y de feeds dentro de cada anunciante es determinista (no depende del orden de llegada de la lista)", async () => {
    const advHigh = "910099";
    const advLow = "910020";
    // La lista llega con el anunciante "alto" primero, a propósito.
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": advHigh, "Advertiser Name": "Z", "Membership Status": "Joined", "Feed ID": "2", "Feed Name": "F2", Language: "pt", URL: feedUrlFor("order-high-2") },
      { "Advertiser ID": advHigh, "Advertiser Name": "Z", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", Language: "es", URL: feedUrlFor("order-high-1") },
      { "Advertiser ID": advLow, "Advertiser Name": "A", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("order-low-1") },
    ]);
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: makeDownloadProductFeed({ "order-high-1": { csv }, "order-high-2": { csv }, "order-low-1": { csv } }),
      }),
    });

    // Anunciantes en orden ascendente de advertiserId (determinista, no el orden de llegada).
    expect(summary.advertisers.map((a) => a.advertiserId)).toEqual([advLow, advHigh]);
    // Dentro del anunciante "alto", los feeds en orden determinista por su identidad (feedId 1 antes que 2, aunque la lista los trajera al revés).
    const highFeeds = feedOutcomesFor(summary, advHigh);
    expect(highFeeds.map((f) => f.feedId)).toEqual(["1", "2"]);
  });

  it("una fila 'Not Joined' se ignora: no se descarga ningún feed para ese anunciante, y no cuenta como fallo", async () => {
    const advJoined = "910030";
    const advNotJoined = "910031";
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": advJoined, "Advertiser Name": "Aprobada", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("nj-joined") },
      { "Advertiser ID": advNotJoined, "Advertiser Name": "Pendiente", "Membership Status": "Not Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("nj-not-joined") },
    ]);
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        // Solo se configura comportamiento para el feed Joined: si el orquestador intentara descargar el "Not Joined", el fake lanzaría por falta de configuración y la prueba fallaría.
        downloadProductFeed: makeDownloadProductFeed({ "nj-joined": { csv } }),
      }),
    });

    expect(summary.feedsApproved).toBe(1);
    expect(summary.feedsSkippedNotJoined).toBe(1);
    expect(summary.advertisersProcessed).toBe(1);
    expect(summary.advertisers[0].advertiserId).toBe(advJoined);
  });

  it("un feed duplicado EXACTO (mismo id) en la lista se descarga UNA sola vez", async () => {
    const adv = "910040";
    const duplicateRow = feedListRow({ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("dup-1") });
    const listCsv = [FEED_LIST_HEADER, duplicateRow, duplicateRow].join("\n");
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    let downloadCalls = 0;
    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: (feedUrl, context) => {
          downloadCalls += 1;
          return makeDownloadProductFeed({ "dup-1": { csv } })(feedUrl, context);
        },
      }),
    });

    expect(summary.feedsApproved).toBe(2); // ambas filas de la lista eran "approved"...
    expect(summary.feedsDuplicate).toBe(1); // ...pero una es un duplicado exacto...
    expect(downloadCalls).toBe(1); // ...así que solo se descarga una vez.
    expect(advertiserOutcome(summary, adv).feedCount).toBe(1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runAwinCatalogSyncCycle: aislamiento de fallos", () => {
  afterAll(cleanup);

  it("el fallo de UN anunciante nunca impide procesar los demás (siguen procesándose en orden)", async () => {
    const advFail = "920001";
    const advOk = "920002";
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": advFail, "Advertiser Name": "Falla", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("fail-1") },
      { "Advertiser ID": advOk, "Advertiser Name": "OK", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("ok-1") },
    ]);
    const csvOk = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: makeDownloadProductFeed({
          "fail-1": { throws: () => new StreamingCsvTruncatedError("simulado") },
          "ok-1": { csv: csvOk },
        }),
      }),
    });

    expect(summary.advertisersProcessed).toBe(2);
    expect(advertiserOutcome(summary, advFail).complete).toBe(false);
    expect(advertiserOutcome(summary, advOk).complete).toBe(true);
    expect(advertiserOutcome(summary, advOk).feedsCompleted).toBe(1);
  });

  it("una fila de PRODUCTO inválida (dentro de un feed que por lo demás es correcto) nunca desactiva nada de ese anunciante", async () => {
    const adv = "920010";
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("invalid-row") }]);
    const csv = buildProductCsv([
      { aw_product_id: "good", product_name: "Bueno", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/good" },
      { aw_product_id: "bad", product_name: "Malo", merchant_category: `${PREFIX}-cat`, search_price: "-1", currency: "EUR", aw_deep_link: "https://x.invalid/bad" }, // precio negativo: fila inválida
    ]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "invalid-row": { csv } }) }),
    });

    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.invalidRowsTotal).toBe(1);
    expect(outcome.validRowsTotal).toBe(1);
    expect(outcome.deactivation.executed).toBe(false);
    expect(outcome.deactivation.reason).toBe("INVALID_ROWS_PRESENT");
  });

  it("una fila inválida en la LISTA de feeds bloquea la desactivación de TODO el ciclo, pero no impide importar los feeds aprobados válidos", async () => {
    const adv = "920020";
    const listCsv = [
      FEED_LIST_HEADER,
      "no,tiene,las,columnas,correctas,ni,de,lejos,vale,mal", // fila inválida (no numérica en Advertiser/Feed ID, por ejemplo)
      feedListRow({ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("list-invalid-row") }),
    ].join("\n");
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "list-invalid-row": { csv } }) }),
    });

    expect(summary.feedsInvalidInList).toBeGreaterThan(0);
    expect(summary.advertisersProcessed).toBe(1); // el feed aprobado SÍ se procesó
    expect(advertiserOutcome(summary, adv).feedsCompleted).toBe(1);
    expect(advertiserOutcome(summary, adv).deactivation.executed).toBe(false);
    expect(advertiserOutcome(summary, adv).deactivation.reason).toBe("GLOBAL_LIST_HAD_INVALID_ROWS");
  });

  it("un fallo al descargar la LISTA completa aborta todo el ciclo antes de tocar ningún producto", async () => {
    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({ downloadFeedList: makeThrowingDownloadFeedList(() => new StreamingCsvTruncatedError("simulado")) }),
    });
    expect(summary.listFatalError).toBe(true);
    expect(summary.advertisersProcessed).toBe(0);
    expect(summary.feeds).toHaveLength(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runAwinCatalogSyncCycle: regla conservadora de desactivación", () => {
  afterAll(cleanup);

  it("todos los feeds de un anunciante correctos → una única pasada final de desactivación", async () => {
    const adv = "930001";
    const merchantSlug = deriveAwinMerchantSlug(adv);
    // Oferta vieja previa del mismo comercio (simulando un ciclo anterior), para comprobar que la pasada final la desactiva.
    await prisma!.category.upsert({ where: { slug: `${PREFIX}-cat` }, update: {}, create: { slug: `${PREFIX}-cat`, name: "Cat" } });
    const category = await prisma!.category.findUniqueOrThrow({ where: { slug: `${PREFIX}-cat` } });
    const merchant = await prisma!.merchant.upsert({ where: { slug: merchantSlug }, update: {}, create: { slug: merchantSlug, name: "X", websiteUrl: null } });
    const product = await prisma!.product.create({ data: { slug: `${PREFIX}-930001-old-product`, name: "Viejo", categoryId: category.id } });
    await prisma!.offer.create({
      data: {
        productId: product.id,
        merchantId: merchant.id,
        source: OfferSource.AWIN,
        externalId: `${PREFIX}-930001-old`,
        currentPrice: 1,
        productUrl: "https://x.invalid/old",
        isActive: true,
        lastCheckedAt: new Date(Date.now() - 200 * 3_600_000),
      },
    });

    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("all-ok-1") }]);
    const csv = buildProductCsv([{ aw_product_id: "new", product_name: "Nuevo", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/new" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "all-ok-1": { csv } }) }),
    });

    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.deactivation.executed).toBe(true);
    expect(outcome.deactivation.reason).toBe("OK");
    expect(outcome.deactivation.deactivatedCount).toBe(1);

    const oldOffer = await prisma!.offer.findFirstOrThrow({ where: { merchantId: merchant.id, externalId: `${PREFIX}-930001-old` } });
    expect(oldOffer.isActive).toBe(false);
  });

  it("feed A correcto + feed B falla (mismo anunciante) → A se importa, pero NADA se desactiva", async () => {
    const adv = "930010";
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "FA", URL: feedUrlFor("ab-a") },
      { "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "2", "Feed Name": "FB", URL: feedUrlFor("ab-b") },
    ]);
    const csvA = buildProductCsv([{ aw_product_id: "a1", product_name: "A1", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/a1" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: makeDownloadProductFeed({ "ab-a": { csv: csvA }, "ab-b": { throws: () => new StreamingCsvTruncatedError("simulado") } }),
      }),
    });

    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.complete).toBe(false);
    expect(outcome.deactivation.executed).toBe(false);
    expect(outcome.deactivation.reason).toBe("ADVERTISER_INCOMPLETE");

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: deriveAwinMerchantSlug(adv) } });
    const offerA = await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId: "a1" } });
    expect(offerA).not.toBeNull(); // el feed A correcto sí se importó
  });

  it("un feed vacío (0 filas válidas) → no se desactiva nada de ese anunciante", async () => {
    const adv = "930020";
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("empty-1") }]);
    const csv = buildProductCsv([]); // solo cabecera, cero filas de datos

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "empty-1": { csv } }) }),
    });

    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.feedsEmpty).toBe(1);
    expect(outcome.complete).toBe(true); // vacío no es un fallo...
    expect(outcome.deactivation.executed).toBe(false); // ...pero SÍ bloquea la desactivación.
    expect(outcome.deactivation.reason).toBe("EMPTY_FEED_PRESENT");
  });

  it("un stream truncado DESPUÉS de entregar filas válidas → ese feed queda FAILED y no se desactiva nada", async () => {
    const adv = "930030";
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("truncated-1") }]);

    async function* truncatedAfterValidRows(): AsyncGenerator<AwinFeedRowResult> {
      yield { status: "valid", rowNumber: 1, row: rowFor("t1", adv) };
      throw new StreamingCsvTruncatedError("truncado tras filas válidas (simulado)");
    }

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: (feedUrl) => {
          markerFromFeedUrl(feedUrl); // valida que se pidió el feed esperado
          return truncatedAfterValidRows();
        },
      }),
    });

    const outcome = advertiserOutcome(summary, adv);
    const feedOutcome = feedOutcomesFor(summary, adv)[0];
    expect(feedOutcome.status).toBe("failed");
    // `runCatalogSync` ya captura cualquier fallo de la fuente de filas y lo
    // reclasifica siempre como `SyncStreamError` (protección deliberada,
    // ver syncRun.ts) — este orquestador nunca ve el `StreamingCsvTruncatedError`
    // original, solo que la fuente de ESTE feed falló.
    expect(feedOutcome.failureReason).toBe("FEED_STREAM_FAILED");
    expect(feedOutcome.validRows).toBe(1); // la fila válida previa al truncamiento sí se contó/aplicó
    expect(outcome.deactivation.executed).toBe(false);
    expect(outcome.deactivation.reason).toBe("ADVERTISER_INCOMPLETE");

    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: deriveAwinMerchantSlug(adv) } });
    const offer = await prisma!.offer.findFirst({ where: { merchantId: merchant.id, externalId: "t1" } });
    expect(offer).not.toBeNull(); // aplicada de forma idempotente antes del truncamiento
  });

  it("dryRun: no se escribe nada y nunca se desactiva, aunque se pida deactivateStaleAfterHours", async () => {
    const adv = "930040";
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("dry-1") }]);
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const importRunsBefore = await prisma!.importRun.count();
    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      dryRun: true,
      deactivateStaleAfterHours: 72,
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "dry-1": { csv } }) }),
    });

    expect(summary.dryRun).toBe(true);
    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.deactivation.executed).toBe(false);
    expect(outcome.deactivation.reason).toBe("DRY_RUN");
    const importRunsAfter = await prisma!.importRun.count();
    expect(importRunsAfter).toBe(importRunsBefore);

    const merchant = await prisma!.merchant.findUnique({ where: { slug: deriveAwinMerchantSlug(adv) } });
    expect(merchant).toBeNull(); // dry-run: ni siquiera se creó el comercio
  });

  it("sin deactivateStaleAfterHours: nunca se desactiva nada, aunque todo el ciclo sea perfecto", async () => {
    const adv = "930050";
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("no-deact-1") }]);
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      // deactivateStaleAfterHours omitido a propósito.
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "no-deact-1": { csv } }) }),
    });

    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.complete).toBe(true);
    expect(outcome.deactivation.executed).toBe(false);
    expect(outcome.deactivation.reason).toBe("NOT_REQUESTED");
  });

  it("la pasada final de desactivación NUNCA reaplica productos: los contadores de creación/actualización de esa llamada son cero", async () => {
    const adv = "930060";
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("final-pass-1") }]);
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);

    const runSyncCalls: { deactivateStaleAfterHours?: number; rowsIsEmpty: boolean }[] = [];
    const realRunSync = (await import("./syncRun")).runCatalogSync;
    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deactivateStaleAfterHours: 72,
      deps: baseDeps({
        downloadFeedList: makeDownloadFeedList(listCsv),
        downloadProductFeed: makeDownloadProductFeed({ "final-pass-1": { csv } }),
        runSync: async (params) => {
          // Detecta la pasada final por su `deactivateStaleAfterHours` explícito (solo la lleva esa llamada).
          const collected: NormalizedOfferRow[] = [];
          for await (const r of params.rows) collected.push(r);
          runSyncCalls.push({ deactivateStaleAfterHours: params.deactivateStaleAfterHours, rowsIsEmpty: collected.length === 0 });
          return realRunSync({ ...params, rows: collected });
        },
      }),
    });

    const deactivationCall = runSyncCalls.find((c) => c.deactivateStaleAfterHours !== undefined);
    expect(deactivationCall).toBeDefined();
    expect(deactivationCall!.rowsIsEmpty).toBe(true); // la pasada final nunca lleva filas

    const outcome = advertiserOutcome(summary, adv);
    expect(outcome.deactivation.executed).toBe(true);
    // Solo hubo una fila de producto en TODO el ciclo (feed + pasada final): la pasada final no duplicó nada.
    const merchant = await prisma!.merchant.findUniqueOrThrow({ where: { slug: deriveAwinMerchantSlug(adv) } });
    const offers = await prisma!.offer.findMany({ where: { merchantId: merchant.id } });
    expect(offers).toHaveLength(1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runAwinCatalogSyncCycle: streaming y memoria acotada", () => {
  afterAll(cleanup);

  it("las filas de producto se consumen de forma VERDADERAMENTE incremental (backpressure): cada fila queda aplicada en la BD antes de que el generador produzca la siguiente", async () => {
    const adv = "940001";
    const total = 20;
    const priorRowApplied: boolean[] = [];
    async function* incrementalRows(): AsyncGenerator<AwinFeedRowResult> {
      for (let i = 0; i < total; i++) {
        if (i > 0) {
          const merchant = await prisma!.merchant.findUnique({ where: { slug: deriveAwinMerchantSlug(adv) } });
          const count = merchant ? await prisma!.offer.count({ where: { merchantId: merchant.id, externalId: `inc-${i - 1}` } }) : 0;
          priorRowApplied.push(count === 1);
        }
        yield { status: "valid", rowNumber: i + 1, row: rowFor(`inc-${i}`, adv) };
      }
    }
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("incremental-1") }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: () => incrementalRows() }),
    });

    expect(feedOutcomesFor(summary, adv)[0].validRows).toBe(total);
    expect(priorRowApplied).toHaveLength(total - 1);
    expect(priorRowApplied.every(Boolean)).toBe(true);
  });

  it("el catálogo NUNCA se materializa: un generador perezoso nunca produce una fila nueva antes de que el consumidor termine con la anterior", async () => {
    const adv = "940010";
    const total = 40;
    let produced = 0;
    let consumed = 0;
    let maxLead = 0;
    async function* lazyRows(): AsyncGenerator<AwinFeedRowResult> {
      for (let i = 0; i < total; i++) {
        produced += 1;
        maxLead = Math.max(maxLead, produced - consumed);
        yield { status: "valid", rowNumber: i + 1, row: rowFor(`lazy-${i}`, adv) };
        consumed += 1;
      }
    }
    const listCsv = buildFeedListCsv([{ "Advertiser ID": adv, "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("lazy-1") }]);

    const summary = await runAwinCatalogSyncCycle({
      apiKey: "fake-key",
      deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: () => lazyRows() }),
    });

    expect(feedOutcomesFor(summary, adv)[0].validRows).toBe(total);
    expect(maxLead).toBeLessThanOrEqual(1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runAwinCatalogSyncCycle: bloqueo del ciclo completo", () => {
  afterAll(cleanup);

  it("dos ciclos concurrentes: el segundo queda bloqueado por el bloqueo EXTERIOR (nunca se intercalan)", async () => {
    const distributedLock = await import("@/server/importer/distributedLock");
    const acquireSpy = vi.spyOn(distributedLock, "acquireDistributedLock").mockImplementation(async (name: string) => name !== AWIN_CYCLE_LOCK_NAME);
    const releaseSpy = vi.spyOn(distributedLock, "releaseDistributedLock").mockResolvedValue(undefined);

    try {
      const listCsv = buildFeedListCsv([{ "Advertiser ID": "950001", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("lock-1") }]);
      await expect(
        runAwinCatalogSyncCycle({
          apiKey: "fake-key",
          deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv) }),
        })
      ).rejects.toThrow(AwinOrchestratorLockBusyError);
    } finally {
      acquireSpy.mockRestore();
      releaseSpy.mockRestore();
    }
  });

  it("el bloqueo del ciclo se libera SIEMPRE: éxito, fallo de la lista, y fallo inesperado dentro del ciclo", async () => {
    const acquireCalls: string[] = [];
    const releaseCalls: string[] = [];
    const trackingDeps = (extra: Partial<AwinOrchestratorDeps>): AwinOrchestratorDeps =>
      baseDeps({
        acquireLock: async (name) => {
          acquireCalls.push(name);
          return true;
        },
        releaseLock: async (name) => {
          releaseCalls.push(name);
        },
        ...extra,
      });

    // Caso 1: éxito completo.
    const listCsvOk = buildFeedListCsv([{ "Advertiser ID": "950010", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("release-ok-1") }]);
    const csvOk = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);
    await runAwinCatalogSyncCycle({ apiKey: "fake-key", deps: trackingDeps({ downloadFeedList: makeDownloadFeedList(listCsvOk), downloadProductFeed: makeDownloadProductFeed({ "release-ok-1": { csv: csvOk } }) }) });

    // Caso 2: fallo al descargar la lista (capturado internamente, nunca lanza).
    await runAwinCatalogSyncCycle({ apiKey: "fake-key", deps: trackingDeps({ downloadFeedList: makeThrowingDownloadFeedList(() => new Error("simulado")) }) });

    // Caso 3: fallo INESPERADO dentro del procesamiento — un bug en una
    // dependencia (`now`) que ni `classifyFeedList` ni `processAdvertiser`
    // envuelven en su try/catch (esos capturan deliberadamente fallos del
    // TRANSPORTE/parser/`runCatalogSync`, no un bug de una dependencia
    // básica) — debe propagarse tal cual, pero el lock del ciclo igualmente
    // se libera.
    const listCsvBug = buildFeedListCsv([{ "Advertiser ID": "950020", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("release-bug-1") }]);
    let caught: unknown;
    try {
      await runAwinCatalogSyncCycle({
        apiKey: "fake-key",
        deps: trackingDeps({
          downloadFeedList: makeDownloadFeedList(listCsvBug),
          now: () => {
            throw new TypeError("bug interno simulado (reloj roto), fuera de cualquier try/catch de fallos modelados");
          },
        }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TypeError);

    expect(acquireCalls).toHaveLength(3);
    expect(releaseCalls).toHaveLength(3); // liberado exactamente una vez por cada uno de los 3 ciclos, incluido el que lanzó
    expect(acquireCalls.every((n) => n === AWIN_CYCLE_LOCK_NAME)).toBe(true);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("runAwinCatalogSyncCycle: seguridad — ningún secreto en logs, resultado ni errores; ningún fetch real", () => {
  afterAll(cleanup);

  const CANARY_API_KEY = "CANARY-ORCH-API-KEY-9f8e7d6c";
  const CANARY_TOKEN = "CANARY-ORCH-TOKEN-4d2a1c";

  it("ningún fetch real ocurre en un ciclo con dependencias simuladas (transporte sustituido por completo)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const listCsv = buildFeedListCsv([{ "Advertiser ID": "960001", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: feedUrlFor("no-fetch-1") }]);
    const csv = buildProductCsv([{ aw_product_id: "x", product_name: "P", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/x" }]);
    try {
      await runAwinCatalogSyncCycle({
        apiKey: CANARY_API_KEY,
        deps: baseDeps({ downloadFeedList: makeDownloadFeedList(listCsv), downloadProductFeed: makeDownloadProductFeed({ "no-fetch-1": { csv } }) }),
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("de extremo a extremo con el TRANSPORTE REAL (awinTransport.ts) y un fetch simulado: la API key canario y un token canario en un error de transporte nunca aparecen en el resumen, en los logs ni en el error propagado", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const advOk = "960010";
    const advFail = "960011";
    const listCsv = buildFeedListCsv([
      { "Advertiser ID": advOk, "Advertiser Name": "OK", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: "https://productdata.awin.com/datafeed/download/apikey/e2e-ok/fid/1/format/csv" },
      { "Advertiser ID": advFail, "Advertiser Name": "Falla", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "F1", URL: "https://productdata.awin.com/datafeed/download/apikey/e2e-fail/fid/1/format/csv" },
    ]);
    const productCsvOk = buildProductCsv([{ aw_product_id: "ok1", product_name: "OK1", merchant_category: `${PREFIX}-cat`, search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/ok1" }]);

    const fakeFetch: typeof fetch = (async (input: string | URL) => {
      const url = input.toString();
      if (url.includes("apikey/list")) return new Response(buildFeedListCsv([]), { status: 200 }); // no debería usarse, la lista va por otro fake más abajo
      if (url.includes("e2e-ok")) return new Response(productCsvOk, { status: 200 });
      if (url.includes("e2e-fail")) throw new Error(`fallo de red simulado — url=${url} token=${CANARY_TOKEN}`);
      throw new Error(`fetch simulado sin ruta configurada: ${url}`);
    }) as unknown as typeof fetch;

    let summary: AwinOrchestratorSummary | undefined;
    try {
      summary = await runAwinCatalogSyncCycle({
        apiKey: CANARY_API_KEY,
        deps: baseDeps({
          downloadFeedList: makeDownloadFeedList(listCsv), // metadatos de la lista: sin red real, ya cubierto en awinFeedListParser.test.ts
          downloadProductFeed: (feedUrl, context) => downloadAwinProductFeed(feedUrl, context, { fetchImpl: fakeFetch, wait: NO_WAIT, maxAttempts: 1 }),
        }),
      });
    } finally {
      const consoleCalls = [...errorSpy.mock.calls, ...warnSpy.mock.calls];
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      fetchSpy.mockRestore();

      const canaries = [CANARY_API_KEY, CANARY_TOKEN];
      for (const call of consoleCalls) {
        for (const arg of call) {
          for (const canary of canaries) {
            expect(String(arg)).not.toContain(canary);
            expect(JSON.stringify(arg) ?? "").not.toContain(canary);
            expect(inspect(arg, { depth: null })).not.toContain(canary);
          }
        }
      }
    }

    expect(summary).toBeDefined();
    const okOutcome = advertiserOutcome(summary!, advOk);
    const failOutcome = advertiserOutcome(summary!, advFail);
    expect(okOutcome.complete).toBe(true);
    expect(failOutcome.complete).toBe(false);
    expect(feedOutcomesFor(summary!, advFail)[0].failureReason).toBe("FEED_STREAM_FAILED");

    const summaryText = JSON.stringify(summary);
    const summaryInspected = inspect(summary, { depth: null });
    for (const canary of [CANARY_API_KEY, CANARY_TOKEN]) {
      expect(summaryText).not.toContain(canary);
      expect(summaryInspected).not.toContain(canary);
    }
  });
});

/** Fila de producto válida mínima, para pruebas que construyen `AwinFeedRowResult` directamente (sin pasar por el parser). El `merchant.slug` SIEMPRE se deriva con `deriveAwinMerchantSlug` — debe coincidir con el `scope.merchantSlugs` que el propio orquestador construye para ese anunciante, o `runCatalogSync` la rechazaría como fuera de alcance. */
function rowFor(externalId: string, advertiserId: string): NormalizedOfferRow {
  return {
    source: OfferSource.AWIN,
    merchant: { slug: deriveAwinMerchantSlug(advertiserId), name: "placeholder", websiteUrl: null },
    externalId,
    gtin: null,
    name: `Producto ${externalId}`,
    brand: null,
    model: null,
    category: { slug: `${PREFIX}-cat`, name: "Cat" },
    imageUrl: null,
    price: 1,
    shippingCost: null,
    currency: "EUR",
    availability: "IN_STOCK" as never,
    productUrl: `https://x.invalid/${externalId}`,
    affiliateUrl: null,
    fetchedAt: FIXED_NOW,
  };
}
