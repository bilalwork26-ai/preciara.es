import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AwinOrchestratorSummary } from "@/server/catalogSync/awinOrchestrator";
import { AwinOrchestratorLockBusyError } from "@/server/catalogSync/awinOrchestrator";
import { computeMsUntilNextRun, register, runScheduledAwinSync, scheduleNextAwinSync } from "./instrumentation";

function buildSummary(overrides: Partial<AwinOrchestratorSummary> = {}): AwinOrchestratorSummary {
  return {
    dryRun: false,
    listFatalError: false,
    feedsDiscovered: 0,
    feedsApproved: 0,
    feedsSkippedNotJoined: 0,
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
    ...overrides,
  };
}

describe("computeMsUntilNextRun", () => {
  const TIMES = [
    { hour: 4, minute: 17 },
    { hour: 16, minute: 17 },
  ];

  it("antes de la primera hora de hoy: devuelve el tiempo hasta las 04:17 UTC de hoy", () => {
    const now = new Date("2026-01-15T03:00:00.000Z");
    expect(computeMsUntilNextRun(now, TIMES)).toBe(77 * 60 * 1000); // 1h17m
  });

  it("entre las dos horas de hoy: devuelve el tiempo hasta las 16:17 UTC de hoy, no hasta mañana", () => {
    const now = new Date("2026-01-15T05:00:00.000Z");
    expect(computeMsUntilNextRun(now, TIMES)).toBe((11 * 60 + 17) * 60 * 1000); // 11h17m
  });

  it("después de las dos horas de hoy: devuelve el tiempo hasta las 04:17 UTC de MAÑANA", () => {
    const now = new Date("2026-01-15T20:00:00.000Z");
    const expected = new Date("2026-01-16T04:17:00.000Z").getTime() - now.getTime();
    expect(computeMsUntilNextRun(now, TIMES)).toBe(expected);
  });

  it("justo en el instante exacto de una hora programada: la trata como YA PASADA (estrictamente posterior, nunca >=) y salta a la siguiente — evita el doble disparo inmediato al reprogramar", () => {
    const now = new Date("2026-01-15T04:17:00.000Z");
    const expected = new Date("2026-01-15T16:17:00.000Z").getTime() - now.getTime();
    expect(computeMsUntilNextRun(now, TIMES)).toBe(expected);
  });

  it("un segundo después de una hora programada: tampoco la reutiliza, pasa a la siguiente", () => {
    const now = new Date("2026-01-15T04:17:01.000Z");
    const expected = new Date("2026-01-15T16:17:00.000Z").getTime() - now.getTime();
    expect(computeMsUntilNextRun(now, TIMES)).toBe(expected);
  });

  it("nunca depende de la zona horaria local del proceso: usa exclusivamente campos UTC", () => {
    // Si esta prueba usara getHours()/getMinutes() en vez de getUTCHours()/getUTCMinutes(),
    // el resultado cambiaría según TZ del proceso — comprobamos que NO cambia.
    const now = new Date("2026-06-15T10:00:00.000Z");
    const result = computeMsUntilNextRun(now, TIMES);
    const expected = new Date("2026-06-15T16:17:00.000Z").getTime() - now.getTime();
    expect(result).toBe(expected);
  });
});

describe("runScheduledAwinSync", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.AWIN_DEACTIVATE_STALE_AFTER_HOURS;
  });

  it("ciclo correcto: registra awin_sync_done con dryRun:false y los contadores del resumen, nunca lanza", async () => {
    const runCycle = vi.fn().mockResolvedValue(buildSummary({ feedsDiscovered: 900, feedsApproved: 12, productsCreatedTotal: 40 }));

    await expect(runScheduledAwinSync("fake-key", "https://ui.awin.com/fake-list", { runCycle })).resolves.toBeUndefined();

    expect(runCycle).toHaveBeenCalledWith({ apiKey: "fake-key", feedListUrl: "https://ui.awin.com/fake-list", dryRun: false, deactivateStaleAfterHours: undefined });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "awin_sync_done", dryRun: false, feedsDiscovered: 900, feedsApproved: 12, productsCreatedTotal: 40 })
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("fallo del ciclo (error no modelado): registra awin_sync_failed, nunca lanza", async () => {
    const runCycle = vi.fn().mockRejectedValue(new Error("fallo simulado"));

    await expect(runScheduledAwinSync("fake-key", undefined, { runCycle })).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "awin_sync_failed" }));
  });

  it("bloqueo de ciclo ya en curso (AwinOrchestratorLockBusyError): registra awin_sync_lock_busy, nunca lanza", async () => {
    const runCycle = vi.fn().mockRejectedValue(new AwinOrchestratorLockBusyError());

    await expect(runScheduledAwinSync("fake-key", undefined, { runCycle })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "awin_sync_lock_busy" }));
  });

  it("AWIN_DEACTIVATE_STALE_AFTER_HOURS inválida: se ignora (undefined) y se avisa, sin bloquear el ciclo", async () => {
    process.env.AWIN_DEACTIVATE_STALE_AFTER_HOURS = "no-es-un-numero";
    const runCycle = vi.fn().mockResolvedValue(buildSummary());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runScheduledAwinSync("fake-key", undefined, { runCycle });

    expect(runCycle).toHaveBeenCalledWith(expect.objectContaining({ deactivateStaleAfterHours: undefined }));
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "awin_sync_invalid_deactivate_stale_config" }));
    warnSpy.mockRestore();
  });

  it("nunca registra la API key ni la URL del feed en ningún log", async () => {
    const runCycle = vi.fn().mockResolvedValue(buildSummary());
    await runScheduledAwinSync("api-key-secreta-canario", "https://ui.awin.com/secreto-canario", { runCycle });

    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls];
    const loggedText = allCalls.map((args) => args.map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")).join("\n");
    expect(loggedText).not.toContain("api-key-secreta-canario");
    expect(loggedText).not.toContain("secreto-canario");
  });
});

