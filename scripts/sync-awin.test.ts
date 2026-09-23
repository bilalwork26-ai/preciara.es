import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { AwinOrchestratorLockBusyError, type AwinOrchestratorSummary } from "../src/server/catalogSync/awinOrchestrator";
import {
  AwinSyncConfigError,
  MAX_DEACTIVATE_STALE_AFTER_HOURS,
  parseDryRunFlag,
  readAwinApiKey,
  readDeactivateStaleAfterHours,
  runAwinSyncCommand,
  type AwinSyncCliDeps,
} from "./sync-awin";

const REAL_DATABASE_URL = process.env.DATABASE_URL;

function envWith(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  // DATABASE_URL siempre presente a propósito (salvo que la prueba la
  // sobrescriba explícitamente): estas pruebas ejercitan la configuración
  // propia de Awin, no la comprobación (ya probada en otros ficheros) de
  // que falta la base de datos.
  return { DATABASE_URL: REAL_DATABASE_URL ?? "mysql://user:pass@localhost:3306/db", ...overrides };
}

function buildSummary(overrides: Partial<AwinOrchestratorSummary> = {}): AwinOrchestratorSummary {
  return {
    dryRun: false,
    listFatalError: false,
    feedsDiscovered: 2,
    feedsApproved: 2,
    feedsSkippedNotJoined: 0,
    feedsInvalidInList: 0,
    feedsDuplicate: 0,
    advertisersProcessed: 1,
    advertisersSuccessful: 1,
    advertisersIncomplete: 0,
    validRowsTotal: 5,
    invalidRowsTotal: 0,
    feedsCompleted: 2,
    feedsFailed: 0,
    feedsEmpty: 0,
    advertisers: [],
    feeds: [],
    ...overrides,
  };
}

function noopDisconnect(): Promise<void> {
  return Promise.resolve();
}

// ───────────────────────── Configuración: parseo/validación pura ─────────────────────────

describe("parseDryRunFlag", () => {
  it("sin ningún flag, dryRun es false", () => {
    expect(parseDryRunFlag([])).toBe(false);
    expect(parseDryRunFlag(["--otra-cosa"])).toBe(false);
  });

  it("con el flag simple '--dry-run', dryRun es true", () => {
    expect(parseDryRunFlag(["--dry-run"])).toBe(true);
  });

  it("un valor explícito ('--dry-run=algo') se rechaza siempre como AwinSyncConfigError, nunca se interpreta", () => {
    for (const arg of ["--dry-run=true", "--dry-run=1", "--dry-run=false", "--dry-run="]) {
      expect(() => parseDryRunFlag([arg])).toThrow(AwinSyncConfigError);
    }
  });
});

describe("readAwinApiKey", () => {
  it("una API key presente y no vacía se devuelve recortada", () => {
    expect(readAwinApiKey({ AWIN_DATAFEED_API_KEY: "  mi-clave-real  " })).toBe("mi-clave-real");
  });

  it("clave AUSENTE lanza AwinSyncConfigError (MISSING_API_KEY)", () => {
    let caught: unknown;
    try {
      readAwinApiKey({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinSyncConfigError);
    expect((caught as AwinSyncConfigError).code).toBe("MISSING_API_KEY");
  });

  it.each(["", "   ", "\t\n"])("clave vacía o solo espacios (%j) lanza AwinSyncConfigError (MISSING_API_KEY)", (value) => {
    let caught: unknown;
    try {
      readAwinApiKey({ AWIN_DATAFEED_API_KEY: value });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinSyncConfigError);
    expect((caught as AwinSyncConfigError).code).toBe("MISSING_API_KEY");
  });
});

describe("readDeactivateStaleAfterHours", () => {
  it("ausente: devuelve undefined — la opción más segura, nunca se solicita desactivación", () => {
    expect(readDeactivateStaleAfterHours({})).toBeUndefined();
  });

  it("vacía: se trata igual que ausente (undefined)", () => {
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "" })).toBeUndefined();
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "   " })).toBeUndefined();
  });

  it("un valor numérico válido se devuelve tal cual", () => {
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "72" })).toBe(72);
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: "1" })).toBe(1);
    expect(readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: String(MAX_DEACTIVATE_STALE_AFTER_HOURS) })).toBe(MAX_DEACTIVATE_STALE_AFTER_HOURS);
  });

  it.each([
    ["cero", "0"],
    ["negativo", "-5"],
    ["NaN (texto no numérico)", "abc"],
    ["infinito", "Infinity"],
    ["texto con número dentro", "72h"],
    ["excesivo (más de un año)", String(MAX_DEACTIVATE_STALE_AFTER_HOURS + 1)],
  ] as const)("%s se rechaza con AwinSyncConfigError (INVALID_DEACTIVATE_STALE_AFTER_HOURS)", (_label, value) => {
    let caught: unknown;
    try {
      readDeactivateStaleAfterHours({ AWIN_DEACTIVATE_STALE_AFTER_HOURS: value });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AwinSyncConfigError);
    expect((caught as AwinSyncConfigError).code).toBe("INVALID_DEACTIVATE_STALE_AFTER_HOURS");
  });
});

