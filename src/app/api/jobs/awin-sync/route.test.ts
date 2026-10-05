import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AwinOrchestratorSummary } from "@/server/catalogSync/awinOrchestrator";

const { runAwinCatalogSyncCycleMock, verifyAwinSyncSignatureMock, persistAwinSyncCycleRunMock, afterTasks } = vi.hoisted(() => ({
  runAwinCatalogSyncCycleMock: vi.fn(),
  verifyAwinSyncSignatureMock: vi.fn(),
  persistAwinSyncCycleRunMock: vi.fn(),
  afterTasks: [] as Promise<unknown>[],
}));

vi.mock("@/server/catalogSync/awinOrchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/catalogSync/awinOrchestrator")>();
  return { ...actual, runAwinCatalogSyncCycle: runAwinCatalogSyncCycleMock };
});

vi.mock("@/server/jobs/awinSyncRequestAuth", () => ({
  verifyAwinSyncSignature: verifyAwinSyncSignatureMock,
}));

// Sin este stub, estas pruebas llamarían a la implementación real (que usa
// `withDb`/Prisma) cada vez que el ciclo simulado resuelve — nunca deben
// depender de si hay una base de datos real configurada en este entorno.
vi.mock("@/server/repositories/awinSyncCycles", () => ({
  persistAwinSyncCycleRun: persistAwinSyncCycleRunMock,
}));

// `after()` solo funciona dentro de una petición real servida por Next.js.
// En los tests unitarios se sustituye por una ejecución inmediata cuya
// promesa se recoge en `afterTasks`, para poder esperarla de forma
// determinista antes de comprobar los logs que produce en segundo plano.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      afterTasks.push(Promise.resolve().then(task));
    },
  };
});

// Import DESPUÉS de los vi.mock (hoisted de todos modos, pero así queda claro el orden lógico).
import { POST } from "./route";

const ENDPOINT = "https://preciara.es/api/jobs/awin-sync";
const API_KEY = "fixture-awin-datafeed-api-key";
const FEED_LIST_URL = "https://productdata.awin.com/datafeed/list/fixture";

function buildSummary(overrides: Partial<AwinOrchestratorSummary> = {}): AwinOrchestratorSummary {
  return {
    dryRun: true,
    listFatalError: false,
    feedsDiscovered: 0,
    feedsApproved: 0,
    feedsSkippedNotJoined: 0,
    feedsSkippedNonSpanishLanguage: 0,
    feedsInvalidInList: 0,
    feedsDuplicate: 0,
    advertisersProcessed: 0,
    advertisersSuccessful: 0,
    advertisersIncomplete: 0,
    validRowsTotal: 0,
    invalidRowsTotal: 0,
    feedsCompleted: 0,
    feedsFailed: 0,
    feedsEmpty: 0,
    productsCreatedTotal: 0,
    productsUpdatedTotal: 0,
    offersCreatedTotal: 0,
    offersUpdatedTotal: 0,
    staleDeactivatedTotal: 0,
    advertisers: [],
    feeds: [],
    skippedFeeds: [],
    ...overrides,
  };
}

function setConfigEnv() {
  process.env.AWIN_DATAFEED_API_KEY = API_KEY;
  process.env.AWIN_DATAFEED_LIST_URL = FEED_LIST_URL;
}
function clearConfigEnv() {
  delete process.env.AWIN_DATAFEED_API_KEY;
  delete process.env.AWIN_DATAFEED_LIST_URL;
  delete process.env.AWIN_DEACTIVATE_STALE_AFTER_HOURS;
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest(ENDPOINT, {
    method: "POST",
    headers: { "x-preciara-timestamp": "1700000000", "x-preciara-signature": "a".repeat(64), ...headers },
    body: rawBody,
  });
}

async function flushAfterTasks() {
  await Promise.all(afterTasks);
  afterTasks.length = 0;
}

