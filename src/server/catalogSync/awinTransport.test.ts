import { gzipSync } from "node:zlib";
import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  AWIN_ALLOWED_TRANSPORT_HOSTS,
  AwinTransportError,
  buildAwinFeedListUrl,
  downloadAwinFeedList,
  downloadAwinProductFeed,
  type AwinTransportOptions,
} from "./awinTransport";
import { AwinFeedListFatalError, SensitiveFeedUrl, type AwinFeedListResult } from "./awinFeedListParser";
import { AwinFeedFatalError, type AwinFeedRowResult } from "./awinFeedParser";
import { StreamingCsvTruncatedError } from "./streamingCsv";
import type { NormalizedMerchant } from "./types";

/** Un token distintivo y muy improbable de aparecer por azar — actúa de "canario": si aparece en cualquier salida pública (error, log, serialización), la prueba correspondiente debe fallar. */
const CANARY_API_KEY = "CANARY-TRANSPORT-SECRET-4b3c2a1f";

const MERCHANT: NormalizedMerchant = { slug: "tienda-canario", name: "Tienda Canario", websiteUrl: "https://tienda-canario.example.invalid" };

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

// ───────────────────────── Utilidades de streams de prueba ─────────────────────────

function chunkString(content: string, size: number): string[] {
  if (content.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < content.length; i += size) out.push(content.slice(i, i + size));
  return out;
}

function byteChunks(content: string, size: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(content);
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out;
}

function streamFromChunks(chunks: (string | Uint8Array)[], onChunk?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      onChunk?.();
      const chunk = chunks[index++];
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
    },
  });
}

function streamThatErrorsAfter(chunks: string[], breakAfter: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= breakAfter || index >= chunks.length) {
        controller.error(new Error(`conexión cortada a mitad de la descarga (simulado) — contiene ${CANARY_API_KEY}`));
        return;
      }
      controller.enqueue(encoder.encode(chunks[index++]));
    },
  });
}

/** Entrega `chunks` (si los hay) y luego se queda COLGADA para siempre: `pull` no vuelve a llamar a `enqueue`/`close`/`error` — nunca se resuelve ninguna lectura posterior. Simula un servidor que responde 200 y deja el cuerpo bloqueado indefinidamente. */
function streamThatStallsAfter(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
      // si no quedan chunks, no se hace nada: la lectura queda pendiente para siempre.
    },
  });
}

/** Entrega `chunks` con una pequeña espera REAL entre cada uno (siempre por debajo del timeout de inactividad de la prueba) — simula una descarga lenta pero que sigue avanzando, que nunca debería cortarse. */
function streamWithDelays(chunks: string[], delayMs: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      controller.enqueue(encoder.encode(chunks[index++]));
    },
  });
}

function textResponse(content: string, opts: { status?: number; headers?: Record<string, string>; chunkSize?: number } = {}): Response {
  const chunkSize = opts.chunkSize ?? Math.max(content.length, 1);
  return new Response(streamFromChunks(chunkString(content, chunkSize)), { status: opts.status ?? 200, headers: opts.headers });
}

function byteSplitResponse(content: string, chunkSize: number, opts: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(streamFromChunks(byteChunks(content, chunkSize)), { status: opts.status ?? 200, headers: opts.headers });
}

function gzipResponse(content: string, opts: { chunkSize?: number; truncate?: number; headers?: Record<string, string> } = {}): Response {
  const full = gzipSync(Buffer.from(content, "utf8"));
  const gz = opts.truncate !== undefined ? full.subarray(0, full.length - opts.truncate) : full;
  const chunkSize = opts.chunkSize ?? gz.length;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < gz.length; i += chunkSize) chunks.push(gz.subarray(i, i + chunkSize));
  return new Response(streamFromChunks(chunks), { status: 200, headers: { "content-encoding": "gzip", ...opts.headers } });
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