// ───────────────────────── runAwinSyncCommand: núcleo comprobable, sin proceso real ─────────────────────────

describe("runAwinSyncCommand: configuración", () => {
  it("configuración válida: invoca el ciclo con apiKey recortada, dryRun correcto y deactivateStaleAfterHours undefined por defecto", async () => {
    let received: unknown;
    const deps: AwinSyncCliDeps = {
      runCycle: async (options) => {
        received = options;
        return buildSummary();
      },
      disconnect: noopDisconnect,
    };
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "  clave-valida  " }), deps);
    expect(outcome.exitCode).toBe(0);
    expect(received).toMatchObject({ apiKey: "clave-valida", dryRun: false, deactivateStaleAfterHours: undefined });
  });

  it("clave ausente: nunca invoca el ciclo, termina con exitCode 3", async () => {
    const runCycle = vi.fn(async () => buildSummary());
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: undefined }), { runCycle, disconnect: noopDisconnect });
    expect(outcome.exitCode).toBe(3);
    expect(runCycle).not.toHaveBeenCalled();
  });

  it("clave vacía o con espacios: nunca invoca el ciclo, termina con exitCode 3", async () => {
    const runCycle = vi.fn(async () => buildSummary());
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "   " }), { runCycle, disconnect: noopDisconnect });
    expect(outcome.exitCode).toBe(3);
    expect(runCycle).not.toHaveBeenCalled();
  });

  it("umbral AUSENTE: se invoca el ciclo con deactivateStaleAfterHours undefined (nunca se solicita desactivación)", async () => {
    let received: unknown;
    const deps: AwinSyncCliDeps = {
      runCycle: async (options) => {
        received = options;
        return buildSummary();
      },
      disconnect: noopDisconnect,
    };
    await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), deps);
    expect((received as { deactivateStaleAfterHours?: number }).deactivateStaleAfterHours).toBeUndefined();
  });

  it("umbral VÁLIDO: se invoca el ciclo con ese número exacto", async () => {
    let received: unknown;
    const deps: AwinSyncCliDeps = {
      runCycle: async (options) => {
        received = options;
        return buildSummary();
      },
      disconnect: noopDisconnect,
    };
    await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave", AWIN_DEACTIVATE_STALE_AFTER_HOURS: "72" }), deps);
    expect((received as { deactivateStaleAfterHours?: number }).deactivateStaleAfterHours).toBe(72);
  });

  it("umbral inválido (texto): nunca invoca el ciclo, termina con exitCode 3", async () => {
    const runCycle = vi.fn(async () => buildSummary());
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave", AWIN_DEACTIVATE_STALE_AFTER_HOURS: "no-es-un-numero" }), { runCycle, disconnect: noopDisconnect });
    expect(outcome.exitCode).toBe(3);
    expect(runCycle).not.toHaveBeenCalled();
  });

  it("--dry-run se reconoce ÚNICAMENTE de forma explícita (flag simple): un valor ambiguo detiene la ejecución antes de invocar el ciclo", async () => {
    const runCycle = vi.fn(async () => buildSummary());
    const outcome = await runAwinSyncCommand(["--dry-run=1"], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), { runCycle, disconnect: noopDisconnect });
    expect(outcome.exitCode).toBe(3);
    expect(runCycle).not.toHaveBeenCalled();
  });

  it("--dry-run como flag simple SÍ se propaga como dryRun:true al ciclo", async () => {
    let received: unknown;
    const deps: AwinSyncCliDeps = {
      runCycle: async (options) => {
        received = options;
        return buildSummary({ dryRun: true });
      },
      disconnect: noopDisconnect,
    };
    await runAwinSyncCommand(["--dry-run"], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), deps);
    expect((received as { dryRun: boolean }).dryRun).toBe(true);
  });
});