describe("POST /api/jobs/awin-sync (disparador privado de sincronización)", () => {
  beforeEach(() => {
    runAwinCatalogSyncCycleMock.mockReset();
    verifyAwinSyncSignatureMock.mockReset();
    persistAwinSyncCycleRunMock.mockReset().mockResolvedValue(undefined);
    afterTasks.length = 0;
  });
  afterEach(() => {
    clearConfigEnv();
  });

  it("sin AWIN_DATAFEED_API_KEY configurada, responde 404 sin revelar que la integración existe", async () => {
    clearConfigEnv();
    const request = postRequest({ dryRun: true });
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(verifyAwinSyncSignatureMock).not.toHaveBeenCalled();
    expect(runAwinCatalogSyncCycleMock).not.toHaveBeenCalled();
  });

  it("firma inválida (según verifyAwinSyncSignature), responde 401 y nunca llama a runAwinCatalogSyncCycle", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(false);
    const request = postRequest({ dryRun: true });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(runAwinCatalogSyncCycleMock).not.toHaveBeenCalled();
  });

  it("cuerpo no es JSON válido, responde 400", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    const request = postRequest("esto no es json {");
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(runAwinCatalogSyncCycleMock).not.toHaveBeenCalled();
  });

  it("cuerpo JSON válido pero con forma incorrecta (falta dryRun o tiene campos extra), responde 400", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    const response1 = await POST(postRequest({}));
    expect(response1.status).toBe(400);

    const response2 = await POST(postRequest({ dryRun: true, extra: "campo-no-esperado" }));
    expect(response2.status).toBe(400);

    const response3 = await POST(postRequest({ dryRun: "true" }));
    expect(response3.status).toBe(400);
    expect(runAwinCatalogSyncCycleMock).not.toHaveBeenCalled();
  });

  it("cuerpo mayor que el límite permitido (Content-Length), responde 413 sin verificar la firma", async () => {
    setConfigEnv();
    const request = postRequest(JSON.stringify({ dryRun: true }), { "content-length": "999999" });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(verifyAwinSyncSignatureMock).not.toHaveBeenCalled();
  });

  it("firma válida y dryRun=true: responde 202 de inmediato y ejecuta runAwinCatalogSyncCycle en segundo plano con dryRun=true", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    const summary = buildSummary({ dryRun: true, feedsDiscovered: 899, feedsApproved: 0 });
    runAwinCatalogSyncCycleMock.mockResolvedValue(summary);

    const request = postRequest({ dryRun: true });
    const response = await POST(request);

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ accepted: true, dryRun: true });

    await flushAfterTasks();
    expect(runAwinCatalogSyncCycleMock).toHaveBeenCalledWith({ apiKey: API_KEY, feedListUrl: FEED_LIST_URL, dryRun: true, deactivateStaleAfterHours: undefined });
    expect(persistAwinSyncCycleRunMock).toHaveBeenCalledWith(summary, expect.objectContaining({ startedAt: expect.any(Date), finishedAt: expect.any(Date) }));
  });

  it("firma válida y dryRun=false: la petición en segundo plano pasa dryRun=false a runAwinCatalogSyncCycle", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    runAwinCatalogSyncCycleMock.mockResolvedValue(buildSummary({ dryRun: false }));

    const request = postRequest({ dryRun: false });
    const response = await POST(request);

    expect(response.status).toBe(202);
    expect((await response.json()).dryRun).toBe(false);

    await flushAfterTasks();
    expect(runAwinCatalogSyncCycleMock).toHaveBeenCalledWith({ apiKey: API_KEY, feedListUrl: FEED_LIST_URL, dryRun: false, deactivateStaleAfterHours: undefined });
  });

  it("con AWIN_DEACTIVATE_STALE_AFTER_HOURS válida, se pasa tal cual a runAwinCatalogSyncCycle", async () => {
    setConfigEnv();
    process.env.AWIN_DEACTIVATE_STALE_AFTER_HOURS = "72";
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    runAwinCatalogSyncCycleMock.mockResolvedValue(buildSummary({ dryRun: false }));

    const request = postRequest({ dryRun: false });
    const response = await POST(request);
    expect(response.status).toBe(202);

    await flushAfterTasks();
    expect(runAwinCatalogSyncCycleMock).toHaveBeenCalledWith({ apiKey: API_KEY, feedListUrl: FEED_LIST_URL, dryRun: false, deactivateStaleAfterHours: 72 });
  });

  it("con AWIN_DEACTIVATE_STALE_AFTER_HOURS inválida (p. ej. negativa o no numérica), nunca bloquea el ciclo: se ignora (se trata como ausente) y se registra un aviso", async () => {
    setConfigEnv();
    process.env.AWIN_DEACTIVATE_STALE_AFTER_HOURS = "no-es-un-numero";
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    runAwinCatalogSyncCycleMock.mockResolvedValue(buildSummary({ dryRun: false }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const request = postRequest({ dryRun: false });
    const response = await POST(request);
    expect(response.status).toBe(202);

    await flushAfterTasks();
    expect(runAwinCatalogSyncCycleMock).toHaveBeenCalledWith({ apiKey: API_KEY, feedListUrl: FEED_LIST_URL, dryRun: false, deactivateStaleAfterHours: undefined });
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "awin_sync_invalid_deactivate_stale_config" }));
    warnSpy.mockRestore();
  });

  it("la respuesta HTTP nunca expone la API key ni la URL del feed, aunque runAwinCatalogSyncCycle falle después", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    runAwinCatalogSyncCycleMock.mockRejectedValue(new Error(`fallo con secreto filtrado: ${API_KEY}`));

    const request = postRequest({ dryRun: true });
    const response = await POST(request);
    const rawBody = JSON.stringify(await response.json());
    expect(rawBody).not.toContain(API_KEY);
    expect(rawBody).not.toContain(FEED_LIST_URL);

    await flushAfterTasks();
  });

  it("si runAwinCatalogSyncCycle falla en segundo plano, no lanza sin capturar (la tarea en segundo plano se resuelve)", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    runAwinCatalogSyncCycleMock.mockRejectedValue(new Error("fallo simulado de sincronización"));

    const request = postRequest({ dryRun: true });
    const response = await POST(request);
    expect(response.status).toBe(202);

    await expect(flushAfterTasks()).resolves.toBeUndefined();
  });

  it("cero feeds aprobados (caso real actual): sigue devolviendo 202 y ejecutando el ciclo como no-op seguro", async () => {
    setConfigEnv();
    verifyAwinSyncSignatureMock.mockReturnValue(true);
    runAwinCatalogSyncCycleMock.mockResolvedValue(buildSummary({ feedsDiscovered: 899, feedsApproved: 0, dryRun: true }));

    const request = postRequest({ dryRun: true });
    const response = await POST(request);
    expect(response.status).toBe(202);

    await flushAfterTasks();
    expect(runAwinCatalogSyncCycleMock).toHaveBeenCalledTimes(1);
  });
});