/** `fetch` simulado (nunca tráfico real): resuelve cada URL solicitada contra un mapa de proveedores de respuesta, y registra cada llamada — nunca hace ninguna petición de red de verdad. */
function makeFetch(byUrl: Map<string, () => Response> | ((url: string) => Response)): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const resolver = typeof byUrl === "function" ? byUrl : (url: string) => byUrl.get(url)?.();
  const fetchImpl = vi.fn(async (input: string | URL) => {
    const url = input.toString();
    calls.push(url);
    const response = resolver(url);
    if (!response) throw new Error(`fetch simulado sin respuesta programada para ${url}`);
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const NO_WAIT: AwinTransportOptions["wait"] = async () => undefined;

async function collectFeedList(gen: AsyncGenerator<AwinFeedListResult>): Promise<AwinFeedListResult[]> {
  const out: AwinFeedListResult[] = [];
  for await (const r of gen) out.push(r);
  return out;
}
async function collectProductFeed(gen: AsyncGenerator<AwinFeedRowResult>): Promise<AwinFeedRowResult[]> {
  const out: AwinFeedRowResult[] = [];
  for await (const r of gen) out.push(r);
  return out;
}

// ───────────────────────── Pruebas ─────────────────────────

describe("buildAwinFeedListUrl: la URL de la lista también lleva la API key, así que también es un SensitiveFeedUrl", () => {
  it("construye una URL https sobre el host oficial de la lista, con la API key como único segmento de ruta — verificable SOLO revelando el valor (nunca es un URL/string público)", () => {
    const sensitive = buildAwinFeedListUrl("mi-api-key-123");
    expect(sensitive).toBeInstanceOf(SensitiveFeedUrl);
    const url = new URL(sensitive.revealSensitiveUrlForDownload());
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(AWIN_ALLOWED_TRANSPORT_HOSTS[0]);
    expect(url.pathname).toContain("mi-api-key-123");
  });

  it("lanza AwinTransportError si la API key está vacía o compuesta solo por espacios, sin incluirla en el mensaje", () => {
    for (const blank of ["", "   ", "\t\n"]) {
      let caught: unknown;
      try {
        buildAwinFeedListUrl(blank);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AwinTransportError);
      expect((caught as AwinTransportError).code).toBe("MISSING_API_KEY");
      if (blank) expect((caught as AwinTransportError).message).not.toContain(blank);
    }
  });

  it("String(), la interpolación de plantillas, JSON.stringify y la inspección de Node de la representación pública NUNCA contienen el token canario", () => {
    const sensitive = buildAwinFeedListUrl(CANARY_API_KEY);
    expect(String(sensitive)).not.toContain(CANARY_API_KEY);
    expect(`${sensitive}`).not.toContain(CANARY_API_KEY);
    expect(JSON.stringify(sensitive)).not.toContain(CANARY_API_KEY);
    expect(JSON.stringify({ url: sensitive })).not.toContain(CANARY_API_KEY);
    expect(inspect(sensitive)).not.toContain(CANARY_API_KEY);
  });

  it("una API key con '/', '?', '#', '%' y Unicode no altera la estructura de la URL (sigue siendo un único segmento de ruta, en el host oficial) y se recupera EXACTA al decodificar", () => {
    const trickyKey = "a/b?c#d%e日本語 f";
    const sensitive = buildAwinFeedListUrl(trickyKey);
    const url = new URL(sensitive.revealSensitiveUrlForDownload());
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(AWIN_ALLOWED_TRANSPORT_HOSTS[0]);
    // La API key codificada ocupa exactamente el ÚLTIMO segmento de la ruta — ni "/" ni "?" ni "#" dentro de ella lograron crear un segmento, una query o un fragmento adicional.
    const segments = url.pathname.split("/");
    expect(segments).toHaveLength(5); // "", "datafeed", "list", "apikey", "<key codificada>"
    expect(decodeURIComponent(segments[4])).toBe(trickyKey);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it("una API key que ya contiene un '%' no sufre doble codificación: se codifica UNA sola vez y se recupera exacta al decodificar UNA sola vez", () => {
    const keyWithPercent = "clave%2Fcon-percent-literal";
    const sensitive = buildAwinFeedListUrl(keyWithPercent);
    const url = new URL(sensitive.revealSensitiveUrlForDownload());
    const encodedSegment = url.pathname.split("/").at(-1)!;
    expect(decodeURIComponent(encodedSegment)).toBe(keyWithPercent);
  });

  it("la petición simulada recibe internamente la URL de la lista exacta y correctamente codificada (la API key se recupera EXACTA al decodificar el segmento recibido)", async () => {
    const trickyKey = "clave/con?caracteres#especiales%y-ñ";
    let receivedUrl: string | undefined;
    const fetchImpl = vi.fn(async (input: string | URL) => {
      receivedUrl = input.toString();
      return textResponse(buildFeedListCsv([]));
    }) as unknown as typeof fetch;
    await collectFeedList(downloadAwinFeedList(trickyKey, { fetchImpl, wait: NO_WAIT }));
    expect(receivedUrl).toBeDefined();
    const url = new URL(receivedUrl!);
    expect(url.hostname).toBe(AWIN_ALLOWED_TRANSPORT_HOSTS[0]);
    expect(decodeURIComponent(url.pathname.split("/").at(-1)!)).toBe(trickyKey);
  });
});

describe("downloadAwinFeedList: descarga válida en varios fragmentos", () => {
  it("una lista de feeds válida, entregada en fragmentos pequeños, se clasifica correctamente", async () => {
    const csv = buildFeedListCsv([
      { "Advertiser ID": "100", "Advertiser Name": "Tienda Uno", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "Feed A", URL: "https://productdata.awin.com/feed/1" },
      { "Advertiser ID": "200", "Advertiser Name": "Tienda Dos", "Membership Status": "Not Joined", "Feed ID": "2", "Feed Name": "Feed B", URL: "https://productdata.awin.com/feed/2" },
    ]);
    const { fetchImpl } = makeFetch(() => textResponse(csv, { chunkSize: 17 }));
    const results = await collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(results.filter((r) => r.status === "skipped")).toHaveLength(1);
  });
});

describe("downloadAwinProductFeed: descarga válida", () => {
  const context = { merchant: MERCHANT, fetchedAt: new Date("2026-09-23T10:00:00.000Z") };

  it("un feed CSV válido SIN compresión se descarga y normaliza correctamente", async () => {
    const csv = buildProductCsv([{ aw_product_id: "1", product_name: "Producto", merchant_category: "Hogar", search_price: "9.99", currency: "EUR", aw_deep_link: "https://x.invalid/1" }]);
    const { fetchImpl } = makeFetch(() => textResponse(csv, { chunkSize: 23 }));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    const results = await collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "valid")).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "valid", row: { externalId: "1", name: "Producto" } });
  });

  it("un feed gzip VÁLIDO (bytes mágicos 0x1f 0x8b reales) se descomprime y normaliza igual que sin comprimir", async () => {
    const csv = buildProductCsv([{ aw_product_id: "1", product_name: "Producto gzip", merchant_category: "Hogar", search_price: "9.99", currency: "EUR", aw_deep_link: "https://x.invalid/1" }]);
    const { fetchImpl } = makeFetch(() => gzipResponse(csv, { chunkSize: 11 }));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    const results = await collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "valid")).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "valid", row: { name: "Producto gzip" } });
  });

  it("un cuerpo YA descomprimido por fetch, que conserva la cabecera Content-Encoding: gzip, se trata como texto plano (detección por bytes mágicos, nunca por la cabecera)", async () => {
    const csv = buildProductCsv([{ aw_product_id: "1", product_name: "Producto plano", merchant_category: "Hogar", search_price: "5", currency: "EUR", aw_deep_link: "https://x.invalid/1" }]);
    const { fetchImpl } = makeFetch(() => textResponse(csv, { headers: { "content-encoding": "gzip" } }));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    const results = await collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "valid")).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "valid", row: { name: "Producto plano" } });
  });

  it("BOM inicial y un carácter Unicode multibyte partidos EXACTAMENTE entre fragmentos de bytes se decodifican correctamente", async () => {
    const csv = "﻿" + buildProductCsv([{ aw_product_id: "1", product_name: "Cámara 📷 日本語", merchant_category: "Electrónica", search_price: "5", currency: "EUR", aw_deep_link: "https://x.invalid/1" }]);
    const { fetchImpl } = makeFetch(() => byteSplitResponse(csv, 3));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    const results = await collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "valid")).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "valid", row: { name: "Cámara 📷 日本語" } });
  });

  it("una respuesta SIN body (200, cuerpo nulo) se trata como un feed vacío, sin colgarse ni lanzar un error no controlado", async () => {
    const { fetchImpl } = makeFetch(() => new Response(null, { status: 200 }));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    await expect(
      collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }))
    ).rejects.toThrow(AwinFeedFatalError);
  });
});