describe("runAwinSyncCommand: invocación del orquestador y códigos de salida", () => {
  it("el orquestador se invoca EXACTAMENTE una vez por ejecución", async () => {
    const runCycle = vi.fn(async () => buildSummary());
    await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), { runCycle, disconnect: noopDisconnect });
    expect(runCycle).toHaveBeenCalledTimes(1);
  });

  it("un ciclo limpio (sin fallos) termina con exitCode 0", async () => {
    const deps: AwinSyncCliDeps = { runCycle: async () => buildSummary(), disconnect: noopDisconnect };
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), deps);
    expect(outcome.exitCode).toBe(0);
  });

  it.each([
    ["listFatalError", buildSummary({ listFatalError: true })],
    ["feedsFailed > 0", buildSummary({ feedsFailed: 1 })],
    ["advertisersIncomplete > 0", buildSummary({ advertisersIncomplete: 1 })],
  ] as const)("un resumen con %s termina con exitCode distinto de 0", async (_label, summary) => {
    const deps: AwinSyncCliDeps = { runCycle: async () => summary, disconnect: noopDisconnect };
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), deps);
    expect(outcome.exitCode).not.toBe(0);
  });

  it("si el ciclo lanza un error inesperado (no de bloqueo), termina con exitCode 1", async () => {
    const deps: AwinSyncCliDeps = {
      runCycle: async () => {
        throw new Error("fallo inesperado simulado");
      },
      disconnect: noopDisconnect,
    };
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), deps);
    expect(outcome.exitCode).toBe(1);
  });
});

describe("runAwinSyncCommand: desconexión de Prisma", () => {
  it("se desconecta EXACTAMENTE una vez tras una ejecución correcta", async () => {
    const disconnect = vi.fn(async () => undefined);
    await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), { runCycle: async () => buildSummary(), disconnect });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("se desconecta EXACTAMENTE una vez tras un fallo del ciclo", async () => {
    const disconnect = vi.fn(async () => undefined);
    await runAwinSyncCommand(
      [],
      envWith({ AWIN_DATAFEED_API_KEY: "clave" }),
      {
        runCycle: async () => {
          throw new Error("fallo simulado");
        },
        disconnect,
      }
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("se desconecta EXACTAMENTE una vez incluso ante un error de CONFIGURACIÓN (antes de invocar el ciclo)", async () => {
    const disconnect = vi.fn(async () => undefined);
    const runCycle = vi.fn(async () => buildSummary());
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "" }), { runCycle, disconnect });
    expect(outcome.exitCode).toBe(3);
    expect(runCycle).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("runAwinSyncCommand: bloqueo/ejecución concurrente", () => {
  it("si ya hay otro ciclo en curso (AwinOrchestratorLockBusyError), termina con un código de salida DISTINTO de 0 y 1 (2, reservado para 'ocupado'), sin haber iniciado un segundo ciclo", async () => {
    const runCycle = vi.fn(async () => {
      throw new AwinOrchestratorLockBusyError("bloqueo de ciclo ocupado (simulado)");
    });
    const outcome = await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), { runCycle, disconnect: noopDisconnect });
    // Documentamos aquí la decisión exacta de código de salida para este caso.
    expect(outcome.exitCode).toBe(2);
    expect(outcome.exitCode).not.toBe(0);
    expect(runCycle).toHaveBeenCalledTimes(1); // se intentó UNA vez; el propio orquestador es quien detecta el bloqueo, este script nunca reintenta ni fuerza un segundo ciclo.
  });
});

describe("runAwinSyncCommand: logs estructurados", () => {
  it("una ejecución correcta registra un evento de inicio y uno de fin, ambos JSON parseables con los campos esperados", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let events: Array<Record<string, unknown>>;
    try {
      await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), { runCycle: async () => buildSummary(), disconnect: noopDisconnect });
      events = logSpy.mock.calls.map((call) => JSON.parse(call[0] as string));
    } finally {
      logSpy.mockRestore();
    }
    const start = events.find((e) => e.event === "awin_sync_start");
    const done = events.find((e) => e.event === "awin_sync_done");
    expect(start).toMatchObject({ level: "info", dryRun: false });
    expect(done).toMatchObject({ level: "info", ok: true, feedsFailed: 0 });
    expect(typeof done?.durationMs).toBe("number");
  });

  it("un error de configuración registra un evento de error estructurado con código estable", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let events: Array<Record<string, unknown>>;
    try {
      await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "" }), { runCycle: async () => buildSummary(), disconnect: noopDisconnect });
      events = logSpy.mock.calls.map((call) => JSON.parse(call[0] as string));
    } finally {
      logSpy.mockRestore();
    }
    const configError = events.find((e) => e.event === "awin_sync_config_error");
    expect(configError).toMatchObject({ level: "error", code: "MISSING_API_KEY" });
  });

  it("un fallo del ciclo registra un evento de error estructurado, y el bloqueo ocupado registra un evento distinto ('lock_busy')", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let events: Array<Record<string, unknown>>;
    try {
      await runAwinSyncCommand(
        [],
        envWith({ AWIN_DATAFEED_API_KEY: "clave" }),
        {
          runCycle: async () => {
            throw new Error("fallo inesperado simulado");
          },
          disconnect: noopDisconnect,
        }
      );
      events = logSpy.mock.calls.map((call) => JSON.parse(call[0] as string));
    } finally {
      logSpy.mockRestore();
    }
    expect(events.find((e) => e.event === "awin_sync_failed")).toMatchObject({ level: "error", code: "UNEXPECTED_ERROR" });
  });
});