describe("scheduleNextAwinSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.AWIN_DATAFEED_API_KEY;
    delete process.env.AWIN_DATAFEED_LIST_URL;
  });

  it("NUNCA ejecuta un ciclo de inmediato: solo programa un temporizador para la próxima hora", () => {
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    const runCycle = vi.fn().mockResolvedValue(buildSummary());
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";

    scheduleNextAwinSync({ runCycle });

    expect(runCycle).not.toHaveBeenCalled();
  });

  it("al llegar la hora programada, ejecuta el ciclo y se reprograma a sí mismo (nunca deja de haber una próxima ejecución)", async () => {
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";
    const runCycle = vi.fn().mockResolvedValue(buildSummary());

    scheduleNextAwinSync({ runCycle });
    await vi.advanceTimersByTimeAsync(77 * 60 * 1000); // hasta las 04:17 UTC
    expect(runCycle).toHaveBeenCalledTimes(1);

    // Se reprogramó: avanzar hasta la siguiente hora (16:17 UTC) dispara una 2ª ejecución.
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(runCycle).toHaveBeenCalledTimes(2);
  });

  it("si el ciclo falla, igualmente se reprograma la siguiente ejecución (un fallo nunca detiene el programador)", async () => {
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";
    const runCycle = vi.fn().mockRejectedValue(new Error("fallo simulado"));

    scheduleNextAwinSync({ runCycle });
    await vi.advanceTimersByTimeAsync(77 * 60 * 1000);
    expect(runCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(runCycle).toHaveBeenCalledTimes(2); // se siguió reprogramando pese al fallo
  });

  it("nunca solapa: dos ejecuciones seguidas del temporizador nunca coinciden (setTimeout, no setInterval)", async () => {
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";
    let concurrent = 0;
    let maxConcurrent = 0;
    const runCycle = vi.fn().mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      return buildSummary();
    });

    scheduleNextAwinSync({ runCycle });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); // un día entero: ambas horas se disparan

    expect(maxConcurrent).toBe(1);
    expect(runCycle).toHaveBeenCalledTimes(2);
  });

  it("si falta AWIN_DATAFEED_API_KEY en el momento de la ejecución programada, no llama a runCycle pero SÍ se reprograma", async () => {
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    delete process.env.AWIN_DATAFEED_API_KEY;
    const runCycle = vi.fn();

    scheduleNextAwinSync({ runCycle });
    await vi.advanceTimersByTimeAsync(77 * 60 * 1000);

    expect(runCycle).not.toHaveBeenCalled();
    // Reprogramado igualmente: la siguiente hora también intenta (y tampoco ejecuta, sin API key).
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(runCycle).not.toHaveBeenCalled();
  });
});

describe("register", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.AWIN_DATAFEED_API_KEY;
    delete process.env.NEXT_RUNTIME;
  });

  it("runtime distinto de 'nodejs' (p. ej. edge): no programa nada", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";
    const runCycle = vi.fn().mockResolvedValue(buildSummary());

    register({ runCycle });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(runCycle).not.toHaveBeenCalled();
  });

  it("sin AWIN_DATAFEED_API_KEY: no programa nada, aunque el runtime sea 'nodejs'", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.AWIN_DATAFEED_API_KEY;
    const runCycle = vi.fn().mockResolvedValue(buildSummary());

    register({ runCycle });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(runCycle).not.toHaveBeenCalled();
  });

  it("runtime 'nodejs' + AWIN_DATAFEED_API_KEY presente: programa el ciclo, que se dispara en la hora que corresponda", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";
    const runCycle = vi.fn().mockResolvedValue(buildSummary());

    register({ runCycle });
    expect(runCycle).not.toHaveBeenCalled(); // register() nunca ejecuta de inmediato

    await vi.advanceTimersByTimeAsync(77 * 60 * 1000);
    expect(runCycle).toHaveBeenCalledTimes(1);
  });

  it("register() completa de forma síncrona (no devuelve una promesa que haya que esperar)", () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.AWIN_DATAFEED_API_KEY = "fake-key";
    const result = register({ runCycle: vi.fn().mockResolvedValue(buildSummary()) });
    expect(result).toBeUndefined();
  });
});