describe("downloadAwinFeedList: catálogo grande, consumo incremental (nunca se materializa entero antes de empezar)", () => {
  it("procesa miles de filas emitiendo resultados ANTES de haber consumido todos los fragmentos de red", async () => {
    const ROW_COUNT = 4000;
    const rows = Array.from({ length: ROW_COUNT }, (_, i) => ({
      "Advertiser ID": String(1000 + i),
      "Advertiser Name": `Anunciante ${i}`,
      "Membership Status": "Joined",
      "Feed ID": String(9000 + i),
      "Feed Name": `Feed ${i}`,
      URL: `https://productdata.awin.com/feed/${i}`,
    }));
    const csv = buildFeedListCsv(rows);
    const chunks = chunkString(csv, 512);
    let consumedChunks = 0;
    const { fetchImpl } = makeFetch(() => new Response(streamFromChunks(chunks, () => (consumedChunks += 1)), { status: 200 }));

    let firstApprovedAtChunk: number | null = null;
    let approvedCount = 0;
    for await (const result of downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT })) {
      if (result.status === "approved") {
        approvedCount += 1;
        if (firstApprovedAtChunk === null) firstApprovedAtChunk = consumedChunks;
      }
    }
    expect(approvedCount).toBe(ROW_COUNT);
    expect(firstApprovedAtChunk).not.toBeNull();
    expect(firstApprovedAtChunk!).toBeLessThan(chunks.length / 2);
  });
});