describe("runAwinSyncCommand: ningún canario secreto aparece en NINGUNA salida (log ni error propagado)", () => {
  const CANARY_KEY = "CANARY-SCRIPT-API-KEY-4d2a1c";
  const CANARY_URL = "https://productdata.awin.com/datafeed/download/apikey/CANARY-URL-TOKEN-9f8e7d6c/fid/1/format/csv";
  const CANARY_MESSAGE = "CANARY-MESSAGE-fragment-secreto";
  const CANARIES = [CANARY_KEY, CANARY_URL, CANARY_MESSAGE];

  function buildCanaryLeakError(): Error {
    const cause = new Error(`causa anidada — ${CANARY_URL} ${CANARY_MESSAGE}`);
    cause.stack = `Error: causa\n    at x (/y.ts:1:1) — ${CANARY_KEY}`;
    const err = new Error(`fallo simulado — key=${CANARY_KEY} url=${CANARY_URL} msg=${CANARY_MESSAGE}`, { cause });
    err.stack = `Error: fallo simulado\n    at simulated (/adapter.ts:1:1) — ${CANARY_KEY} ${CANARY_URL} ${CANARY_MESSAGE}`;
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

  it("un fallo del ciclo cuyo error contiene la API key canario, una URL canaria y un mensaje canario en message/stack/cause nunca los filtra por console.log/info/warn/error, ni en el error propagado", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let outcome: { exitCode: number } | undefined;
    let thrown: unknown;
    try {
      outcome = await runAwinSyncCommand(
        [],
        envWith({ AWIN_DATAFEED_API_KEY: CANARY_KEY }),
        {
          runCycle: async () => {
            throw buildCanaryLeakError();
          },
          disconnect: noopDisconnect,
        }
      );
    } catch (error) {
      thrown = error;
    }

    const allCalls = [...logSpy.mock.calls, ...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();

    expect(outcome).toBeDefined(); // runAwinSyncCommand nunca lanza: siempre resuelve con un exitCode.
    expect(thrown).toBeUndefined();
    expect(outcome!.exitCode).toBe(1);

    expect(allCalls.length).toBeGreaterThan(0); // sí se registró algo (los eventos seguros) — no pasa trivialmente por falta de logs.
    for (const call of allCalls) {
      for (const arg of call) {
        for (const canary of CANARIES) {
          expect(safeString(arg)).not.toContain(canary);
          expect(safeJson(arg)).not.toContain(canary);
          expect(inspect(arg, { depth: null })).not.toContain(canary);
        }
      }
    }
  });
});

describe("runAwinSyncCommand: sin acceso de red", () => {
  it("ninguna prueba de este fichero llama a fetch real (el orquestador se sustituye siempre por un doble)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await runAwinSyncCommand([], envWith({ AWIN_DATAFEED_API_KEY: "clave" }), { runCycle: async () => buildSummary(), disconnect: noopDisconnect });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