describe("timeout mediante AbortController", () => {
  it("una petición que nunca responde se aborta al superar el timeout configurado, con un error público que no cuelga el proceso", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })
    ) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList("key", { fetchImpl, timeoutMs: 25, maxAttempts: 1, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    expect((caught as AwinTransportError).code).toBe("TIMEOUT");
  });
});

describe("error de red cuyo mensaje crudo contiene una URL/token canario: el error público nunca lo filtra", () => {
  it("JSON.stringify, String() e inspección del error público nunca contienen el token ni la URL completa", async () => {
    const canaryUrl = buildAwinFeedListUrl(CANARY_API_KEY).toString();
    const fetchImpl = vi.fn(async () => {
      throw new Error(`getaddrinfo ENOTFOUND — fallo al resolver ${canaryUrl}`);
    }) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList(CANARY_API_KEY, { fetchImpl, maxAttempts: 1, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    const error = caught as AwinTransportError;
    expect(error.message).not.toContain(CANARY_API_KEY);
    expect(error.message).not.toContain(canaryUrl);
    expect(JSON.stringify(error)).not.toContain(CANARY_API_KEY);
    expect(String(error)).not.toContain(CANARY_API_KEY);
    expect(inspect(error)).not.toContain(CANARY_API_KEY);
    expect(inspect(error)).not.toContain(canaryUrl);
  });
});

describe("reintentos: 429 y 5xx transitorios, con límite", () => {
  it.each([429, 500, 503])("un %i seguido de éxito se reintenta y termina en éxito", async (status) => {
    const csv = buildFeedListCsv([{ "Advertiser ID": "1", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://productdata.awin.com/feed/1" }]);
    let call = 0;
    const { fetchImpl } = makeFetch(() => {
      call += 1;
      return call === 1 ? new Response(null, { status }) : textResponse(csv);
    });
    const waitCalls: number[] = [];
    const results = await collectFeedList(downloadAwinFeedList("key", { fetchImpl, maxAttempts: 3, wait: async (attempt) => void waitCalls.push(attempt) }));
    expect(results.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(call).toBe(2);
    expect(waitCalls).toEqual([1]);
  });

  it("agota los reintentos (número acotado de intentos) si el fallo 5xx persiste, y el fetch simulado no se llama más veces de las configuradas", async () => {
    const { fetchImpl, calls } = makeFetch(() => new Response(null, { status: 503 }));
    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList("key", { fetchImpl, maxAttempts: 3, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    expect((caught as AwinTransportError).code).toBe("HTTP_503");
    expect(calls).toHaveLength(3);
  });
});

describe("sin reintento en códigos 4xx permanentes", () => {
  it.each([400, 401, 403, 404])("un %i NUNCA se reintenta: el fetch simulado se llama exactamente una vez", async (status) => {
    const { fetchImpl, calls } = makeFetch(() => new Response(null, { status }));
    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList("key", { fetchImpl, maxAttempts: 5, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    expect((caught as AwinTransportError).code).toBe(`HTTP_${status}`);
    expect(calls).toHaveLength(1);
  });
});

describe("redirecciones", () => {
  it("una redirección a un destino AUTORIZADO se sigue y la descarga termina en éxito", async () => {
    const csv = buildFeedListCsv([{ "Advertiser ID": "1", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://productdata.awin.com/feed/1" }]);
    const start = "https://productdata.awin.com/datafeed/list/apikey/key";
    const target = "https://productdata.awin.com/datafeed/list/apikey/key/redirected";
    const { fetchImpl, calls } = makeFetch((url) => (url === start ? redirectResponse(target) : textResponse(csv)));
    const results = await collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "approved")).toHaveLength(1);
    expect(calls).toEqual([start, target]);
  });

  it("una redirección a un host NO autorizado se rechaza sin llegar a solicitarlo — nunca se sigue automáticamente", async () => {
    const start = "https://productdata.awin.com/datafeed/list/apikey/key";
    const { fetchImpl, calls } = makeFetch((url) => (url === start ? redirectResponse("https://evil.example.com/steal") : textResponse("")));
    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    expect((caught as AwinTransportError).code).toBe("HOST_NOT_ALLOWED");
    expect(calls).toEqual([start]); // nunca se llegó a pedir el destino no autorizado
  });

  it("un bucle/exceso de redirecciones se corta en un número pequeño y acotado de saltos, nunca en un bucle infinito", async () => {
    const start = "https://productdata.awin.com/datafeed/list/apikey/key";
    const { fetchImpl, calls } = makeFetch(() => redirectResponse(start)); // se redirige a sí misma indefinidamente
    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList("key", { fetchImpl, maxRedirects: 3, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    expect((caught as AwinTransportError).code).toBe("TOO_MANY_REDIRECTS");
    expect(calls).toHaveLength(4); // intento inicial + 3 saltos permitidos, nunca más
  });
});

describe("destinos inseguros: se rechazan ANTES de hacer ninguna petición real", () => {
  const context = { merchant: MERCHANT, fetchedAt: new Date("2026-09-23T10:00:00.000Z") };

  it.each([
    ["esquema HTTP en vez de HTTPS", "http://productdata.awin.com/feed", "INSECURE_SCHEME"],
    ["host parecido / subdominio engañoso", "https://productdata.awin.com.evil.example/feed", "HOST_NOT_ALLOWED"],
    ["host que no está en la lista oficial", "https://evil.example.com/feed", "HOST_NOT_ALLOWED"],
    ["puerto no estándar", "https://productdata.awin.com:8443/feed", "NON_STANDARD_PORT"],
    ["credenciales embebidas en la URL", "https://user:pass@productdata.awin.com/feed", "EMBEDDED_CREDENTIALS"],
    ["dirección IP en vez de nombre de host", "https://93.184.216.34/feed", "HOST_NOT_ALLOWED"],
    ["host local/privado (localhost)", "https://localhost/feed", "HOST_NOT_ALLOWED"],
    ["host local/privado (IP privada)", "https://192.168.1.10/feed", "HOST_NOT_ALLOWED"],
  ])("%s se rechaza con el código %s, sin llamar al fetch simulado", async (_label, url, expectedCode) => {
    const { fetchImpl, calls } = makeFetch(() => new Response("no debería llegar aquí"));
    let caught: unknown;
    try {
      await collectProductFeed(downloadAwinProductFeed(new SensitiveFeedUrl(url), context, { fetchImpl, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinTransportError);
    expect((caught as AwinTransportError).code).toBe(expectedCode);
    expect(calls).toHaveLength(0);
  });
});

describe("gzip truncado y stream interrumpido: nunca se presentan como descarga completa", () => {
  const context = { merchant: MERCHANT, fetchedAt: new Date("2026-09-23T10:00:00.000Z") };

  it("un gzip truncado (cortado antes del final) propaga StreamingCsvTruncatedError, nunca un resultado parcial silencioso", async () => {
    const csv = buildProductCsv(
      Array.from({ length: 200 }, (_, i) => ({ aw_product_id: String(i), product_name: `P${i}`, merchant_category: "Hogar", search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/" + i }))
    );
    const { fetchImpl } = makeFetch(() => gzipResponse(csv, { truncate: 20, chunkSize: 37 }));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    await expect(collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }))).rejects.toThrow(StreamingCsvTruncatedError);
  });

  it("una interrupción de red a mitad del cuerpo (sin comprimir) propaga StreamingCsvTruncatedError, nunca filtra el fragmento del error crudo", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => productRow({ aw_product_id: String(i), product_name: `P${i}`, merchant_category: "Hogar", search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/" + i }));
    const chunks = [PRODUCT_HEADER, ...rows];
    const { fetchImpl } = makeFetch(() => new Response(streamThatErrorsAfter(chunks, 5), { status: 200 }));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    let caught: unknown;
    try {
      await collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StreamingCsvTruncatedError);
    expect((caught as Error).message).not.toContain(CANARY_API_KEY);
  });

  it("una lista de feeds vacía tras un fallo de fuente lanza un error fatal reconocible (no cuelga ni se confunde con un feed vacío legítimo)", async () => {
    const { fetchImpl } = makeFetch(() => new Response(streamThatErrorsAfter([FEED_LIST_HEADER], 0), { status: 200 }));
    await expect(collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }))).rejects.toThrow(StreamingCsvTruncatedError);
  });
});

describe("MISSING_HEADER: cabecera ausente sigue tratándose como fatal, no como una fila más", () => {
  it("una lista de feeds completamente vacía (sin cabecera) lanza AwinFeedListFatalError", async () => {
    const { fetchImpl } = makeFetch(() => textResponse(""));
    await expect(collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }))).rejects.toThrow(AwinFeedListFatalError);
  });
});

describe("SensitiveFeedUrl: la única revelación ocurre dentro del transporte", () => {
  it("descargar la LISTA de feeds revela EXACTAMENTE una vez su propia URL (la de la lista, también sensible — ver `buildAwinFeedListUrl`), y nunca toca los `SensitiveFeedUrl` de los feeds individuales que produce como resultado", async () => {
    const revealSpy = vi.spyOn(SensitiveFeedUrl.prototype, "revealSensitiveUrlForDownload");
    revealSpy.mockClear();
    const csv = buildFeedListCsv([{ "Advertiser ID": "1", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://productdata.awin.com/feed/1" }]);
    const { fetchImpl } = makeFetch(() => textResponse(csv));
    const results = await collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "approved")).toHaveLength(1);
    // Una sola revelación en total: la de la URL de la LISTA (necesaria para poder pedirla), nunca la de los `SensitiveFeedUrl` de cada feed individual dentro de los resultados.
    expect(revealSpy).toHaveBeenCalledTimes(1);
    revealSpy.mockRestore();
  });

  it("descargar el FEED DE PRODUCTOS llama a revealSensitiveUrlForDownload() EXACTAMENTE una vez, y en ningún otro sitio", async () => {
    const revealSpy = vi.spyOn(SensitiveFeedUrl.prototype, "revealSensitiveUrlForDownload");
    revealSpy.mockClear();
    const csv = buildProductCsv([{ aw_product_id: "1", product_name: "P", merchant_category: "Hogar", search_price: "1", currency: "EUR", aw_deep_link: "https://x.invalid/1" }]);
    const { fetchImpl } = makeFetch(() => textResponse(csv));
    const feedUrl = new SensitiveFeedUrl("https://productdata.awin.com/datafeed/download/apikey/whatever/fid/1/format/csv");
    const context = { merchant: MERCHANT, fetchedAt: new Date("2026-09-23T10:00:00.000Z") };
    await collectProductFeed(downloadAwinProductFeed(feedUrl, context, { fetchImpl, wait: NO_WAIT }));
    expect(revealSpy).toHaveBeenCalledTimes(1);
    revealSpy.mockRestore();
  });

  it("los resultados 'approved' de la lista de feeds, obtenidos vía transporte, siguen sin filtrar la URL real en JSON.stringify/String/inspección", async () => {
    const canaryFeedUrl = `https://productdata.awin.com/datafeed/download/apikey/${CANARY_API_KEY}/fid/1/format/csv`;
    const csv = buildFeedListCsv([{ "Advertiser ID": "1", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: canaryFeedUrl }]);
    const { fetchImpl } = makeFetch(() => textResponse(csv));
    const results = await collectFeedList(downloadAwinFeedList("key", { fetchImpl, wait: NO_WAIT }));
    const approved = results.find((r) => r.status === "approved");
    expect(approved).toBeDefined();
    expect(JSON.stringify(approved)).not.toContain(CANARY_API_KEY);
    expect(inspect(approved)).not.toContain(CANARY_API_KEY);
    if (approved?.status === "approved") {
      expect(approved.feed.url.revealSensitiveUrlForDownload()).toBe(canaryFeedUrl);
    }
  });
});

describe("timeout de INACTIVIDAD durante la lectura del cuerpo (cubre el hueco tras las cabeceras)", () => {
  it("headers 200 recibidos y el cuerpo NUNCA entrega el primer fragmento: se corta por inactividad, no se cuelga para siempre", async () => {
    const { fetchImpl, calls } = makeFetch(() => new Response(streamThatStallsAfter([]), { status: 200 }));
    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList("key", { fetchImpl, idleTimeoutMs: 25, maxAttempts: 1, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StreamingCsvTruncatedError);
    expect((caught as StreamingCsvTruncatedError).cause).toBeInstanceOf(AwinTransportError);
    expect(((caught as StreamingCsvTruncatedError).cause as AwinTransportError).code).toBe("BODY_IDLE_TIMEOUT");
    expect(calls).toHaveLength(1);
  });

  it("el cuerpo entrega UN fragmento y luego se queda bloqueado: también se corta por inactividad (el timeout no solo protege la espera del primer byte)", async () => {
    const csv = buildFeedListCsv([{ "Advertiser ID": "1", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://productdata.awin.com/feed/1" }]);
    const firstChunk = csv.split("\n")[0] + "\n"; // solo la cabecera — nunca llega ninguna fila de datos
    const { fetchImpl } = makeFetch(() => new Response(streamThatStallsAfter([firstChunk]), { status: 200 }));
    await expect(collectFeedList(downloadAwinFeedList("key", { fetchImpl, idleTimeoutMs: 25, maxAttempts: 1, wait: NO_WAIT }))).rejects.toThrow(StreamingCsvTruncatedError);
  });

  it("una descarga LENTA que sigue produciendo fragmentos dentro del intervalo de inactividad termina correctamente, sin cortarse", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => feedListRow({ "Advertiser ID": String(100 + i), "Advertiser Name": `X${i}`, "Membership Status": "Joined", "Feed ID": String(i), "Feed Name": "A", URL: `https://productdata.awin.com/feed/${i}` }));
    const chunks = [FEED_LIST_HEADER + "\n", ...rows.map((r) => r + "\n")];
    const { fetchImpl } = makeFetch(() => new Response(streamWithDelays(chunks, 15), { status: 200 }));
    const results = await collectFeedList(downloadAwinFeedList("key", { fetchImpl, idleTimeoutMs: 300, wait: NO_WAIT }));
    expect(results.filter((r) => r.status === "approved")).toHaveLength(6);
  });

  it("no se duplica ninguna fila mediante reintento tras una lectura PARCIAL: un idle-timeout a mitad de la descarga nunca se reintenta automáticamente, aunque queden reintentos disponibles", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => feedListRow({ "Advertiser ID": String(100 + i), "Advertiser Name": `X${i}`, "Membership Status": "Joined", "Feed ID": String(i), "Feed Name": "A", URL: `https://productdata.awin.com/feed/${i}` }));
    // Solo se entregan la cabecera + las 2 primeras filas como fragmentos reales; el resto nunca llega (stream colgado).
    const partialChunks = [FEED_LIST_HEADER + "\n", rows[0] + "\n", rows[1] + "\n"];
    const { fetchImpl, calls } = makeFetch(() => new Response(streamThatStallsAfter(partialChunks), { status: 200 }));

    const collected: AwinFeedListResult[] = [];
    let caught: unknown;
    try {
      for await (const result of downloadAwinFeedList("key", { fetchImpl, idleTimeoutMs: 25, maxAttempts: 3, wait: NO_WAIT })) {
        collected.push(result);
      }
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StreamingCsvTruncatedError);
    expect(collected.filter((r) => r.status === "approved")).toHaveLength(2); // las 2 filas ya entregadas antes del corte, nunca repetidas
    expect(calls).toHaveLength(1); // maxAttempts era 3, pero una interrupción a mitad de cuerpo NUNCA se reintenta
  });

  it("los temporizadores de inactividad se limpian SIEMPRE: tras éxito, tras el propio idle-timeout, y tras una cancelación temprana del consumidor — nunca quedan temporizadores activos colgando", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    // Caso 1: éxito completo.
    setTimeoutSpy.mockClear();
    clearTimeoutSpy.mockClear();
    const okCsv = buildFeedListCsv([{ "Advertiser ID": "1", "Advertiser Name": "X", "Membership Status": "Joined", "Feed ID": "1", "Feed Name": "A", URL: "https://productdata.awin.com/feed/1" }]);
    const { fetchImpl: fetchOk } = makeFetch(() => textResponse(okCsv, { chunkSize: 7 }));
    await collectFeedList(downloadAwinFeedList("key", { fetchImpl: fetchOk, wait: NO_WAIT }));
    expect(clearTimeoutSpy.mock.calls.length).toBe(setTimeoutSpy.mock.calls.length);

    // Caso 2: falla por idle-timeout real.
    setTimeoutSpy.mockClear();
    clearTimeoutSpy.mockClear();
    const { fetchImpl: fetchStall } = makeFetch(() => new Response(streamThatStallsAfter([]), { status: 200 }));
    await expect(collectFeedList(downloadAwinFeedList("key", { fetchImpl: fetchStall, idleTimeoutMs: 20, maxAttempts: 1, wait: NO_WAIT }))).rejects.toThrow(StreamingCsvTruncatedError);
    expect(clearTimeoutSpy.mock.calls.length).toBe(setTimeoutSpy.mock.calls.length);

    // Caso 3: el consumidor cancela pronto (dejar de iterar antes de que el feed termine).
    setTimeoutSpy.mockClear();
    clearTimeoutSpy.mockClear();
    const bigRows = Array.from({ length: 30 }, (_, i) => feedListRow({ "Advertiser ID": String(200 + i), "Advertiser Name": `Y${i}`, "Membership Status": "Joined", "Feed ID": String(i), "Feed Name": "A", URL: `https://productdata.awin.com/feed/${i}` }));
    const bigCsv = [FEED_LIST_HEADER, ...bigRows].join("\n");
    const { fetchImpl: fetchBig } = makeFetch(() => textResponse(bigCsv, { chunkSize: 20 }));
    const gen = downloadAwinFeedList("key", { fetchImpl: fetchBig, wait: NO_WAIT });
    await gen.next(); // consume la primera fila...
    await gen.return(undefined); // ...y cancela pronto — el mismo cierre que produciría un `break` en un `for await`.
    expect(clearTimeoutSpy.mock.calls.length).toBe(setTimeoutSpy.mock.calls.length);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it("un idle-timeout con una URL/API key canario en juego nunca filtra el token en el error ni en su causa", async () => {
    const { fetchImpl } = makeFetch(() => new Response(streamThatStallsAfter([]), { status: 200 }));
    let caught: unknown;
    try {
      await collectFeedList(downloadAwinFeedList(CANARY_API_KEY, { fetchImpl, idleTimeoutMs: 20, maxAttempts: 1, wait: NO_WAIT }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StreamingCsvTruncatedError);
    const truncated = caught as StreamingCsvTruncatedError;
    expect(truncated.message).not.toContain(CANARY_API_KEY);
    expect(JSON.stringify(truncated)).not.toContain(CANARY_API_KEY);
    expect(inspect(truncated)).not.toContain(CANARY_API_KEY);
    const cause = truncated.cause as AwinTransportError;
    expect(cause.message).not.toContain(CANARY_API_KEY);
    expect(inspect(cause)).not.toContain(CANARY_API_KEY);
  });
});
